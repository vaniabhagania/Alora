// Starts the test stack (fake Supabase backend + the real Vite dev server), runs the
// browser flows against it, and tears everything down.
//
//   node e2e/run.mjs                 run every area
//   node e2e/run.mjs tasks,journal   run some areas
//   node e2e/run.mjs --serve         just start the stack and keep it up (for iterating)
//
// Nothing here talks to a real Supabase project: the app is pointed at tools/fake-supabase.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PORT = process.env.FAKE_SUPABASE_PORT || '54321';
const APP_PORT = process.env.E2E_APP_PORT || '5173';
const API = `http://127.0.0.1:${API_PORT}`;
const APP = `http://127.0.0.1:${APP_PORT}`;
const serve = process.argv.includes('--serve');
const areas = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const children = [];
const stop = () => children.forEach((c) => { try { c.kill('SIGTERM'); } catch { /* already gone */ } });
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(130); });

async function up(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitFor(url, label, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await up(url)) return; await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`${label} did not start within ${ms / 1000}s`);
}
function start(cmd, args, env, label) {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {}); child.stderr.on('data', (d) => { if (process.env.E2E_VERBOSE) process.stderr.write(`[${label}] ${d}`); });
  child.on('exit', (code) => { if (code && !serve) console.error(`${label} exited with code ${code}`); });
  children.push(child);
}

if (!(await up(`${API}/__fake/health`))) start('node', ['tools/fake-supabase/server.mjs'], { FAKE_SUPABASE_PORT: API_PORT }, 'fake-supabase');
if (!(await up(APP))) {
  start('npx', ['vite', '--host', '127.0.0.1', '--port', APP_PORT, '--strictPort'],
    { VITE_SUPABASE_URL: API, VITE_SUPABASE_ANON_KEY: 'fake-anon-key-for-local-tests' }, 'vite');
}
await waitFor(`${API}/__fake/health`, 'fake backend');
await waitFor(APP, 'Vite dev server');
console.log(`stack ready — app ${APP}, fake backend ${API}`);

if (serve) { await new Promise(() => {}); }

const run = spawn('node', ['e2e/flows.mjs', ...(areas.length ? [areas.join(',')] : [])], { cwd: root, stdio: 'inherit', env: { ...process.env, E2E_APP_URL: APP, E2E_API_URL: API } });
run.on('exit', (code) => { stop(); process.exit(code ?? 1); });
