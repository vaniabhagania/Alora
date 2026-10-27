#!/usr/bin/env node
/**
 * Fake Supabase — a small in-memory stand-in for the parts of Supabase that
 * ALORA uses (PostgREST, GoTrue auth, Edge Functions, Storage), so the real
 * app can be exercised end-to-end in a real browser with no credentials.
 *
 * Fidelity comes from the REAL migrations: tables, column defaults, NOT NULL,
 * UNIQUE, CHECK ... IN (...), foreign keys with ON DELETE CASCADE / SET NULL
 * are all parsed out of supabase/migrations/*.sql, so this can't silently
 * drift from the schema. It also mimics RLS (rows are scoped to the caller's
 * user_id), PostgREST's 1000-row response cap, and "unknown column" errors.
 *
 * TEST FIXTURE ONLY. Nothing here ever touches a real database, and no data
 * created here is ever shown to a real user.
 *
 * Control endpoints (tests only):
 *   POST /__fake/reset                  wipe all data/users/storage/faults
 *   POST /__fake/config  {functionsMode:'ok'|'missing'|'error', latencyMs}
 *   POST /__fake/faults  [{table, method, status, times}]   fail next N matching requests; {"clear":true} drops pending ones
 *   POST /__fake/seed    {table, rows:[...], userEmail}     insert bypassing RLS
 *   POST /__fake/patch   {table, where:{col:val}, set:{...}}   update matching rows (bypassing RLS)
 *   GET  /__fake/dump/:table?email=...
 *   GET  /__fake/log     recent request log
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const MAX_ROWS = 1000; // PostgREST default max-rows on Supabase

// ---------------------------------------------------------------- schema ---
/** @type {Map<string, {cols: Map<string, any>, uniques: string[][]}>} */
const schema = new Map();

function splitTopLevel(body) {
  const parts = [];
  let depth = 0, cur = '', inStr = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") inStr = !inStr;
    if (!inStr) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseColumn(name, rest) {
  const typeMatch = rest.match(/^\s*([a-zA-Z_][\w]*(?:\s*\[\])?)/);
  const type = (typeMatch ? typeMatch[1] : 'text').replace(/\s+/g, '').toLowerCase();
  const col = { name, type, isArray: type.endsWith('[]'), notNull: false, default: undefined, ref: null, unique: false, check: null };
  if (/\bNOT\s+NULL\b/i.test(rest) || /\bPRIMARY\s+KEY\b/i.test(rest)) col.notNull = true;
  if (/\bUNIQUE\b/i.test(rest)) col.unique = true;
  const dm = rest.match(/\bDEFAULT\s+((?:'(?:[^']|'')*'(?:::[\w\[\]]+)?)|(?:[\w.]+\([^)]*\))|(?:-?\d+(?:\.\d+)?)|(?:true|false|null)|(?:current_date))/i);
  if (dm) col.default = dm[1];
  const rm = rest.match(/\bREFERENCES\s+([\w.]+)\s*\((\w+)\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL))?/i);
  if (rm) col.ref = { table: rm[1].replace(/^public\./, ''), column: rm[2], onDelete: (rm[3] || 'NO ACTION').toUpperCase().replace(/\s+/, ' ') };
  const cm = rest.match(/\bCHECK\s*\(\s*\w+\s+IN\s*\(([^)]*)\)\s*\)/i);
  if (cm) col.check = [...cm[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  return col;
}

function loadSchema() {
  schema.clear();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
    // CREATE TABLE
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(/gi;
    let m;
    while ((m = re.exec(sql))) {
      const table = m[1];
      let i = re.lastIndex, depth = 1, inStr = false;
      while (i < sql.length && depth > 0) {
        const ch = sql[i];
        if (ch === "'") inStr = !inStr;
        if (!inStr) { if (ch === '(') depth++; if (ch === ')') depth--; }
        i++;
      }
      const body = sql.slice(re.lastIndex, i - 1);
      if (schema.has(table)) continue;
      const entry = { cols: new Map(), uniques: [] };
      for (const raw of splitTopLevel(body)) {
        const line = raw.trim();
        if (!line) continue;
        const um = line.match(/^UNIQUE\s*\(([^)]*)\)/i);
        if (um) { entry.uniques.push(um[1].split(',').map((s) => s.trim())); continue; }
        if (/^(PRIMARY|CONSTRAINT|CHECK|FOREIGN)\b/i.test(line)) continue;
        const nm = line.match(/^"?(\w+)"?\s+([\s\S]*)$/);
        if (!nm) continue;
        const col = parseColumn(nm[1], nm[2]);
        entry.cols.set(col.name, col);
        if (col.unique) entry.uniques.push([col.name]);
      }
      schema.set(table, entry);
    }
    // ALTER TABLE ... ADD COLUMN
    const am = /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+([^;]+);/gi;
    while ((m = am.exec(sql))) {
      const t = schema.get(m[1]);
      if (t && !t.cols.has(m[2])) t.cols.set(m[2], parseColumn(m[2], m[3]));
    }
  }
}

// ------------------------------------------------------------------ state ---
let db, users, sessions, storage, faults, log, config;
function resetState() {
  db = new Map(); for (const t of schema.keys()) db.set(t, []);
  users = new Map(); sessions = new Map(); storage = new Map(); faults = []; log = [];
  config = { functionsMode: 'ok', latencyMs: 0 };
}

// ------------------------------------------------------------- utilities ---
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function makeSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: user.id, email: user.email, role: 'authenticated', exp })}.${crypto.randomBytes(8).toString('hex')}`;
  const refresh_token = crypto.randomBytes(12).toString('hex');
  sessions.set(access_token, user.id); sessions.set(refresh_token, user.id);
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token, user: publicUser(user) };
}
const publicUser = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created_at, created_at: u.created_at, app_metadata: { provider: 'email' }, user_metadata: {} });

function send(res, status, body, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  res.writeHead(status, headers);
  res.end(body === undefined ? '' : (typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)));
}
const pgErr = (res, status, code, message, details = null, hint = null) => send(res, status, { code, message, details, hint });

function evalDefault(col, uid) {
  const d = col.default;
  if (d === undefined) return undefined;
  if (/^gen_random_uuid\(\)$/i.test(d)) return crypto.randomUUID();
  if (/^(now\(\)|current_timestamp|timezone\(.*\))$/i.test(d) || /^now\(\)/i.test(d)) return new Date().toISOString();
  if (/^current_date$/i.test(d)) return new Date().toISOString().slice(0, 10);
  if (/^auth\.uid\(\)$/i.test(d)) return uid ?? null;
  if (/^null$/i.test(d)) return null;
  if (/^true$/i.test(d)) return true;
  if (/^false$/i.test(d)) return false;
  if (/^-?\d/.test(d)) return Number(d);
  const sm = d.match(/^'((?:[^']|'')*)'(?:::[\w\[\]]+)?$/);
  if (sm) {
    const s = sm[1].replace(/''/g, "'");
    if (col.isArray) { const inner = s.replace(/^\{|\}$/g, ''); return inner ? inner.split(',').map((x) => x.replace(/^"|"$/g, '')) : []; }
    if (col.type === 'jsonb' || col.type === 'json') { try { return JSON.parse(s); } catch { return s; } }
    return s;
  }
  return null;
}

function coerce(col, v) {
  if (v === null || v === undefined) return v;
  if (['int', 'integer', 'bigint', 'smallint', 'numeric', 'real', 'float', 'double'].some((t) => col.type.startsWith(t))) {
    const n = Number(v); return Number.isNaN(n) ? v : n;
  }
  return v;
}

// --------------------------------------------------------------- filters ---
function likeToRegex(p, ci) {
  const esc = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, ci ? 'i' : '');
}
function cmp(a, b) {
  if (a === null || a === undefined) return -1;
  if (typeof a === 'number' && !Number.isNaN(Number(b))) return a - Number(b);
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
function parseIn(v) {
  const inner = v.replace(/^\(|\)$/g, '');
  return inner.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}
function matches(row, f) {
  let val = row[f.col];
  let res;
  const arg = f.arg;
  switch (f.op) {
    case 'eq': res = String(val) === arg || (val === null && arg === 'null'); break;
    case 'neq': res = String(val) !== arg; break;
    case 'gt': res = val != null && cmp(val, arg) > 0; break;
    case 'gte': res = val != null && cmp(val, arg) >= 0; break;
    case 'lt': res = val != null && cmp(val, arg) < 0; break;
    case 'lte': res = val != null && cmp(val, arg) <= 0; break;
    case 'like': res = val != null && likeToRegex(arg, false).test(String(val)); break;
    case 'ilike': res = val != null && likeToRegex(arg, true).test(String(val)); break;
    case 'is': res = arg === 'null' ? val === null || val === undefined : arg === 'true' ? val === true : arg === 'false' ? val === false : false; break;
    case 'in': res = parseIn(arg).includes(String(val)); break;
    case 'cs': res = Array.isArray(val) && arg.replace(/^\{|\}$/g, '').split(',').every((x) => val.includes(x)); break;
    default: throw Object.assign(new Error(`unsupported operator ${f.op}`), { unsupported: true });
  }
  return f.negate ? !res : res;
}
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function parseFilters(params) {
  const filters = [];
  for (const [key, value] of params) {
    if (RESERVED.has(key)) continue;
    if (key === 'or' || key === 'and') throw Object.assign(new Error('or/and not supported by fake'), { unsupported: true });
    let v = value, negate = false;
    if (v.startsWith('not.')) { negate = true; v = v.slice(4); }
    const dot = v.indexOf('.');
    filters.push({ col: key, op: v.slice(0, dot), arg: v.slice(dot + 1), negate });
  }
  return filters;
}

// ----------------------------------------------------------- REST engine ---
function checkColumns(res, table, cols) {
  const t = schema.get(table);
  for (const c of cols) if (!t.cols.has(c)) { pgErr(res, 400, '42703', `column ${table}.${c} does not exist`); return false; }
  return true;
}
function applyFk(table, row, uid, res) {
  const t = schema.get(table);
  for (const col of t.cols.values()) {
    if (!col.ref || row[col.name] == null || col.ref.table === 'auth.users') continue;
    const parent = db.get(col.ref.table);
    if (parent && !parent.some((r) => r[col.ref.column] === row[col.name])) {
      pgErr(res, 409, '23503', `insert or update on table "${table}" violates foreign key constraint`, `Key (${col.name})=(${row[col.name]}) is not present in table "${col.ref.table}".`);
      return false;
    }
  }
  return true;
}
function violatesUnique(table, row, ignoreRow) {
  const t = schema.get(table);
  for (const set of t.uniques) {
    if (set.some((c) => row[c] == null)) continue;
    if (db.get(table).some((r) => r !== ignoreRow && set.every((c) => r[c] === row[c]))) return set.join(',');
  }
  return null;
}
function cascadeDelete(table, removed) {
  for (const [childName, child] of schema) {
    for (const col of child.cols.values()) {
      if (!col.ref || col.ref.table !== table) continue;
      const ids = new Set(removed.map((r) => r[col.ref.column]));
      const rows = db.get(childName);
      if (col.ref.onDelete === 'CASCADE') {
        const gone = rows.filter((r) => ids.has(r[col.name]));
        if (gone.length) { db.set(childName, rows.filter((r) => !ids.has(r[col.name]))); cascadeDelete(childName, gone); }
      } else if (col.ref.onDelete === 'SET NULL') {
        for (const r of rows) if (ids.has(r[col.name])) r[col.name] = null;
      }
    }
  }
}
function project(rows, selectParam, table, res) {
  if (!selectParam || selectParam === '*') return rows;
  if (/[()]/.test(selectParam)) { pgErr(res, 400, 'PGRST200', 'embedded resources are not supported by the fake backend'); return null; }
  const cols = selectParam.split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
  if (!checkColumns(res, table, cols)) return null;
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
}

function handleRest(req, res, table, url, bodyText, uid) {
  if (!schema.has(table)) return pgErr(res, 404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`);
  const t = schema.get(table);
  const method = req.method;
  const accept = req.headers['accept'] || '';
  const wantObject = accept.includes('vnd.pgrst.object+json');
  const prefer = req.headers['prefer'] || '';
  const wantRep = /return=representation/.test(prefer);
  const hasUser = t.cols.has('user_id');
  let filters;
  try { filters = parseFilters(url.searchParams); } catch (e) { return pgErr(res, 501, 'FAKE501', e.message); }
  if (!checkColumns(res, table, filters.map((f) => f.col))) return;

  const visible = () => db.get(table).filter((r) => !hasUser || (uid && r.user_id === uid));
  const respondRows = (status, rows) => {
    const proj = project(rows, url.searchParams.get('select'), table, res);
    if (proj === null) return;
    if (wantObject) {
      if (proj.length !== 1) return pgErr(res, 406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${proj.length} rows`);
      return send(res, status, proj[0]);
    }
    send(res, status, proj);
  };

  if (method === 'GET' || method === 'HEAD') {
    let rows = visible().filter((r) => filters.every((f) => matches(r, f)));
    const order = url.searchParams.get('order');
    if (order) {
      const keys = order.split(',').map((o) => { const [c, ...mods] = o.split('.'); return { c, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') }; });
      if (!checkColumns(res, table, keys.map((k) => k.c))) return;
      rows = [...rows].sort((a, b) => {
        for (const k of keys) {
          const av = a[k.c], bv = b[k.c];
          if (av == null && bv == null) continue;
          if (av == null) return k.nullsFirst || k.desc ? -1 : 1; // PG default: nulls last for ASC, first for DESC
          if (bv == null) return k.nullsFirst || k.desc ? 1 : -1;
          const c = cmp(av, bv); if (c) return k.desc ? -c : c;
        }
        return 0;
      });
    }
    const total = rows.length;
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Math.min(Number(url.searchParams.get('limit') || MAX_ROWS), MAX_ROWS);
    rows = rows.slice(offset, offset + limit);
    res.setHeader('Content-Range', `${rows.length ? offset : '*'}${rows.length ? `-${offset + rows.length - 1}` : ''}/${total}`);
    return respondRows(200, rows);
  }

  if (method === 'POST') {
    let payload;
    try { payload = JSON.parse(bodyText || '{}'); } catch { return pgErr(res, 400, 'PGRST102', 'Invalid JSON body'); }
    const items = Array.isArray(payload) ? payload : [payload];
    const isUpsert = /resolution=(merge|ignore)-duplicates/.test(prefer);
    const ignoreDup = /resolution=ignore-duplicates/.test(prefer);
    const onConflict = (url.searchParams.get('on_conflict') || '').split(',').filter(Boolean);
    if (hasUser && !uid) return pgErr(res, 401, '42501', `new row violates row-level security policy for table "${table}"`);
    const staged = [];
    for (const item of items) {
      if (!checkColumns(res, table, Object.keys(item).filter((k) => k !== '__proto__'))) return;
      if (hasUser && item.user_id && item.user_id !== uid) return pgErr(res, 403, '42501', `new row violates row-level security policy for table "${table}"`);
      const row = {};
      for (const col of t.cols.values()) {
        let v = item[col.name];
        if (v === undefined) v = evalDefault(col, uid);
        if (col.name === 'user_id' && hasUser) v = uid;
        row[col.name] = coerce(col, v === undefined ? null : v);
        if (col.notNull && (row[col.name] === null || row[col.name] === undefined)) {
          return pgErr(res, 400, '23502', `null value in column "${col.name}" of relation "${table}" violates not-null constraint`);
        }
        if (col.check && row[col.name] != null && !col.check.includes(row[col.name])) {
          return pgErr(res, 400, '23514', `new row for relation "${table}" violates check constraint "${table}_${col.name}_check"`);
        }
      }
      staged.push(row);
    }
    const out = [];
    for (const row of staged) {
      const conflictCols = onConflict.length ? onConflict : null;
      let existing = null;
      if (isUpsert) {
        const keys = conflictCols || (t.cols.has('id') ? ['id'] : []);
        existing = db.get(table).find((r) => keys.length && keys.every((k) => r[k] === row[k]) && (!hasUser || r.user_id === uid));
      }
      if (existing) {
        if (!ignoreDup) { for (const [k, v] of Object.entries(row)) if (items.some((it) => k in it)) existing[k] = v; out.push(existing); }
        continue;
      }
      const dup = violatesUnique(table, row, null);
      if (dup) return pgErr(res, 409, '23505', `duplicate key value violates unique constraint on (${dup})`, `Key (${dup}) already exists.`);
      if (!applyFk(table, row, uid, res)) return;
      db.get(table).push(row); out.push(row);
    }
    if (!wantRep) return send(res, 201);
    return respondRows(201, out);
  }

  if (method === 'PATCH') {
    let patch;
    try { patch = JSON.parse(bodyText || '{}'); } catch { return pgErr(res, 400, 'PGRST102', 'Invalid JSON body'); }
    if (!checkColumns(res, table, Object.keys(patch))) return;
    const rows = visible().filter((r) => filters.every((f) => matches(r, f)));
    for (const r of rows) {
      const next = { ...r };
      for (const [k, v] of Object.entries(patch)) {
        const col = t.cols.get(k);
        next[k] = coerce(col, v);
        if (col.notNull && next[k] == null) return pgErr(res, 400, '23502', `null value in column "${k}" of relation "${table}" violates not-null constraint`);
        if (col.check && next[k] != null && !col.check.includes(next[k])) return pgErr(res, 400, '23514', `new row for relation "${table}" violates check constraint "${table}_${k}_check"`);
      }
      if (t.cols.has('updated_at') && !('updated_at' in patch)) next.updated_at = new Date().toISOString();
      const dup = violatesUnique(table, next, r);
      if (dup) return pgErr(res, 409, '23505', `duplicate key value violates unique constraint on (${dup})`);
      if (!applyFk(table, next, uid, res)) return;
      Object.assign(r, next);
    }
    if (!wantRep) return send(res, 204);
    return respondRows(200, rows);
  }

  if (method === 'DELETE') {
    const rows = visible().filter((r) => filters.every((f) => matches(r, f)));
    const set = new Set(rows);
    db.set(table, db.get(table).filter((r) => !set.has(r)));
    cascadeDelete(table, rows);
    if (!wantRep) return send(res, 204);
    return respondRows(200, rows);
  }
  return pgErr(res, 405, 'FAKE405', `method ${method} not supported`);
}

// ------------------------------------------------------------- functions ---
function handleChatFunction(res, body, uid) {
  if (config.functionsMode === 'missing') return send(res, 404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
  if (config.functionsMode === 'error') return send(res, 500, { error: 'injected function failure' });
  if (body?.healthCheck) return send(res, 200, { ok: true, geminiKeyConfigured: true });
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const reply = `[fake-gemini] I received: ${String(last?.content ?? '').slice(0, 80)}`;
  // Mirror the real function: persist server-side into the conversation the client names
  // (string = continue, null = start new, absent = legacy 6-hour grouping); persist:false saves nothing.
  let conversationId = null;
  if (uid && last && body?.persist !== false) {
    const mine = db.get('chat_conversations').filter((c) => c.user_id === uid);
    let convo = typeof body?.conversationId === 'string' ? mine.find((c) => c.id === body.conversationId) : null;
    if (!convo && body?.conversationId === undefined) {
      const latest = [...mine].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
      if (latest && Date.now() - new Date(latest.updated_at).getTime() < 6 * 3600 * 1000) convo = latest;
    }
    if (!convo) {
      const t = schema.get('chat_conversations'); const row = {};
      for (const c of t.cols.values()) row[c.name] = evalDefault(c, uid) ?? null;
      row.user_id = uid; row.title = String(last.content).slice(0, 60) || 'New conversation';
      db.get('chat_conversations').push(row); convo = row;
    }
    convo.updated_at = new Date().toISOString();
    conversationId = convo.id;
    const t = schema.get('chat_messages');
    for (const [role, content] of [['user', String(last.content)], ['assistant', reply]]) {
      const row = {}; for (const c of t.cols.values()) row[c.name] = evalDefault(c, uid) ?? null;
      Object.assign(row, { user_id: uid, conversation_id: convo.id, role, content, metadata: role === 'assistant' ? { source: 'gemini' } : {} });
      db.get('chat_messages').push(row);
    }
  }
  return send(res, 200, { message: reply, insights: [], suggestedActions: [], conversationId });
}

// ------------------------------------------------------------------ main ---
function readBody(req) { return new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); }); }
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer, accept, accept-profile, content-profile, range, x-upsert, cache-control, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  const rawBody = await readBody(req);
  const bodyText = rawBody.toString('utf8');
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const uid = sessions.get(bearer) || null;
  const p = url.pathname;
  if (config.latencyMs && !p.startsWith('/__fake')) await new Promise((r) => setTimeout(r, config.latencyMs));

  try {
    // ---- control plane
    if (p === '/__fake/health') return send(res, 200, { ok: true, tables: schema.size });
    if (p === '/__fake/reset') { resetState(); return send(res, 200, { ok: true }); }
    if (p === '/__fake/config') { Object.assign(config, JSON.parse(bodyText || '{}')); return send(res, 200, config); }
    if (p === '/__fake/faults') {
      const body = JSON.parse(bodyText || '[]');
      if (!Array.isArray(body) && body.clear) faults.length = 0; // POST {"clear": true}
      else faults.push(...body.map((f) => ({ times: 1, ...f })));
      return send(res, 200, { pending: faults.length });
    }
    if (p === '/__fake/log') return send(res, 200, log.slice(-500));
    if (p === '/__fake/seed') {
      const { table, rows, userEmail } = JSON.parse(bodyText);
      const owner = [...users.values()].find((u) => u.email === userEmail);
      const t = schema.get(table); const out = [];
      for (const item of rows) {
        const row = {}; for (const c of t.cols.values()) row[c.name] = item[c.name] ?? evalDefault(c, owner?.id) ?? null;
        if (t.cols.has('user_id') && owner) row.user_id = owner.id;
        db.get(table).push(row); out.push(row);
      }
      return send(res, 200, out);
    }
    if (p === '/__fake/patch') {
      const { table, where = {}, set = {} } = JSON.parse(bodyText);
      let n = 0;
      for (const row of db.get(table)) if (Object.entries(where).every(([k, v]) => row[k] === v)) { Object.assign(row, set); n++; }
      return send(res, 200, { updated: n });
    }
    if (p.startsWith('/__fake/dump/')) {
      const table = p.split('/').pop(); const email = url.searchParams.get('email');
      const owner = email ? [...users.values()].find((u) => u.email === email) : null;
      return send(res, 200, db.get(table).filter((r) => !owner || !('user_id' in r) || r.user_id === owner.id));
    }

    // ---- fault injection (data plane only)
    const restMatch = p.match(/^\/rest\/v1\/(\w+)$/);
    const entry = { t: new Date().toISOString(), method: req.method, path: p + url.search, user: uid };
    log.push(entry); if (log.length > 2000) log.shift();
    if (restMatch) {
      const idx = faults.findIndex((f) => f.table === restMatch[1] && (!f.method || f.method === req.method));
      if (idx >= 0) {
        const f = faults[idx]; if (--f.times <= 0) faults.splice(idx, 1);
        entry.injected = true;
        return pgErr(res, f.status || 500, 'XX000', 'injected failure');
      }
    }

    // ---- GoTrue
    if (p === '/auth/v1/signup' && req.method === 'POST') {
      const { email, password } = JSON.parse(bodyText || '{}');
      if (!email || !password) return send(res, 422, { code: 422, error_code: 'validation_failed', msg: 'Signup requires a valid password' });
      if (password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      if (users.has(email.toLowerCase())) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      const user = { id: crypto.randomUUID(), email: email.toLowerCase(), password, created_at: new Date().toISOString() };
      users.set(user.email, user);
      return send(res, 200, makeSession(user));
    }
    if (p === '/auth/v1/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      const body = JSON.parse(bodyText || '{}');
      if (grant === 'password') {
        const user = users.get(String(body.email || '').toLowerCase());
        if (!user || user.password !== body.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return send(res, 200, makeSession(user));
      }
      if (grant === 'refresh_token') {
        const id = sessions.get(body.refresh_token); const user = [...users.values()].find((u) => u.id === id);
        if (!user) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
        return send(res, 200, makeSession(user));
      }
    }
    if (p === '/auth/v1/user') {
      const user = [...users.values()].find((u) => u.id === uid);
      if (!user) return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      if (req.method === 'PUT') { const b = JSON.parse(bodyText || '{}'); if (b.password) user.password = b.password; }
      return send(res, 200, publicUser(user));
    }
    if (p === '/auth/v1/logout') { if (bearer) sessions.delete(bearer); return send(res, 204); }
    if (p === '/auth/v1/recover' && req.method === 'POST') { entry.recover = JSON.parse(bodyText || '{}').email; return send(res, 200, {}); }

    // ---- Edge Functions
    if (p === '/functions/v1/alora-chat') return handleChatFunction(res, JSON.parse(bodyText || '{}'), uid);

    // ---- Storage
    let m;
    if ((m = p.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/))) {
      if (req.method === 'POST') return send(res, 200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=fake` });
      const f = storage.get(`${m[1]}/${decodeURIComponent(m[2])}`);
      return f ? send(res, 200, f.data, { 'Content-Type': f.type }) : send(res, 404, { error: 'not_found' });
    }
    if ((m = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)) && (req.method === 'POST' || req.method === 'PUT')) {
      if (!uid) return send(res, 401, { message: 'unauthorized' });
      storage.set(`${m[1]}/${decodeURIComponent(m[2])}`, { data: rawBody, type: req.headers['content-type'] || 'application/octet-stream' });
      return send(res, 200, { Key: `${m[1]}/${m[2]}` });
    }
    if ((m = p.match(/^\/storage\/v1\/object\/([^/]+)$/)) && req.method === 'DELETE') {
      for (const pre of JSON.parse(bodyText || '{}').prefixes || []) storage.delete(`${m[1]}/${pre}`);
      return send(res, 200, []);
    }
    if ((m = p.match(/^\/storage\/v1\/object\/(?:public\/|authenticated\/)?([^/]+)\/(.+)$/)) && req.method === 'GET') {
      const f = storage.get(`${m[1]}/${decodeURIComponent(m[2])}`);
      return f ? send(res, 200, f.data, { 'Content-Type': f.type }) : send(res, 404, { error: 'not_found' });
    }

    if (restMatch) return handleRest(req, res, restMatch[1], url, bodyText, uid);
    return send(res, 404, { message: `fake-supabase: no route for ${req.method} ${p}` });
  } catch (err) {
    console.error('[fake-supabase] error', err);
    return send(res, 500, { code: 'FAKE500', message: String(err?.message || err) });
  }
});

loadSchema();
resetState();
const PORT = Number(process.env.FAKE_SUPABASE_PORT || 54321);
server.listen(PORT, '127.0.0.1', () => console.log(`[fake-supabase] listening on :${PORT} — ${schema.size} tables parsed from migrations`));
