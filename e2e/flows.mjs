// ALORA end-to-end flow suite (real app in headless Chromium + fake Supabase).
// Usage: node e2e/flows.mjs [area[,area...]]   e.g.  node e2e/flows.mjs auth,tasks
// Every check asserts the CORRECT behaviour, including database state, so a
// FAIL is a real bug (or a regression), never an expectation of brokenness.
import { launch, signUp, gotoPage, resetBackend, dump, api, overflowX, shot, APP, API } from './lib.mjs';

const only = (process.argv[2] || '').split(',').filter(Boolean);
const results = [];
let currentArea = '';

class Fail extends Error {}
export const expect = (cond, msg) => { if (!cond) throw new Fail(msg); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Fail(`${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

async function check(id, title, fn) {
  const t0 = Date.now();
  let status = 'PASS', detail = '';
  try { detail = (await fn()) || ''; } catch (e) {
    status = 'FAIL'; detail = String(e.message || e).split('\n')[0].slice(0, 260);
    if (process.env.E2E_VERBOSE) console.log(String(e.message || e).split('\n').slice(0, 12).join('\n'));
  }
  results.push({ area: currentArea, id, title, status, detail });
  console.log(`${status === 'PASS' ? '✅' : '❌'} ${id.padEnd(34)} ${title}${status === 'FAIL' ? `\n      ↳ ${detail}` : ''}  (${Date.now() - t0}ms)`);
}

async function area(name, opts, body) {
  if (typeof opts === 'function') { body = opts; opts = {}; }
  if (only.length && !only.includes(name)) return;
  currentArea = name;
  console.log(`\n━━ ${name} ━━`);
  await resetBackend();
  const session = await launch({ mobile: !!opts.mobile, ...(opts.viewport ? {} : {}) });
  if (opts.viewport) await session.page.setViewportSize(opts.viewport);
  const creds = opts.noAuth ? null : await signUp(session.page, { email: `${name}@example.test` });
  await session.page.waitForTimeout(600);
  const ctx = {
    ...session, creds, mobile: !!opts.mobile, email: creds?.email,
    db: (t) => dump(t, creds?.email),
    seed: (table, rows) => api('/__fake/seed', { table, rows, userEmail: creds?.email }),
    patch: (table, where, set) => api('/__fake/patch', { table, where, set }),
    go: (label) => gotoPage(session.page, label, { mobile: !!opts.mobile }),
  };
  try { await body(ctx); } catch (e) { console.log(`   (area aborted: ${e.message.split('\n')[0]})`); results.push({ area: name, id: `${name}.ABORT`, title: 'area setup', status: 'FAIL', detail: e.message.split('\n')[0] }); }
  await session.browser.close();
}

// ---------- tiny UI helpers (work before AND after a11y fixes) ----------
export const field = (scope, label) => scope.locator(`div:has(> label:text-is("${label}"))`).locator('input, select, textarea').first();
export const row = (page, text) => page.locator('.glass-card.group', { hasText: text }).first();
export const iconBtn = (scope, cls) => scope.locator(`button:has(svg[class*="${cls}"])`).first();
export const toastText = (page) => page.locator('[role=status], [aria-live], .toast').first();
const sleep = (p, ms = 400) => p.waitForTimeout(ms);
export async function until(fn, what = 'condition', ms = 5000) {
  const t = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Fail(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 150)); }
}
/** Click a modal's primary button and require the modal to close (a failed save keeps it open). */
export async function submit(page, name) {
  await page.getByRole('button', { name, exact: true }).last().click();
  try { await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor({ state: 'detached', timeout: 5000 }); }
  catch { throw new Fail('modal stayed open after save (the save failed or was rejected)'); }
}
const today = () => new Date();
const IST_OFFSET = 330 * 60e3;
/**
 * The instant at h:m Asia/Kolkata wall-clock on (today + dayOffset). The browser under test runs in IST, so
 * "yesterday" / "later today" have to be calendar-correct there — "30 h ago" is yesterday at 23:00 but TWO
 * days ago at 00:30, which made these checks pass or fail depending on the hour the suite was started.
 */
const istAt = (dayOffset, h = 12, m = 0) => {
  const k = new Date(Date.now() + IST_OFFSET);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + dayOffset, h, m) - IST_OFFSET).toISOString();
};
const localInput = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

// =============================================================== AUTH ====
await area('auth', { noAuth: true }, async (c) => {
  const { page } = c;
  await check('auth.signup', 'Sign up creates account + profile with display name', async () => {
    await signUp(page, { name: 'Vania Test', email: 'auth1@example.test' });
    await sleep(page, 1200);
    const prof = await dump('alora_profiles', 'auth1@example.test');
    eq(prof.length, 1, 'one profile row');
    eq(prof[0].display_name, 'Vania Test', 'display name stored');
  });
  await check('auth.signout-signin', 'Sign out then sign in again', async () => {
    await page.getByRole('button', { name: /sign out/i }).first().click();
    await page.getByRole('button', { name: 'Sign In' }).first().waitFor({ timeout: 5000 });
    await page.getByPlaceholder('you@example.com').fill('auth1@example.test');
    await page.getByPlaceholder('At least 6 characters').fill('secret12');
    await page.locator('form button[type=submit]').click();
    await page.locator('nav:visible').first().waitFor({ timeout: 8000 });
  });
  await check('auth.bad-password', 'Wrong password shows a friendly error and stays on sign-in', async () => {
    await page.getByRole('button', { name: /sign out/i }).first().click();
    await page.getByPlaceholder('you@example.com').fill('auth1@example.test');
    await page.getByPlaceholder('At least 6 characters').fill('wrongpass');
    await page.locator('form button[type=submit]').click();
    await page.getByText(/invalid|incorrect|wrong/i).first().waitFor({ timeout: 5000 });
  });
  await check('auth.forgot-password', 'Password reset flow exists and calls /auth/v1/recover', async () => {
    const link = page.getByRole('button', { name: /forgot/i }).or(page.getByRole('link', { name: /forgot/i }));
    expect(await link.count() > 0, 'no "Forgot password?" control on the sign-in screen');
    await link.first().click();
    await page.getByPlaceholder('you@example.com').fill('auth1@example.test');
    await page.getByRole('button', { name: /send|reset/i }).first().click();
    await sleep(page, 600);
    const log = await api('/__fake/log');
    expect(log.some((l) => l.path.startsWith('/auth/v1/recover')), 'recover endpoint never called');
  });
  await check('auth.labels', 'Form inputs have associated labels + autocomplete', async () => {
    await page.goto(APP);
    await page.getByPlaceholder('you@example.com').waitFor({ timeout: 10000 });
    expect(await page.getByLabel('Email').count() === 1, 'Email input is not reachable via its <label>');
    const ac = await page.getByPlaceholder('you@example.com').getAttribute('autocomplete');
    expect(!!ac, 'email input has no autocomplete attribute (password managers)');
  });
});

// ============================================================== TASKS ====
await area('tasks', async (c) => {
  const { page } = c;
  await c.go('Tasks');
  await check('tasks.create', 'Create a task (title, priority, deadline today)', async () => {
    await page.getByRole('button', { name: /Add Task/ }).first().click();
    await page.getByPlaceholder('What needs to be done?').fill('Write essay');
    await field(page, 'Priority').selectOption('high');
    const d = today(); d.setHours(23, 0, 0, 0);
    await field(page, 'Deadline').fill(localInput(d));
    await submit(page, 'Create');
    await page.getByText('Write essay').first().waitFor({ timeout: 5000 });
    const rows = await c.db('tasks');
    eq(rows.length, 1, 'task row persisted'); eq(rows[0].priority, 'high', 'priority persisted');
  });
  await check('tasks.edit', 'Edit a task title', async () => {
    await iconBtn(row(page, 'Write essay'), 'pencil').click({ force: true });
    await page.getByPlaceholder('What needs to be done?').fill('Write history essay');
    await submit(page, 'Save');
    await page.getByText('Write history essay').first().waitFor({ timeout: 5000 });
    eq((await c.db('tasks'))[0].title, 'Write history essay', 'title persisted');
  });
  await check('tasks.complete', 'Complete sets status + completed_at; moves to Completed', async () => {
    await row(page, 'Write history essay').locator('button').first().click();
    await sleep(page, 700);
    const t = (await c.db('tasks'))[0];
    eq(t.status, 'completed', 'status'); expect(!!t.completed_at, 'completed_at not set');
    await page.getByRole('tab', { name: /^Completed/ }).click();
    await page.getByText('Write history essay').first().waitFor({ timeout: 4000 });
  });
  await check('tasks.uncomplete', 'Un-completing clears completed_at', async () => {
    await row(page, 'Write history essay').locator('button').first().click();
    await sleep(page, 700);
    const t = (await c.db('tasks'))[0];
    eq(t.status, 'todo', 'status back to todo'); eq(t.completed_at, null, 'completed_at cleared');
  });
  await check('tasks.link-fields', 'Task form can link a Goal / Identity / Course', async () => {
    await page.getByRole('button', { name: /Add Task/ }).first().click();
    const labels = (await page.locator('label').allInnerTexts()).join('|');
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(/goal/i.test(labels) && /identity|future/i.test(labels) && /course/i.test(labels), `task form has no link fields (labels: ${labels})`);
  });
  await check('tasks.today-excludes-overdue', '"Today" tab does not mix in overdue tasks', async () => {
    const y = istAt(-1, 12);
    await c.seed('tasks', [{ title: 'Old overdue thing', deadline: y, priority: 'low', status: 'todo' }]);
    await page.reload(); await sleep(page, 600);
    await page.getByRole('tab', { name: /^Today/ }).click();
    const visible = await page.getByText('Old overdue thing').count();
    eq(visible, 0, 'overdue task shown under Today');
    await page.getByRole('tab', { name: /^Overdue/ }).click();
    await page.getByText('Old overdue thing').first().waitFor({ timeout: 4000 });
  });
  await check('tasks.goal-progress-cascade', 'Completing / reopening / deleting a linked task moves the goal both ways', async () => {
    const [goal] = await c.seed('goals', [{ title: 'Ship the project' }]);
    await c.seed('tasks', [
      { title: 'Linked A', related_goal_id: goal.id, priority: 'low', status: 'todo' },
      { title: 'Linked B', related_goal_id: goal.id, priority: 'low', status: 'todo' },
    ]);
    await page.reload(); await sleep(page, 500);
    await page.getByRole('tab', { name: /^No Date/ }).click();
    await page.getByRole('checkbox', { name: /Linked A/ }).click();
    await until(async () => (await c.db('goals')).find((g) => g.id === goal.id)?.progress === 50, 'goal should be 50% after one of two linked tasks is done');
    await page.getByRole('tab', { name: /^Completed/ }).click();
    await page.getByRole('checkbox', { name: /Linked A/ }).click();
    await until(async () => (await c.db('goals')).find((g) => g.id === goal.id)?.progress === 0, 'goal progress did not go back down when the task was reopened');
    await page.getByRole('tab', { name: /^No Date/ }).click();
    await page.getByRole('checkbox', { name: /Linked A/ }).click();
    await until(async () => (await c.db('goals')).find((g) => g.id === goal.id)?.progress === 50, 'goal back to 50%');
    await page.getByRole('tab', { name: /^No Date/ }).click();
    await page.getByRole('button', { name: 'Delete Linked B' }).click({ force: true });
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await until(async () => { const g = (await c.db('goals')).find((x) => x.id === goal.id); return g.progress === 100 && g.status === 'completed'; }, 'deleting the only open task should finish the goal');
  });
  await check('tasks.link-persist', 'A task saved with a goal + course keeps both and shows them', async () => {
    await c.seed('goals', [{ title: 'Open goal' }]);
    const [course] = await (async () => {
      const [y] = await c.seed('academic_years', [{ label: 'Y1' }]);
      const [sem] = await c.seed('semesters', [{ label: 'S1', academic_year_id: y.id }]);
      return c.seed('courses', [{ name: 'Calculus', semester_id: sem.id }]);
    })();
    await page.reload(); await sleep(page, 400);
    await page.getByRole('button', { name: /Add Task/ }).first().click();
    await page.getByPlaceholder('What needs to be done?').fill('Problem set 3');
    await field(page, 'Goal').selectOption({ label: 'Open goal' });
    await field(page, 'Course').selectOption({ label: 'Calculus' });
    await submit(page, 'Create');
    await until(async () => { const t = (await c.db('tasks')).find((x) => x.title === 'Problem set 3'); return t?.related_course_id === course.id && !!t?.related_goal_id; }, 'links were not persisted');
    await page.getByText('Calculus').first().waitFor({ timeout: 4000 });
  });
  await check('tasks.new-task-lands-in-view', 'A task created outside the current tab jumps to the tab it belongs to', async () => {
    await page.getByRole('tab', { name: /^Upcoming/ }).click();
    await page.getByRole('button', { name: /Add Task/ }).first().click();
    await page.getByPlaceholder('What needs to be done?').fill('Floating idea');
    await submit(page, 'Create');
    await page.getByRole('tab', { name: /^No Date/, selected: true }).waitFor({ timeout: 4000 });
    await page.getByText('Floating idea').first().waitFor({ timeout: 4000 });
  });
  await check('tasks.complete-failure-rolls-back', 'A failed complete rolls the checkbox back and says so', async () => {
    await api('/__fake/faults', [{ table: 'tasks', method: 'PATCH', status: 500, times: 1 }]);
    const box = page.getByRole('checkbox', { name: /Floating idea/ });
    await box.click();
    await page.getByText(/Couldn't update that task/i).first().waitFor({ timeout: 5000 });
    await until(async () => (await box.getAttribute('aria-checked')) === 'false', 'checkbox stayed checked after the failed save');
  });
  await check('tasks.empty-title', 'Empty title is rejected inline', async () => {
    await page.getByRole('button', { name: /Add Task/ }).first().click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /title/i }).first().waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  await check('tasks.delete', 'Delete a task with confirmation', async () => {
    await page.getByRole('tab', { name: /^Overdue/ }).click();
    await page.getByRole('button', { name: 'Delete Old overdue thing' }).click({ force: true });
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await sleep(page, 600);
    eq((await c.db('tasks')).filter((t) => t.title === 'Old overdue thing').length, 0, 'task removed from DB');
  });
  await check('tasks.persist-failure', 'A failed save is reported, not faked as success', async () => {
    await api('/__fake/faults', [{ table: 'tasks', method: 'POST', status: 500 }]);
    await page.getByRole('button', { name: /Add Task/ }).first().click();
    await page.getByPlaceholder('What needs to be done?').fill('Should fail');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByText(/Couldn't create that task/i).first().waitFor({ timeout: 4000 });
    await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
  });
  await check('tasks.load-error', 'A failed load shows an error with Retry', async () => {
    await api('/__fake/faults', [{ table: 'tasks', method: 'GET', status: 500, times: 2 }]);
    await page.reload();
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('tab', { name: /^Today/ }).waitFor();
    eq(await page.getByRole('button', { name: 'Try again' }).count(), 0, 'error persisted after a successful retry');
  });
});

// ============================================================ JOURNAL ====
await area('journal', async (c) => {
  const { page } = c;
  await c.go('Journal');
  await check('journal.create', 'Create entry with mood + tags', async () => {
    await page.getByRole('button', { name: /New Entry/ }).first().click();
    await page.getByPlaceholder(/What's on your mind/).fill('Studied linear algebra today. Eigenvectors finally clicked!');
    await page.getByPlaceholder('growth, statistics, breakthrough').fill('math, breakthrough');
    await submit(page, 'Save Entry');
    const rows = await until(async () => { const r = await c.db('journal_entries'); return r.length ? r : null; }, 'journal row');
    eq(rows.length, 1, 'entry persisted'); eq(rows[0].tags, ['math', 'breakthrough'], 'tags parsed');
  });
  await check('journal.feeds-brain', 'Saving an entry logs a journal_created event for the brain (no silent duplicate memory)', async () => {
    await until(async () => (await c.db('activity_events')).some((e) => e.event_type === 'journal_created'), 'no journal_created activity event');
    eq((await c.db('memories')).length, 0, 'an entry was silently copied into memories (that would be a duplicate source of truth)');
  });
  await check('journal.remember', 'Remember saves one linked memory, and cannot be done twice', async () => {
    const entryId = (await c.db('journal_entries'))[0].id;
    await page.getByRole('button', { name: 'Remember this in Memory' }).first().click({ force: true });
    await until(async () => (await c.db('memories')).length === 1, 'memory not created');
    const m = (await c.db('memories'))[0];
    eq(m.related_journal_id, entryId, 'memory is not linked to its journal entry'); eq(m.source, 'journal', 'memory source');
    await page.getByText('Saved to Memory').first().waitFor({ timeout: 4000 });
    expect(await page.getByRole('button', { name: 'Already saved to Memory' }).first().isDisabled(), 'Remember can be pressed again');
    eq((await c.db('memories')).length, 1, 'duplicate memory after second look');
  });
  await check('journal.edit', 'Edit an entry', async () => {
    await page.getByRole('button', { name: 'Edit entry' }).first().click({ force: true });
    await page.getByPlaceholder(/What's on your mind/).fill('Edited: eigenvectors are about invariant directions.');
    await submit(page, 'Save');
    await until(async () => (await c.db('journal_entries'))[0]?.content.startsWith('Edited:'), 'edited content in DB');
  });
  await check('journal.empty-rejected', 'An empty entry is rejected inline', async () => {
    await page.getByRole('button', { name: /New Entry/ }).first().click();
    await page.getByRole('button', { name: 'Save Entry' }).click();
    await page.getByRole('alert').filter({ hasText: /write something/i }).first().waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  await check('journal.save-failure-keeps-text', 'A failed save keeps the text and says so', async () => {
    await api('/__fake/faults', [{ table: 'journal_entries', method: 'POST', status: 500, times: 1 }]);
    await page.getByRole('button', { name: /New Entry/ }).first().click();
    await page.getByPlaceholder(/What's on your mind/).fill('Do not lose me');
    await page.getByRole('button', { name: 'Save Entry' }).click();
    await page.getByText(/Your text is still here/).first().waitFor({ timeout: 5000 });
    eq(await page.getByPlaceholder(/What's on your mind/).inputValue(), 'Do not lose me', 'text after failed save');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  await check('journal.reflect-idempotent', 'Clicking Reflect twice does not duplicate insights', async () => {
    await c.seed('journal_entries', [{ content: 'Second entry about calculus practice' }, { content: 'Third entry: tired but made progress' }]);
    await page.reload(); await sleep(page, 700);
    const btn = page.getByRole('button', { name: /Reflect/ }).first();
    expect(await btn.count() > 0, 'no Reflect control');
    await btn.click(); await sleep(page, 800); await btn.click(); await sleep(page, 800);
    const ins = (await c.db('insights')).filter((i) => i.insight_type === 'journal_reflection');
    eq(ins.length, 1, `reflection insights saved: ${ins.map((i) => i.title).join(' | ')}`);
  });
  await check('journal.delete', 'Delete an entry', async () => {
    await row(page, 'Edited: eigenvectors').getByRole('button', { name: 'Delete entry' }).click({ force: true });
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await sleep(page, 600);
    eq((await c.db('journal_entries')).filter((e) => e.content.startsWith('Edited:')).length, 0, 'entry removed');
  });
  await check('journal.load-failure', 'A failed load is not presented as "journal is empty"', async () => {
    await api('/__fake/faults', [{ table: 'journal_entries', method: 'GET', status: 500, times: 2 }]);
    await page.reload(); await sleep(page, 900);
    const txt = await page.locator('main').innerText();
    expect(!/Your journal is empty/.test(txt), 'shows the happy empty-state although the load failed');
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('button', { name: /New Entry/ }).first().waitFor();
  });
});

// ============================================================= MEMORY ====
await area('memory', async (c) => {
  const { page } = c;
  await c.go('Memory');
  await check('memory.empty-state', 'Empty state invites the first memory', async () => {
    expect(await page.getByText('No memories yet').count() > 0, 'no empty state');
  });
  await check('memory.validation', 'Saving an empty memory shows an inline error, not a silent no-op', async () => {
    await page.getByRole('button', { name: /Add Memory/ }).first().click();
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await sleep(page, 300);
    expect(await page.getByRole('alert').filter({ hasText: /Write something/ }).count() > 0, 'no inline validation message');
    eq((await c.db('memories')).length, 0, 'an empty memory was saved');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  await check('memory.create', 'Add a memory (explicit, via the shared brain module)', async () => {
    await page.getByRole('button', { name: /Add Memory/ }).first().click();
    await page.getByPlaceholder('What do you want ALORA to remember?').fill('I study best in the early morning');
    await field(page, 'Category').selectOption('preferences');
    await submit(page, 'Save');
    const m = await until(async () => { const r = await c.db('memories'); return r.length ? r : null; }, 'memory row');
    eq(m.length, 1, 'memory persisted'); eq(m[0].category, 'preferences', 'category');
    eq(m[0].memory_type, 'explicit', 'user-written memories are explicit'); eq(m[0].status, 'active', 'status');
  });
  await check('memory.search', 'Search finds the memory', async () => {
    await page.getByPlaceholder('Search memories...').fill('morning');
    await sleep(page, 900);
    expect(await page.getByText(/early morning/).count() > 0, 'search did not return the memory');
    await page.getByPlaceholder('Search memories...').fill('');
  });
  await check('memory.dismissed-hidden', 'Dismissed memories are hidden from Active and listed under Hidden', async () => {
    await c.seed('memories', [{ content: 'Dismissed secret fact', category: 'personal', status: 'dismissed' }]);
    await page.reload(); await c.go('Memory'); await sleep(page, 700);
    eq(await page.getByText('Dismissed secret fact').count(), 0, 'dismissed memory still shown in Active');
    await page.getByRole('tab', { name: /Hidden/ }).click();
    expect(await page.getByText('Dismissed secret fact').count() > 0, 'dismissed memory missing from Hidden');
    await page.getByRole('tab', { name: 'Active' }).click();
  });
  await check('memory.has-controls', 'Memory cards expose dismiss / correct controls (and reinforce on inferred ones)', async () => {
    await c.seed('memories', [{ content: 'Alora thinks you procrastinate on Sundays', category: 'patterns', memory_type: 'inferred', confidence: 0.6 }]);
    await page.reload(); await c.go('Memory'); await sleep(page, 700);
    const card = row(page, 'procrastinate on Sundays');
    expect(await card.getByRole('button', { name: /dismiss/i }).count() > 0, 'no dismiss control');
    expect(await card.getByRole('button', { name: /correct|edit/i }).count() > 0, 'no correct/edit control');
    expect(await card.getByRole('button', { name: /reinforce/i }).count() > 0, 'no reinforce control on an inferred memory');
    expect(await card.getByText(/ALORA noticed/i).count() > 0, 'inferred memories are not labelled as such');
    expect(await card.getByText(/60% sure/).count() > 0, 'confidence not shown');
  });
  await check('memory.reinforce', 'Reinforcing an inferred memory raises its confidence and persists', async () => {
    await row(page, 'procrastinate on Sundays').getByRole('button', { name: /reinforce/i }).click({ force: true });
    const m = await until(async () => { const r = (await c.db('memories')).find((x) => /procrastinate/.test(x.content)); return r && Number(r.confidence) > 0.65 ? r : null; }, 'confidence not raised');
    expect(Number(m.confidence) > 0.65, 'confidence unchanged');
    expect((m.recurrence_count || 0) >= 1, 'recurrence not incremented');
  });
  await check('memory.correct', 'Rewriting an inferred memory makes it explicit (the user is the authority)', async () => {
    await row(page, 'procrastinate on Sundays').getByRole('button', { name: /correct|edit/i }).click({ force: true });
    await page.getByPlaceholder('What do you want ALORA to remember?').fill('I rest on Sundays on purpose');
    await submit(page, 'Save');
    const m = await until(async () => { const r = (await c.db('memories')).find((x) => /rest on Sundays/.test(x.content)); return r || null; }, 'corrected memory');
    eq(m.memory_type, 'explicit', 'corrected memory should be explicit');
    eq(Number(m.confidence), 1, 'corrected memory should be fully trusted');
    eq((await c.db('memories')).filter((x) => /procrastinate/.test(x.content)).length, 0, 'old wording lingers');
  });
  await check('memory.dismiss-restore', 'Dismiss moves a memory to Hidden; Restore brings it back', async () => {
    await row(page, 'rest on Sundays').getByRole('button', { name: /dismiss/i }).click({ force: true });
    await until(async () => (await c.db('memories')).find((x) => /rest on Sundays/.test(x.content))?.status === 'dismissed', 'status not persisted');
    eq(await page.getByText('I rest on Sundays on purpose').count(), 0, 'still visible in Active');
    await page.getByRole('tab', { name: /Hidden/ }).click();
    await row(page, 'rest on Sundays').getByRole('button', { name: /restore/i }).click({ force: true });
    await until(async () => (await c.db('memories')).find((x) => /rest on Sundays/.test(x.content))?.status === 'active', 'restore not persisted');
    await page.getByRole('tab', { name: 'Active' }).click();
    expect(await page.getByText('I rest on Sundays on purpose').count() > 0, 'restored memory not back in Active');
  });
  await check('memory.failed-save-rolls-back', 'A failed dismiss rolls back and tells the user', async () => {
    await api('/__fake/faults', [{ table: 'memories', method: 'PATCH', status: 500, times: 3 }]);
    await row(page, 'rest on Sundays').getByRole('button', { name: /dismiss/i }).click({ force: true });
    await sleep(page, 700);
    expect(await page.getByText(/Couldn't save that change/).count() > 0, 'no error toast');
    expect(await page.getByText('I rest on Sundays on purpose').count() > 0, 'row vanished although the save failed');
    await api('/__fake/faults', []);
  });
  await check('memory.delete', 'Delete a memory', async () => {
    // dispatchEvent: the previous check's error toast sits bottom-right, right where a forced coordinate click would land
    await row(page, 'early morning').getByRole('button', { name: 'Delete memory' }).dispatchEvent('click');
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await sleep(page, 600);
    eq((await c.db('memories')).filter((m) => /early morning/.test(m.content)).length, 0, 'memory removed');
  });
  await check('memory.load-failure', 'A failed load shows an error with retry, never "No memories yet"', async () => {
    await api('/__fake/faults', [{ table: 'memories', method: 'GET', status: 500, times: 2 }]);
    await page.reload(); await sleep(page, 900);
    const txt = await page.locator('main').innerText();
    expect(!/No memories yet/.test(txt), 'shows the empty state although the load failed');
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByText('I rest on Sundays on purpose').waitFor();
  });
});

// ============================================================== FUTURE ====
await area('future', async (c) => {
  const { page } = c;
  await c.go('My Future');
  await check('future.identity-crud', 'Identity: create → edit → delete', async () => {
    await page.getByRole('button', { name: /Create Identity|^Add Identity$/ }).first().click();
    await field(page, 'Name').fill('Data Scientist');
    await page.getByPlaceholder('What does this future self look like?').fill('Builds models that matter');
    await submit(page, 'Create');
    await until(async () => (await c.db('identities')).length === 1, 'identity row');
    await page.getByRole('button', { name: 'Edit Data Scientist' }).click();
    await field(page, 'Name').fill('Senior Data Scientist');
    await submit(page, 'Save');
    await until(async () => (await c.db('identities'))[0]?.name === 'Senior Data Scientist', 'identity edit was not persisted');
    await page.getByText('Senior Data Scientist').first().waitFor();
    await page.getByRole('button', { name: 'Delete Senior Data Scientist' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await until(async () => (await c.db('identities')).length === 0, 'identity not deleted');
  });
  await check('future.goal-crud', 'Goal: create (title column) → edit → delete', async () => {
    await page.getByRole('tab', { name: /^Goals/ }).click();
    await page.getByRole('button', { name: /Create Goal|^Add Goal$/ }).first().click();
    await field(page, 'Title').fill('Pass Linear Algebra');
    await submit(page, 'Create');
    await until(async () => (await c.db('goals')).length === 1, 'goal row (goal creation must persist)');
    await page.getByText('Pass Linear Algebra').first().waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Edit Pass Linear Algebra' }).click();
    await field(page, 'Title').fill('Ace Linear Algebra');
    await submit(page, 'Save');
    await until(async () => (await c.db('goals'))[0]?.title === 'Ace Linear Algebra', 'goal edit was not persisted');
    eq((await c.db('activity_events')).filter((e) => e.event_type === 'goal_created').length, 1, 'goal_created events');
  });
  await check('future.goal-empty-title', 'Goal: empty title is rejected inline', async () => {
    await page.getByRole('button', { name: /^Add Goal$/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /title/i }).first().waitFor();
    eq((await c.db('goals')).length, 1, 'goal count after an empty submit');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  await check('future.slider-stable', 'Goal progress slider is not unmounted mid-drag + persists + fires one event', async () => {
    const slider = page.getByRole('slider', { name: /Progress for Ace Linear Algebra/ });
    const handle = await slider.elementHandle();
    await slider.focus();
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60); }
    await sleep(page, 1200);
    expect(await handle.evaluate((el) => el.isConnected), 'slider element was destroyed and re-created while adjusting (drag would drop)');
    const g = (await c.db('goals'))[0];
    expect(g.progress >= 5, `progress not persisted (got ${g.progress})`);
    const evts = (await c.db('activity_events')).filter((e) => e.event_type === 'goal_progress_updated');
    expect(evts.length <= 2, `one adjustment produced ${evts.length} progress events`);
  });
  await check('future.slider-failure-reverts', 'A failed progress save rolls the slider back and says so', async () => {
    const before = (await c.db('goals'))[0].progress;
    await api('/__fake/faults', [{ table: 'goals', method: 'PATCH', status: 500, times: 1 }]);
    const slider = page.getByRole('slider', { name: /Progress for Ace Linear Algebra/ });
    await slider.fill('90');
    await page.getByText(/Couldn't save that progress/i).first().waitFor({ timeout: 6000 });
    await until(async () => Number(await slider.inputValue()) === before, 'slider did not roll back');
  });
  await check('future.goal-complete', 'Reaching 100% marks the goal completed', async () => {
    const slider = page.getByRole('slider', { name: /Progress for Ace Linear Algebra/ });
    await slider.fill('100');
    await until(async () => (await c.db('goals'))[0]?.status === 'completed', 'goal status not completed');
    await until(async () => (await c.db('activity_events')).filter((e) => e.event_type === 'goal_completed').length === 1, 'exactly one goal_completed event');
  });
  await check('future.goal-linked-derived', 'A goal with linked tasks shows task-driven progress instead of a slider', async () => {
    const [g] = await c.seed('goals', [{ title: 'Driven goal' }]);
    await c.seed('tasks', [
      { title: 'T1', related_goal_id: g.id, status: 'completed' },
      { title: 'T2', related_goal_id: g.id, status: 'pending' },
    ]);
    await page.reload(); await page.getByRole('tab', { name: /^Goals/ }).click();
    await page.getByText(/Driven by your linked tasks — 1 of 2 done/).waitFor();
    eq(await page.getByRole('slider', { name: /Progress for Driven goal/ }).count(), 0, 'slider shown for a task-driven goal');
  });
  await check('future.habit-crud', 'Habit: create → edit → delete', async () => {
    await page.getByRole('tab', { name: /^Habits/ }).click();
    await page.getByRole('button', { name: /Create Habit|^Add Habit$/ }).first().click();
    await field(page, 'Name').fill('Read 20 pages');
    await submit(page, 'Create');
    await page.getByText('Read 20 pages').first().waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Edit Read 20 pages' }).click();
    await field(page, 'Name').fill('Read 30 pages');
    await field(page, 'Frequency').selectOption('weekly');
    await submit(page, 'Save');
    await until(async () => { const h = (await c.db('habits'))[0]; return h?.name === 'Read 30 pages' && h?.frequency === 'weekly'; }, 'habit edit was not persisted');
  });
  await check('future.habit-local-date', 'Habit completion uses the LOCAL calendar day (IST edge case)', async () => {
    // 02:00 IST on 27 Oct == 20:30 UTC on 26 Oct — the UTC date is the wrong day.
    await page.clock.setFixedTime(new Date('2026-10-27T02:00:00+05:30'));
    await page.getByRole('checkbox', { name: /Read 30 pages/ }).click();
    await until(async () => String((await c.db('habits'))[0]?.last_completed).slice(0, 10) === '2026-10-27', 'last_completed recorded the UTC date, not the local one');
    eq((await c.db('habits'))[0].streak, 1, 'streak after first completion');
  });
  await check('future.habit-undo', 'Un-ticking a habit restores state and the tick is optimistic', async () => {
    await page.getByRole('checkbox', { name: /Read 30 pages/ }).click();
    await until(async () => (await c.db('habits'))[0]?.last_completed === null, 'undo not persisted');
    eq((await c.db('habits'))[0].streak, 0, 'streak after undo');
  });
  await check('future.habit-stale-streak', 'A habit missed for days shows no streak, not a stale number', async () => {
    const old = new Date(Date.now() - 4 * 86400e3).toISOString().slice(0, 10);
    await c.seed('habits', [{ name: 'Stale habit', streak: 9, last_completed: old, frequency: 'daily' }]);
    await page.clock.setFixedTime(new Date());
    await page.reload(); await page.getByRole('tab', { name: /^Habits/ }).click(); await sleep(page, 700);
    const txt = await row(page, 'Stale habit').innerText();
    expect(!/\b9\b/.test(txt), `still displays the stale 9-day streak: "${txt.replace(/\s+/g, ' ')}"`);
  });
  await check('future.no-skeleton-flash', 'Ticking a habit does not flash the loading skeleton', async () => {
    await page.evaluate(() => { window.__sk = 0; new MutationObserver(() => { if (document.querySelector('main .skeleton')) window.__sk++; }).observe(document.body, { childList: true, subtree: true }); });
    await page.getByRole('checkbox', { name: /Stale habit/ }).click(); await sleep(page, 800);
    eq(await page.evaluate(() => window.__sk), 0, 'skeleton appeared after a habit tick');
  });
  await check('future.load-error', 'A failed load shows an error with Retry, not an empty page', async () => {
    // times: 2 because React StrictMode (dev) runs the mount effect twice.
    await api('/__fake/faults', [{ table: 'identities', method: 'GET', status: 500, times: 2 }]);
    await page.reload();
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('tab', { name: /^Habits/ }).waitFor();
    eq(await page.getByRole('button', { name: 'Try again' }).count(), 0, 'error state persisted after a successful retry');
  });
});

// ================================================================ CHAT ====
await area('chat', async (c) => {
  const { page } = c;
  const aloraRequests = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/functions/v1/alora-chat')) { try { aloraRequests.push(JSON.parse(r.postData() || '{}')); } catch { /* not JSON */ } } });
  await c.go('Alora Chat');
  const box = () => page.getByLabel('Message to Alora');
  const send = async (text) => { await box().fill(text); await box().press('Enter'); };
  await check('chat.send', 'Send a message and receive a reply (persisted in one conversation)', async () => {
    await send('What should I study today?');
    await page.getByText(/fake-gemini|I received/).first().waitFor({ timeout: 9000 });
    const msgs = await c.db('chat_messages');
    expect(msgs.some((m) => m.role === 'user') && msgs.some((m) => m.role === 'assistant'), 'exchange not persisted');
    eq((await c.db('chat_conversations')).length, 1, 'one conversation expected');
  });
  await check('chat.same-conversation', 'A second message continues the same conversation', async () => {
    await send('And after that?');
    await page.getByText('I received: And after that?').waitFor({ timeout: 9000 });
    eq((await c.db('chat_conversations')).length, 1, 'follow-up started a new conversation');
    eq((await c.db('chat_messages')).length, 4, 'messages');
  });
  await check('chat.ime-enter', 'Enter during IME composition does not send', async () => {
    await box().fill('にほんご');
    const before = (await c.db('chat_messages')).length;
    await box().evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
    await sleep(page, 700);
    eq((await c.db('chat_messages')).length, before, 'composition-Enter sent the message');
    await box().fill('');
  });
  await check('chat.new-chat', 'New chat starts a separate conversation and leaves the old one intact', async () => {
    await page.getByRole('button', { name: 'New chat' }).click();
    eq(await page.getByText('And after that?').count(), 0, 'old messages still on screen');
    await send('Plan my weekend study');
    await page.getByText('I received: Plan my weekend study').waitFor({ timeout: 9000 });
    const convos = await c.db('chat_conversations');
    eq(convos.length, 2, 'new chat did not create a second conversation');
    const msgs = await c.db('chat_messages');
    eq(new Set(msgs.map((m) => m.conversation_id)).size, 2, 'messages not split across conversations');
  });
  await check('chat.history-open', 'History lists conversations and reopens an old one', async () => {
    await page.getByRole('button', { name: 'Conversation history' }).click();
    const dlg = page.locator('[role=dialog]');
    await dlg.getByText('Plan my weekend study').waitFor();
    expect(await dlg.getByText('What should I study today?').count() > 0, 'older conversation missing from history');
    expect(await dlg.getByText('Plan my weekend study').count() > 0, 'newer conversation missing from history');
    await dlg.getByText('What should I study today?').click();
    await page.getByText('And after that?').first().waitFor();
    eq(await page.getByText('Plan my weekend study').count(), 0, 'wrong conversation shown');
    await send('One more thought');
    await page.getByText('I received: One more thought').waitFor({ timeout: 9000 });
    const msgs = await c.db('chat_messages');
    const old = (await c.db('chat_conversations')).find((x) => /What should I study/.test(x.title));
    expect(msgs.filter((m) => m.conversation_id === old.id).length === 6, 'reply was saved into the wrong conversation');
  });
  await check('chat.history-delete', 'A conversation can be deleted (and its messages go with it)', async () => {
    await page.getByRole('button', { name: 'Conversation history' }).click();
    await page.getByRole('button', { name: /Delete conversation: Plan my weekend/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await sleep(page, 700);
    const convos = await c.db('chat_conversations');
    eq(convos.length, 1, 'conversation not deleted');
    eq(new Set((await c.db('chat_messages')).map((m) => m.conversation_id)).size, 1, 'orphaned messages remain');
    await page.keyboard.press('Escape');
  });
  await check('chat.askalora-clean', 'Ask Alora on another page answers but does not write into chat history', async () => {
    const before = { msgs: (await c.db('chat_messages')).length, convos: (await c.db('chat_conversations')).length };
    await c.seed('tasks', [{ title: 'Read chapter 4', priority: 'low' }]);
    await c.go('Tasks'); await page.reload(); await c.go('Tasks'); await sleep(page, 700);
    await page.getByRole('button', { name: /Ask Alora about/ }).first().click();
    await page.getByLabel(/Ask Alora about/).last().fill('Which should I do first?');
    await page.getByRole('button', { name: 'Send question' }).click();
    await page.getByRole('status').filter({ hasText: /fake-gemini|I received/ }).waitFor({ timeout: 9000 });
    eq((await c.db('chat_messages')).length, before.msgs, 'Ask Alora wrote into chat_messages');
    eq((await c.db('chat_conversations')).length, before.convos, 'Ask Alora created a conversation');
    eq(aloraRequests.at(-1).persist, false, 'Ask Alora did not ask for persist:false');
  });
  await check('chat.attachments-not-resent', 'An old image is not re-uploaded with every later message', async () => {
    await c.go('Alora Chat');
    await page.getByRole('button', { name: 'New chat' }).click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: png });
    await send('What is in this picture?');
    await page.getByText('I received: What is in this picture?').waitFor({ timeout: 9000 });
    await send('Thanks, and what next?');
    await page.getByText('I received: Thanks, and what next?').waitFor({ timeout: 9000 });
    const first = aloraRequests.find((r) => r.messages?.some((m) => /What is in this picture/.test(m.content)) && !r.messages.some((m) => /what next/.test(m.content)));
    const last = aloraRequests.at(-1);
    expect(first.messages.at(-1).attachments?.length === 1, 'the image was not sent with the message it belongs to');
    expect(last.messages.every((m) => !m.attachments?.length), 'the old image was sent again with a later message');
    expect(last.messages.some((m) => /diagram\.png/.test(m.content)), 'the model was not told an image was attached earlier');
  });
  await check('chat.attachment-only', 'Sending only an image gives it a truthful caption (no empty message)', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'only.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText('(Attached: only.png)').first().waitFor({ timeout: 9000 });
    await page.getByText('I received: (Attached: only.png)').waitFor({ timeout: 9000 });
    expect(!(await c.db('chat_messages')).some((m) => m.role === 'user' && m.content.trim() === ''), 'an empty user message was stored');
  });
  await check('chat.boot-error', 'A failed history load is an error with retry, not a fake blank slate', async () => {
    await api('/__fake/faults', [{ table: 'chat_conversations', method: 'GET', status: 500, times: 2 }]);
    await page.reload(); await c.go('Alora Chat'); await sleep(page, 900);
    expect(await page.getByRole('button', { name: 'Try again' }).count() > 0, 'no retry offered');
    await api('/__fake/faults', { clear: true });
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByText(/only\.png|Attached/).first().waitFor({ timeout: 6000 });
  });
  await check('chat.fallback-fast', 'With the edge function missing, chat falls back quickly, still answers, and still saves', async () => {
    await api('/__fake/config', { functionsMode: 'missing' });
    await page.reload(); await c.go('Alora Chat');
    await page.getByRole('button', { name: 'New chat' }).click();
    const before = (await c.db('chat_messages')).length;
    const t0 = Date.now();
    await send('hello there');
    await page.locator('main').getByText(/hello there/).first().waitFor({ timeout: 4000 });
    await page.getByLabel('Alora is thinking').waitFor({ state: 'detached', timeout: 8000 });
    expect(Date.now() - t0 < 6000, 'fallback took too long');
    await sleep(page, 500);
    expect((await c.db('chat_messages')).length >= before + 2, 'fallback exchange was not saved');
    await api('/__fake/config', { functionsMode: 'ok' });
  });
});

// ============================================================ SETTINGS ====
await area('settings', async (c) => {
  const { page } = c;
  await c.go('Settings');
  await check('settings.theme-persist', 'Dark mode applies and persists across reload without flashing light', async () => {
    await page.getByRole('button', { name: /dark/i }).first().click();
    await sleep(page, 700);
    const s = await c.db('settings');
    eq(s[0]?.theme_mode, 'dark', 'theme_mode persisted');
    await page.reload({ waitUntil: 'commit' });
    const firstPaintDark = await page.evaluate(() => new Promise((res) => {
      const read = () => res(document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark');
      requestAnimationFrame(() => requestAnimationFrame(read));
    }));
    expect(firstPaintDark, 'first paint after reload is light (theme only applied after the settings fetch)');
  });
  await c.go('Settings'); await sleep(page, 500);
  await check('settings.notifications-real', 'Nudges switch is wired to the database', async () => {
    const sw = page.getByRole('switch', { name: 'Show nudges on Home' });
    expect(await sw.count() > 0, 'switch not found');
    const before = (await c.db('settings'))[0]?.notifications_enabled ?? true;
    await sw.click();
    await until(async () => (await c.db('settings'))[0]?.notifications_enabled === !before, 'database never changed');
    expect((await sw.getAttribute('aria-checked')) === String(!before), 'switch state does not reflect the new value');
    await sw.click();
    await until(async () => (await c.db('settings'))[0]?.notifications_enabled === before, 'could not switch back');
  });
  await check('settings.save-failure-reverts', 'A failed settings save reverts the switch and tells the user', async () => {
    const sw = page.getByRole('switch', { name: 'Show nudges on Home' });
    const before = await sw.getAttribute('aria-checked');
    await api('/__fake/faults', [{ table: 'settings', method: 'POST', status: 500, times: 1 }]);
    await sw.click();
    await page.getByText(/Couldn't save/i).first().waitFor({ timeout: 6000 });
    await until(async () => (await sw.getAttribute('aria-checked')) === before, 'switch stayed in the wrong state after the failed save');
  });
  await check('settings.quiz-mix', 'Quiz mix saves to the database and survives reload', async () => {
    const slider = page.getByLabel('Weak spots');
    await slider.fill('60');
    await page.getByRole('button', { name: 'Save mix' }).click();
    await until(async () => (await c.db('settings'))[0]?.quiz_mix?.weak === 60, 'quiz_mix.weak was not persisted');
    await page.reload(); await c.go('Settings');
    eq(await page.getByLabel('Weak spots').inputValue(), '60', 'slider value after reload');
  });
  await check('settings.export-complete', 'Data export covers every user table', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: /Export All Data/ }).click()]);
    const body = JSON.parse(await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8'));
    const keys = Object.keys(body.data || body.tables || body);
    const missing = ['insights', 'activity_events', 'chat_conversations', 'chat_messages', 'settings', 'attachments'].filter((k) => !keys.includes(k));
    eq(missing, [], 'tables missing from export');
  });
  await check('settings.export-incomplete-warns', 'A table that fails to export is reported, not silently dropped', async () => {
    await api('/__fake/faults', [{ table: 'journal_entries', method: 'GET', status: 500, times: 1 }]);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('button', { name: /Export All Data/ }).click()]);
    expect(/INCOMPLETE/.test(dl.suggestedFilename()), `file name should flag an incomplete export, got ${dl.suggestedFilename()}`);
    await page.getByText(/incomplete/i).first().waitFor({ timeout: 6000 });
  });
  await check('settings.health-panel', 'System Health panel runs and reports', async () => {
    await page.getByRole('button', { name: /Run Health Check/ }).click();
    await page.getByText(/healthy|degraded|unhealthy/i).first().waitFor({ timeout: 8000 });
  });
});

// ----- shared academic fixture: Year → Semester → Course → Module → Topics (+ a class log) -----
async function seedAcademic(c, { topics } = {}) {
  const [y] = await c.seed('academic_years', [{ label: 'Year 1' }]);
  const [sem] = await c.seed('semesters', [{ label: 'Semester 1', academic_year_id: y.id }]);
  const [course] = await c.seed('courses', [{ name: 'Linear Algebra', semester_id: sem.id, color: '#6366f1' }]);
  const [course2] = await c.seed('courses', [{ name: 'Statistics', semester_id: sem.id, color: '#10b981', position: 1 }]);
  const [mod] = await c.seed('modules', [{ name: 'Foundations', course_id: course.id }]);
  const [mod2] = await c.seed('modules', [{ name: 'Basics', course_id: course2.id }]);
  const defs = topics || [
    { name: 'Eigenvectors', module_id: mod.id, confidence: 60, status: 'learning', is_weak: false },
    { name: 'Vector Spaces', module_id: mod.id, confidence: 40, status: 'learning', is_weak: true },
    { name: 'Eigenvectors', module_id: mod2.id, confidence: 70, status: 'learning', is_weak: false }, // same name, DIFFERENT course
  ];
  const tps = await c.seed('topics', defs);
  const [cls] = await c.seed('classes', [{ course_id: course.id, topic_id: tps[0].id, title: 'Lecture 3', session_date: new Date().toISOString() }]);
  await c.seed('class_logs', [{ class_id: cls.id, raw_thoughts: 'Eigenvectors keep their direction under the map. Eigenvalues scale them.', understanding_rating: 4, usefulness_rating: 4,
    learnings: ['Eigenvectors keep their direction under the transformation', 'Eigenvalues are the scale factors'], questions: ['Do all matrices have real eigenvalues?'], confusions: ['Complex eigenvalues'] }]);
  return { y, sem, course, course2, mod, mod2, topics: tps, cls };
}

// ================================================================ QUIZ ====
await area('quiz', async (c) => {
  const { page } = c;
  const fx = await seedAcademic(c);
  await page.reload(); await c.go('Daily Quiz'); await sleep(page, 700);

  async function generate() {
    await page.getByRole('button', { name: /Generate Today/ }).click();
    await page.getByRole('heading', { name: /Question 1 of/ }).waitFor({ timeout: 8000 });
  }
  /** Works through the quiz in the real UI: write an answer, peek at the notes, rate yourself. */
  async function takeQuiz(rating = /^Got it/, { submit = true } = {}) {
    const seen = [];
    for (let i = 0; i < 14; i++) {
      const head = await page.getByRole('heading', { name: /Question \d+ of \d+/ }).innerText();
      const [, cur, tot] = head.match(/Question (\d+) of (\d+)/).map(Number);
      const tag = (await page.locator('main span.rounded-full').first().innerText()).trim();
      const prompt = await page.locator('.glass-card p.text-lg').innerText();
      await page.getByLabel(/Your answer/).fill('Eigenvectors keep their direction; eigenvalues are the scale factors.');
      await page.getByRole('button', { name: /Show what I noted/ }).click();
      const reference = await page.locator('.glass-card .rounded-xl.border p.whitespace-pre-line').first().innerText();
      seen.push({ tag, prompt, reference });
      if (await page.getByRole('radio', { name: rating }).count()) await page.getByRole('radio', { name: rating }).click();
      if (cur === tot) { if (submit) await page.getByRole('button', { name: 'Submit Quiz' }).click(); break; }
      await page.getByRole('button', { name: /^Next/ }).click();
    }
    return seen;
  }
  let seen;
  await check('quiz.grounded-in-your-notes', 'Questions and references come from the student\'s own topics and notes (no canned filler)', async () => {
    await generate(); seen = await takeQuiz();
    const all = seen.map((q) => `${q.prompt} ${q.reference}`).join(' ');
    expect(!/unrelated mathematical theorem|historical event from the 1800s|type of data structure|foundational principle that underpins|General Knowledge/i.test(all), 'quiz contains canned placeholder text');
    expect(/Eigenvectors/.test(all), 'quiz never mentions the student\'s own topics');
    expect(seen.some((q) => /Eigenvectors keep their direction/.test(q.reference)), 'a question did not show the student\'s own class notes as the reference');
    await page.getByRole('heading', { name: 'Quiz Results' }).waitFor({ timeout: 8000 });
  });
  await check('quiz.self-rated-not-auto-graded', 'Written answers are never auto-marked wrong; the student\'s own rating decides', async () => {
    const rows = await c.db('quiz_questions');
    const graded = rows.filter((r) => r.question_type !== 'preview');
    expect(graded.length > 0, 'no graded questions persisted');
    expect(graded.every((r) => r.is_correct === true), `${graded.filter((r) => r.is_correct === false).length}/${graded.length} questions were stored as wrong although the student rated every one "Got it"`);
    expect(rows.every((r) => r.user_answer.includes('Eigenvectors keep their direction')), 'the typed answers were not stored');
  });
  await check('quiz.persisted-and-consistent', 'Attempt, questions and scores are persisted consistently', async () => {
    const att = await c.db('quiz_attempts'); const rows = await c.db('quiz_questions');
    eq(att.length, 1, 'one attempt');
    const graded = rows.filter((r) => r.question_type !== 'preview');
    eq(att[0].total_questions, graded.length, 'attempt total matches graded question rows');
    eq(att[0].correct_count, graded.filter((r) => r.is_correct === true).length, 'attempt.correct_count vs stored rows');
    eq(Number(att[0].score), 100, 'score when every question was rated "Got it"');
    expect((await page.locator('main').innerText()).includes('100'), 'results screen does not show the score');
  });
  await check('quiz.no-cross-course-contamination', 'Each quiz result updates only the topic it was about (same name in two courses stay separate)', async () => {
    const topics = await c.db('topics');
    const reviewTotal = topics.reduce((n, t) => n + t.review_count, 0);
    const gradedTopics = (await c.db('quiz_questions')).filter((r) => r.question_type !== 'preview').length;
    expect(topics.every((t) => t.review_count <= 1), `a topic was credited more than once for a single quiz: ${topics.map((t) => `${t.name}:${t.review_count}`).join(', ')}`);
    eq(reviewTotal, gradedTopics, 'total topic reviews should equal the number of graded questions answered');
    const stats = topics.find((x) => x.module_id === fx.mod2.id);
    expect(stats.confidence === 70 || stats.confidence === 80, `Statistics "Eigenvectors" has confidence ${stats.confidence}`);
  });
  await check('quiz.weak-topic-not-punished', 'Rating yourself "Got it" never lowers a weak topic\'s mastery', async () => {
    const t = (await c.db('topics')).find((x) => x.name === 'Vector Spaces');
    expect(t.confidence >= 40, `confidence fell 40 → ${t.confidence}`);
  });
  await check('quiz.partly-is-neutral', '"Partly" neither raises confidence nor records a mistake', async () => {
    const before = (await c.db('topics')).map((t) => ({ id: t.id, confidence: t.confidence, mistakes: t.mistakes.length }));
    await page.getByRole('button', { name: 'Back to Quiz' }).click();
    await generate(); await takeQuiz(/^Partly/);
    await page.getByRole('heading', { name: 'Quiz Results' }).waitFor({ timeout: 8000 });
    const after = await c.db('topics');
    for (const b of before) {
      const t = after.find((x) => x.id === b.id);
      eq([t.confidence, t.mistakes.length], [b.confidence, b.mistakes], `topic ${t.name} changed after an all-"Partly" quiz`);
    }
  });
  await check('quiz.missed-records-mistake', '"Missed it" lowers confidence and records what was missed', async () => {
    await page.getByRole('button', { name: 'Back to Quiz' }).click();
    await generate(); await takeQuiz(/^Missed it/);
    await page.getByRole('heading', { name: 'Quiz Results' }).waitFor({ timeout: 8000 });
    const t = await c.db('topics');
    expect(t.some((x) => x.mistakes.length > 0), 'no mistakes were recorded on any topic');
    expect(t.some((x) => x.is_weak), 'no topic was flagged weak');
  });
  await check('quiz.error-surfaced', 'A failed save is reported, keeps the answers, leaves no orphan quiz, and retry works', async () => {
    await page.getByRole('button', { name: 'Back to Quiz' }).click();
    const quizzesBefore = (await c.db('quizzes')).length;
    await api('/__fake/faults', [{ table: 'quiz_attempts', method: 'POST', status: 500 }]);
    await generate(); await takeQuiz(/^Got it/);
    await page.getByRole('alert').filter({ hasText: /couldn.t save/i }).first().waitFor({ timeout: 5000 });
    eq((await c.db('quizzes')).length, quizzesBefore, 'a half-saved quiz was left behind');
    expect(await page.getByRole('heading', { name: 'Quiz Results' }).count() === 0, 'showed results for a quiz that was not saved');
    expect(await page.getByRole('button', { name: 'Submit Quiz' }).isEnabled(), 'cannot retry the submit');
    await page.getByRole('button', { name: 'Submit Quiz' }).click();
    await page.getByRole('heading', { name: 'Quiz Results' }).waitFor({ timeout: 8000 });
    eq((await c.db('quizzes')).length, quizzesBefore + 1, 'retry should create exactly one quiz');
  });
  await check('quiz.exit-confirms', 'Leaving a quiz midway asks first and saves nothing', async () => {
    await page.getByRole('button', { name: 'Back to Quiz' }).click();
    const attemptsBefore = (await c.db('quiz_attempts')).length;
    await generate();
    await page.getByLabel(/Your answer/).fill('half way');
    await page.getByRole('button', { name: 'Exit quiz' }).click();
    await page.getByRole('button', { name: 'Leave quiz' }).click();
    await page.getByRole('button', { name: /Generate Today/ }).waitFor();
    eq((await c.db('quiz_attempts')).length, attemptsBefore, 'attempts after abandoning');
  });
  await check('quiz.mix-is-used', 'The mix chosen in Settings controls what the quiz contains', async () => {
    await c.go('Settings'); await sleep(page, 500);
    for (const [label, v] of [['Recent', '100'], ['Older', '0'], ['Weak spots', '0'], ['Upcoming', '0'], ['Lateral', '0']]) await page.getByLabel(label, { exact: true }).fill(v);
    await page.getByRole('button', { name: 'Save mix' }).click();
    await until(async () => (await c.db('settings'))[0]?.quiz_mix?.recent === 100, 'mix not saved');
    await c.go('Daily Quiz'); await sleep(page, 500);
    await generate(); seen = await takeQuiz(/^Got it/, { submit: false });
    expect(seen.length > 0 && seen.every((q) => q.tag === 'Recent'), `quiz contained other kinds of question than "Recent": ${[...new Set(seen.map((q) => q.tag))].join(', ')}`);
  });
});

await area('quiz-empty', async (c) => {
  const { page } = c;
  await c.go('Daily Quiz'); await sleep(page, 500);
  await check('quiz.empty-no-junk', 'A brand-new student is not given a fake quiz', async () => {
    const btn = page.getByRole('button', { name: /Generate Today/ });
    expect(await btn.isDisabled(), 'Generate is enabled with zero topics and zero notes');
    await sleep(page, 400);
    eq(await page.getByRole('heading', { name: /Question 1 of/ }).count(), 0, 'a quiz was generated from zero data');
    await page.getByText(/No learning data yet/).waitFor();
  });
});

// ============================================================= ACADEMIA ====
await area('academia', async (c) => {
  const { page } = c;
  const fx = await seedAcademic(c);
  await page.reload(); await c.go('Academia'); await sleep(page, 800);
  const openCourse = async (name) => {
    await page.getByRole('button', { name: /Structure/ }).click();
    await page.getByText('Year 1').first().waitFor();
    const target = page.getByText(name, { exact: true }).first();
    // The tree starts collapsed: open year → semester only if the course row isn't visible yet.
    for (const label of ['Year 1', 'Semester 1']) {
      if (await target.isVisible()) break;
      await page.getByText(label, { exact: true }).first().click();
      await sleep(page, 250);
    }
    await target.click(); await sleep(page, 400);
  };
  await check('academia.dashboard', 'Dashboard shows seeded courses', async () => {
    const txt = await page.locator('main').innerText();
    expect(/Linear Algebra/.test(txt), 'seeded course not visible on the dashboard');
  });
  await check('academia.log-class-validation', 'Logging with nothing filled in explains what is missing', async () => {
    await openCourse('Linear Algebra');
    await page.getByRole('button', { name: 'Classes', exact: true }).click();
    await page.getByRole('button', { name: /Log Class/ }).first().click();
    await page.getByLabel('Course').selectOption('');
    await page.getByRole('button', { name: 'Log Class', exact: true }).last().click();
    expect(await page.getByRole('alert').filter({ hasText: /Pick the course/ }).count() > 0, 'no inline course error');
    expect(await page.getByRole('alert').filter({ hasText: /Write a few words/ }).count() > 0, 'no inline thoughts error');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  const sizeBefore = {};
  await check('academia.log-class-feeds-brain', 'Logging a class updates the topic and the shared brain (event + topic + memory)', async () => {
    sizeBefore.logs = (await c.db('class_logs')).length;
    await page.getByRole('button', { name: /Log Class/ }).first().click();
    await page.getByLabel('Topic (optional)').selectOption({ label: 'Eigenvectors' });
    await page.getByLabel('Your raw thoughts').fill('Today we covered the rank-nullity theorem. I finally understood why dimensions add up.');
    await page.getByLabel(/Understanding/).fill('2');
    await page.getByLabel('Learnings').fill('dim V = rank + nullity');
    await page.getByLabel('Confusions').fill('why the kernel matters');
    await submit(page, 'Log Class');
    await sleep(page, 800);
    eq((await c.db('class_logs')).length, sizeBefore.logs + 1, 'class log not saved');
    expect((await c.db('activity_events')).some((e) => e.event_type === 'class_logged'), 'no class_logged activity event for the brain');
    const mem = (await c.db('memories')).filter((m) => m.source === 'class');
    eq(mem.length, 1, 'class memory');
    expect(/Learned: dim V = rank \+ nullity/.test(mem[0].content) && /Confused about: why the kernel matters/.test(mem[0].content), `memory should carry the student's own words, got: ${mem[0].content}`);
    eq(mem[0].related_course_id, fx.course.id, 'memory not linked to the course');
    eq(mem[0].importance, 'high', 'a low self-rating should raise importance');
    const topic = (await c.db('topics')).find((t) => t.id === fx.topics[0].id);
    expect(!!topic.last_studied, 'topic last_studied not set'); eq(topic.review_count, 1, 'topic review_count');
    eq(topic.is_weak, true, 'a self-rated 2/5 should flag the topic as weak');
  });
  await check('academia.class-memory-visible', 'The class shows up in the Memory page, labelled as coming from the student\'s own data', async () => {
    await c.go('Memory'); await sleep(page, 700);
    const card = row(page, 'rank + nullity');
    expect(await card.count() > 0, 'class memory not listed on the Memory page');
    expect(await card.getByText(/From your data/).count() > 0, 'not labelled as derived from data');
    await c.go('Academia');
  });
  await check('academia.log-class-rollback', 'If the notes fail to save, no empty class is left behind and the text is kept', async () => {
    await openCourse('Linear Algebra');
    await page.getByRole('button', { name: 'Classes', exact: true }).click();
    const classesBefore = (await c.db('classes')).length;
    await api('/__fake/faults', [{ table: 'class_logs', method: 'POST', status: 500, times: 1 }]);
    await page.getByRole('button', { name: /Log Class/ }).first().click();
    await page.getByLabel('Your raw thoughts').fill('This should not vanish');
    await page.getByRole('button', { name: 'Log Class', exact: true }).last().click();
    await page.getByText(/nothing was logged/).waitFor({ timeout: 6000 });
    await sleep(page, 400);
    eq((await c.db('classes')).length, classesBefore, 'an orphaned class row was left behind');
    eq(await page.getByLabel('Your raw thoughts').inputValue(), 'This should not vanish', 'typed text was lost');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  await check('academia.edit-class', 'A logged class can be edited, and its memory follows', async () => {
    await page.getByRole('button', { name: 'Edit class: Class Session' }).click();
    await page.getByLabel('Learnings').fill('dim V = rank + nullity\nrank is the image dimension');
    await submit(page, 'Save changes');
    await sleep(page, 700);
    const log = (await c.db('class_logs')).find((l) => /rank-nullity/.test(l.raw_thoughts));
    expect(log.learnings.length === 2, 'edited learnings not saved');
    const mem = (await c.db('memories')).filter((m) => m.source === 'class');
    eq(mem.length, 1, 'edit must update the memory, not add another');
    expect(/rank is the image dimension/.test(mem[0].content), 'memory not refreshed after editing the class');
  });
  await check('academia.state-kept-after-edit', 'Editing a course keeps you inside that course (no reset to skeleton/dashboard)', async () => {
    await page.getByRole('button', { name: 'Actions for Linear Algebra' }).click();
    await page.getByRole('menuitem', { name: 'Edit Course' }).click();
    await page.getByLabel('Name').fill('Linear Algebra II');
    await submit(page, 'Save');
    await sleep(page, 600);
    const txt = await page.locator('main').innerText();
    expect(/Linear Algebra II/.test(txt) && /Back to Structure/.test(txt), 'view reset after saving an edit');
    expect(await page.locator('main .skeleton').count() === 0, 'page fell back to a skeleton while reloading');
  });
  await check('academia.delete-class-removes-memory', 'Deleting a class removes the memory it created', async () => {
    await page.getByRole('button', { name: 'Delete class: Class Session' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await sleep(page, 800);
    eq((await c.db('memories')).filter((m) => m.source === 'class').length, 0, 'class memory survived the class');
  });
  await check('academia.load-failure', 'A failed load is an error with retry, not an empty academic brain', async () => {
    await api('/__fake/faults', [{ table: 'courses', method: 'GET', status: 500, times: 2 }]);
    await page.reload(); await sleep(page, 1200);
    expect(!/Your academic brain is empty/i.test(await page.locator('main').innerText()), 'shows an empty state although the load failed');
    await api('/__fake/faults', { clear: true });
    await page.getByRole('button', { name: 'Try again' }).click(); await sleep(page, 900);
    expect(/Linear Algebra II/.test(await page.locator('main').innerText()), 'retry did not bring the data back');
  });
  await check('academia.delete-course-cleans-memories', 'Deleting a course removes the class memories that belonged to it', async () => {
    await c.go('Academia');
    await openCourse('Linear Algebra II');
    await page.getByRole('button', { name: 'Classes', exact: true }).click();
    await page.getByRole('button', { name: /Log Class/ }).first().click();
    await page.getByLabel('Your raw thoughts').fill('Short class about bases.');
    await submit(page, 'Log Class'); await sleep(page, 700);
    eq((await c.db('memories')).filter((m) => m.source === 'class').length, 1, 'class memory created');
    await page.getByRole('button', { name: 'Actions for Linear Algebra II' }).click();
    await page.getByRole('menuitem', { name: 'Delete Course' }).click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await sleep(page, 900);
    eq((await c.db('courses')).filter((x) => x.name === 'Linear Algebra II').length, 0, 'course not deleted');
    eq((await c.db('memories')).filter((m) => m.source === 'class').length, 0, 'class memories outlived their course');
    expect(/Back to Structure/.test(await page.locator('main').innerText()) === false, 'still showing the deleted course');
  });
});

// ================================================================= NOVEL ====
await area('novel', async (c) => {
  const { page } = c;
  await c.go('Novel'); await sleep(page, 500);
  const dlg = () => page.getByRole('dialog');
  const toggleBtn = (name) => page.getByRole('button', { name: new RegExp(`^${name}: (expand|collapse)`) });
  const openNew = async (btn) => { await btn.click(); await dlg().waitFor(); };
  /** Rows expand/collapse like an accordion; tests care about "open", not about toggling. */
  const open = async (name) => { const b = toggleBtn(name); await b.waitFor(); if (await b.getAttribute('aria-expanded') !== 'true') await b.click(); };

  await check('novel.empty-state', 'A new student is invited to start a novel', async () => {
    expect(await page.getByText('Start your novel').count() === 1, 'no empty state');
  });

  await check('novel.project-validation', 'A project without a title is rejected inline', async () => {
    await openNew(page.getByRole('button', { name: /Create Novel Project/ }));
    await dlg().getByRole('button', { name: 'Create', exact: true }).click();
    expect(await dlg().getByRole('alert').filter({ hasText: /title/i }).count() === 1, 'no inline error');
    eq((await c.db('novel_projects')).length, 0, 'a nameless project was created');
  });

  await check('novel.project-create', 'Create a project (themes are tidied, duplicates removed)', async () => {
    await field(dlg(), 'Title').fill('  My Journey  ');
    await field(dlg(), 'Themes (comma-separated)').fill('growth, Growth, , resilience,');
    await submit(page, 'Create');
    const p = await until(async () => (await c.db('novel_projects'))[0], 'project not saved');
    eq(p.title, 'My Journey', 'title should be trimmed');
    eq(JSON.stringify(p.themes), JSON.stringify(['growth', 'resilience']), 'themes');
    await toggleBtn('My Journey').waitFor();
  });

  await check('novel.chapters-in-order', 'Chapters are numbered in the order they are added', async () => {
    await open('My Journey');
    for (const t of ['Arrival', 'Midterms', 'Breakthrough']) {
      await page.getByRole('button', { name: 'Add chapter to My Journey' }).click();
      await field(dlg(), 'Title').fill(t);
      await submit(page, 'Create');
      await until(async () => (await c.db('novel_chapters')).some((x) => x.title === t), `chapter ${t} not saved`);
    }
    const rows = (await c.db('novel_chapters')).sort((a, b) => a.position - b.position);
    eq(JSON.stringify(rows.map((r) => [r.title, r.position])), JSON.stringify([['Arrival', 1], ['Midterms', 2], ['Breakthrough', 3]]), 'positions');
    const shown = await page.getByRole('button', { name: /: (expand|collapse)$/ }).allInnerTexts();
    const order = ['Arrival', 'Midterms', 'Breakthrough'].map((t) => shown.findIndex((x) => x.includes(t)));
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1])), `chapters displayed out of order: ${shown.map((x) => x.split('\n')[0]).join(' | ')}`);
  });

  await check('novel.chapter-goes-to-the-project-you-are-in', 'A chapter added from a project lands in THAT project', async () => {
    await page.getByRole('button', { name: 'New Project' }).click();
    await field(dlg(), 'Title').fill('Second Book');
    await submit(page, 'Create');
    await open('Second Book');
    await page.getByRole('button', { name: 'Add chapter to Second Book' }).click();
    await field(dlg(), 'Title').fill('Book two, chapter one');
    await submit(page, 'Create');
    const rows = await until(async () => { const r = await c.db('novel_chapters'); return r.find((x) => x.title === 'Book two, chapter one') ? r : null; }, 'chapter not saved');
    const second = (await c.db('novel_projects')).find((p) => p.title === 'Second Book');
    eq(rows.find((x) => x.title === 'Book two, chapter one').novel_project_id, second.id, 'chapter went to the wrong project');
    eq(rows.find((x) => x.title === 'Book two, chapter one').position, 1, 'first chapter of a project is position 1');
  });

  await check('novel.scene-create-in-chapter', 'The "+" on a chapter adds a scene to that chapter, in order', async () => {
    await page.getByRole('button', { name: 'Add scene to Midterms' }).click();
    expect(await field(dlg(), 'Chapter').inputValue() !== '', 'no chapter selected');
    eq(await field(dlg(), 'Chapter').locator('option:checked').innerText(), 'Midterms', 'scene modal should default to the chapter you clicked');
    await field(dlg(), 'Title').fill('The night before');
    await field(dlg(), 'Raw Content').fill('I stayed up until 3am and the numbers finally made sense.');
    await submit(page, 'Create');
    await until(async () => (await c.db('novel_scenes')).length === 1, 'scene not saved');
    await page.getByRole('button', { name: 'Add scene to Midterms' }).click();
    await field(dlg(), 'Title').fill('The exam hall');
    await submit(page, 'Create');
    const sc = (await c.db('novel_scenes')).sort((a, b) => a.position - b.position);
    eq(JSON.stringify(sc.map((s) => [s.title, s.position])), JSON.stringify([['The night before', 1], ['The exam hall', 2]]), 'scene positions');
  });

  await check('novel.scene-feeds-brain-without-text', 'Saving a scene tells the brain it happened — without copying the story into events', async () => {
    const ev = await until(async () => { const e = (await c.db('activity_events')).filter((x) => x.event_type === 'novel_scene_saved'); return e.length >= 2 ? e : null; }, 'no novel_scene_saved events');
    expect(!JSON.stringify(ev).includes('3am'), 'scene text leaked into the event log');
  });

  await check('novel.no-fake-curation', 'There is no "Curate with AI" button that invents feedback', async () => {
    await page.getByRole('button', { name: 'Edit scene: The night before' }).click();
    await dlg().waitFor();
    eq(await page.getByRole('button', { name: /Curate with AI/ }).count(), 0, 'fake curation button still present');
    await dlg().getByRole('button', { name: 'Cancel' }).click();
  });

  await check('novel.edit-keeps-curated-layer', "Editing a scene's raw text keeps the writer's curated layer", async () => {
    await page.getByRole('button', { name: 'Edit scene: The night before' }).click();
    await field(dlg(), 'Curated Story (optional)').fill('At 3am the numbers stopped fighting me.');
    await submit(page, 'Save');
    await until(async () => (await c.db('novel_scenes')).find((s) => s.title === 'The night before')?.curated_content.startsWith('At 3am'), 'curated text not saved');
    await page.getByRole('button', { name: 'Edit scene: The night before' }).click();
    await field(dlg(), 'Raw Content').fill('I stayed up until 3am; the numbers finally clicked.');
    await submit(page, 'Save');
    await until(async () => (await c.db('novel_scenes')).find((s) => s.title === 'The night before')?.raw_content.includes('clicked'), 'raw edit not saved');
    const s = (await c.db('novel_scenes')).find((x) => x.title === 'The night before');
    eq(s.curated_content, 'At 3am the numbers stopped fighting me.', 'curated layer was wiped by editing the raw text');
  });

  await check('novel.legacy-placeholder-hidden', 'Old canned "AI suggestions" are not shown as if they were feedback', async () => {
    const chapter = (await c.db('novel_chapters')).find((x) => x.title === 'Arrival');
    await c.seed('novel_scenes', [{ chapter_id: chapter.id, title: 'Legacy scene', raw_content: 'Orientation day was loud.', curated_content: 'Orientation day was loud.', position: 1,
      ai_suggestions: [{ type: 'grammar', content: 'Consider tightening this sentence for impact.' }, { type: 'context', content: 'Adding sensory detail here would ground the reader.' }] }]);
    await page.reload(); await sleep(page, 700);
    await open('My Journey'); await open('Arrival');
    const body = await page.locator('main').innerText();
    expect(body.includes('Legacy scene'), 'legacy scene not shown');
    expect(!/Consider tightening this sentence/.test(body), 'canned suggestion still displayed');
    eq(await page.getByText('Curated story').count() >= 1 ? 1 : 0, 1, 'sanity: the real scene with a curated layer is displayed');
    await page.getByRole('button', { name: 'Edit scene: Legacy scene' }).click();
    eq(await field(dlg(), 'Curated Story (optional)').inputValue(), '', 'placeholder copy of the raw text was offered as the curated layer');
    await submit(page, 'Save');
    const s = await until(async () => { const x = (await c.db('novel_scenes')).find((r) => r.title === 'Legacy scene'); return x && x.ai_suggestions.length === 0 ? x : null; }, 'placeholder suggestions not cleared on save');
    eq(s.curated_content, '', 'curated content after save');
    eq(s.raw_content, 'Orientation day was loud.', 'raw memory must be untouched');
  });

  await check('novel.source-memory', 'A scene can start from a journal entry without altering it', async () => {
    await c.seed('journal_entries', [{ content: 'Today I finally understood eigenvectors.', mood: 'happy', is_novel_eligible: true }]);
    await page.reload(); await sleep(page, 700);
    await open('My Journey');
    await page.getByRole('button', { name: 'Add scene to Breakthrough' }).click();
    await field(dlg(), 'Title').fill('Eigen-day');
    await field(dlg(), 'Source Memory (optional)').selectOption({ index: 1 });
    eq(await field(dlg(), 'Raw Content').inputValue(), 'Today I finally understood eigenvectors.', 'raw content should be copied from the journal');
    await submit(page, 'Create');
    const s = await until(async () => (await c.db('novel_scenes')).find((r) => r.title === 'Eigen-day'), 'scene not saved');
    const j = (await c.db('journal_entries'))[0];
    eq(s.source_memory_id, j.id, 'source link');
    eq(j.content, 'Today I finally understood eigenvectors.', 'journal entry must not change');
  });

  await check('novel.save-failure-keeps-text', 'A failed save keeps the writer’s words and says so', async () => {
    await page.getByRole('button', { name: 'Add scene to Arrival' }).click();
    await field(dlg(), 'Title').fill('Unsaved scene');
    await field(dlg(), 'Raw Content').fill('Do not lose this paragraph.');
    await api('/__fake/faults', [{ table: 'novel_scenes', method: 'POST', status: 500 }]);
    await dlg().getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /Couldn.t save the scene/ }).first().waitFor({ timeout: 4000 });
    eq(await field(dlg(), 'Raw Content').inputValue(), 'Do not lose this paragraph.', 'text was lost');
    eq((await c.db('novel_scenes')).filter((s) => s.title === 'Unsaved scene').length, 0, 'a scene was saved despite the failure');
    await api('/__fake/faults', { clear: true });
    await submit(page, 'Create');
    await until(async () => (await c.db('novel_scenes')).some((s) => s.title === 'Unsaved scene'), 'retry did not save');
  });

  await check('novel.edit-chapter-and-project', 'Chapters and projects can be edited', async () => {
    await page.getByRole('button', { name: 'Edit chapter: Arrival' }).click();
    await field(dlg(), 'Title').fill('Arrival (revised)');
    await field(dlg(), 'Status').selectOption('revising');
    await submit(page, 'Save');
    await until(async () => { const r = (await c.db('novel_chapters')).find((x) => x.title === 'Arrival (revised)'); return r && r.status === 'revising'; }, 'chapter edit not saved');
    eq((await c.db('novel_chapters')).find((x) => x.title === 'Arrival (revised)').position, 1, 'editing must not renumber the chapter');
    await page.getByRole('button', { name: 'Edit project: Second Book' }).click();
    await field(dlg(), 'Description').fill('A sequel.');
    await submit(page, 'Save');
    await until(async () => (await c.db('novel_projects')).find((p) => p.title === 'Second Book')?.description === 'A sequel.', 'project edit not saved');
  });

  await check('novel.delete-warns-and-cascades', 'Deleting a chapter says what else goes with it, then removes it', async () => {
    const scenesBefore = (await c.db('novel_scenes')).filter((s) => s.title === 'The night before' || s.title === 'The exam hall').length;
    expect(scenesBefore === 2, 'precondition');
    await page.getByRole('button', { name: 'Delete chapter: Midterms' }).click();
    const text = await page.getByRole('dialog').innerText();
    expect(/also deletes its 2 scenes/.test(text), `no cascade warning: "${text.replace(/\s+/g, ' ').slice(0, 160)}"`);
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await until(async () => !(await c.db('novel_chapters')).some((x) => x.title === 'Midterms'), 'chapter not deleted');
    eq((await c.db('novel_scenes')).filter((s) => s.title === 'The exam hall').length, 0, 'scenes should go with the chapter');
  });

  await check('novel.delete-failure', 'A failed delete keeps the item and tells the writer', async () => {
    await api('/__fake/faults', [{ table: 'novel_chapters', method: 'DELETE', status: 500 }]);
    await page.getByRole('button', { name: 'Delete chapter: Breakthrough' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /Couldn.t delete/ }).first().waitFor({ timeout: 4000 });
    expect((await c.db('novel_chapters')).some((x) => x.title === 'Breakthrough'), 'chapter vanished although delete failed');
    await api('/__fake/faults', { clear: true });
  });

  await check('novel.project-delete', 'Deleting a project removes its chapters and scenes', async () => {
    await page.getByRole('button', { name: 'Delete project: My Journey' }).click();
    expect(/also deletes its \d+ chapters? and \d+ scenes?/.test(await page.getByRole('dialog').innerText()), 'no cascade warning for project');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await until(async () => !(await c.db('novel_projects')).some((p) => p.title === 'My Journey'), 'project not deleted');
    eq((await c.db('novel_chapters')).filter((x) => ['Arrival (revised)', 'Breakthrough'].includes(x.title)).length, 0, 'chapters should cascade');
    expect((await c.db('novel_projects')).some((p) => p.title === 'Second Book'), 'the other project must survive');
  });

  await check('novel.no-skeleton-flash', 'Saving does not blank the page or collapse what is open', async () => {
    await open('Second Book');
    await page.getByRole('button', { name: 'Edit project: Second Book' }).click();
    await field(dlg(), 'Description').fill('Still a sequel.');
    await dlg().getByRole('button', { name: 'Save', exact: true }).click();
    await dlg().waitFor({ state: 'detached' });
    eq(await toggleBtn('Second Book').getAttribute('aria-expanded'), 'true', 'project collapsed after a save');
    eq(await page.getByLabel('Loading your novel').count(), 0, 'skeleton flashed');
  });

  await check('novel.load-error', 'A failed load is an error with retry — never an empty novel', async () => {
    await api('/__fake/faults', [{ table: 'novel_scenes', method: 'GET', status: 500, times: 2 }]);
    await page.reload();
    await page.getByRole('button', { name: 'Try again' }).click();
    await toggleBtn('Second Book').waitFor({ timeout: 6000 });
    eq(await page.getByText('Start your novel').count(), 0, 'empty state shown after a successful retry');
  });
});

// ================================================================ WORLDS ====
await area('worlds', async (c) => {
  const { page } = c;
  const MARKER = '​__alora_monthly_auto__​';
  const dlg = () => page.getByRole('dialog');
  const toastAlert = (re) => page.getByRole('alert').filter({ hasText: re }).first();
  const card = (name) => page.locator('li.world-preview', { hasText: name });
  /** The action bar slides up only while the card is hovered / focused (like a real mouse user would). */
  const act = async (name, label) => { await card(name).first().hover(); await page.getByRole('button', { name: label, exact: true }).click(); };
  const worlds = async () => (await c.db('worlds')).sort((a, b) => a.position - b.position);
  const createWorldUI = async (name, desc = '') => {
    await page.getByRole('button', { name: /Create New World/ }).click();
    await field(dlg(), 'World Name').fill(name);
    if (desc) await field(dlg(), /Short Description/.test('') ? '' : 'Short Description (optional)').fill(desc);
    await dlg().getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('button', { name: 'Back to all worlds' }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Back to all worlds' }).click();
    await card(name).waitFor();
  };
  await c.go('Vibe'); await sleep(page, 600);

  await check('worlds.no-invented-vibe', 'A brand-new account is not handed a made-up monthly world', async () => {
    eq((await worlds()).length, 0, 'a world was created before the student wrote anything');
    expect(await page.getByText('No worlds yet').count() === 1, 'empty state missing');
  });

  await check('worlds.create-validation', 'A world needs a name — said inline, nothing created', async () => {
    await page.getByRole('button', { name: /Create New World/ }).click();
    await dlg().getByRole('button', { name: 'Create', exact: true }).click();
    expect(await dlg().getByRole('alert').filter({ hasText: /name/i }).count() === 1, 'no inline error');
    eq((await worlds()).length, 0, 'a nameless world was created');
    await dlg().getByRole('button', { name: 'Cancel' }).click();
  });

  await check('worlds.double-submit', 'Pressing Enter twice creates ONE world', async () => {
    await page.getByRole('button', { name: /Create New World/ }).click();
    await field(dlg(), 'World Name').fill('Rainy Nights');
    await field(dlg(), 'World Name').press('Enter');
    await field(dlg(), 'World Name').press('Enter').catch(() => {});
    await page.getByRole('button', { name: 'Back to all worlds' }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Back to all worlds' }).click();
    await sleep(page, 400);
    eq((await worlds()).filter((w) => w.name === 'Rainy Nights').length, 1, 'duplicate worlds created');
    eq((await worlds())[0].position, 1, 'first world should be position 1');
  });

  await check('worlds.create-feeds-brain', 'Creating a world tells the brain', async () => {
    await until(async () => (await c.db('activity_events')).some((e) => e.event_type === 'world_created'), 'no world_created event');
  });

  await check('worlds.create-failure', 'A failed create keeps the modal and the typed name, and says so', async () => {
    await api('/__fake/faults', [{ table: 'worlds', method: 'POST', status: 500 }]);
    await page.getByRole('button', { name: /Create New World/ }).click();
    await field(dlg(), 'World Name').fill('Should not exist');
    await dlg().getByRole('button', { name: 'Create', exact: true }).click();
    await toastAlert(/Couldn.t create the world/).waitFor({ timeout: 4000 });
    eq(await field(dlg(), 'World Name').inputValue(), 'Should not exist', 'typed name lost');
    eq((await worlds()).filter((w) => w.name === 'Should not exist').length, 0, 'world saved despite the failure');
    await api('/__fake/faults', { clear: true });
    await dlg().getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('button', { name: 'Back to all worlds' }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Back to all worlds' }).click();
    await card('Should not exist').waitFor();
    eq((await worlds()).map((w) => w.position).join(','), '1,2', 'positions should be 1,2');
  });

  await check('worlds.edit', 'Edit a world; an empty name is refused', async () => {
    await act('Should not exist', 'Edit world: Should not exist');
    await field(dlg(), 'World Name').fill('');
    await dlg().getByRole('button', { name: 'Save', exact: true }).click();
    expect(await dlg().getByRole('alert').count() === 1, 'empty name accepted');
    await field(dlg(), 'World Name').fill('Library Season');
    await field(dlg(), 'Short Description').fill('Quiet hours.');
    await submit(page, 'Save');
    await until(async () => (await worlds()).some((w) => w.name === 'Library Season' && w.description === 'Quiet hours.'), 'edit not saved');
  });

  await check('worlds.edit-failure-is-honest', 'A failed edit does not claim "World updated"', async () => {
    await page.getByText('World updated.').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
    await api('/__fake/faults', [{ table: 'worlds', method: 'PATCH', status: 500 }]);
    await act('Library Season', 'Edit world: Library Season');
    await field(dlg(), 'World Name').fill('Nope');
    await dlg().getByRole('button', { name: 'Save', exact: true }).click();
    await toastAlert(/Couldn.t save your changes/).waitFor({ timeout: 4000 });
    eq(await page.getByText('World updated.').count(), 0, 'success toast shown for a failed save');
    expect(await dlg().count() === 1, 'modal closed although the save failed');
    eq((await worlds()).filter((w) => w.name === 'Nope').length, 0, 'saved despite fault');
    await api('/__fake/faults', { clear: true });
    await dlg().getByRole('button', { name: 'Cancel' }).click();
  });

  await check('worlds.activate-one-at-a-time', 'Activating switches exactly one world on, and the brain learns a taste — once', async () => {
    await act('Rainy Nights', 'Activate world: Rainy Nights');
    await until(async () => (await worlds()).filter((w) => w.is_active).map((w) => w.name).join() === 'Rainy Nights', 'only Rainy Nights should be active');
    await act('Library Season', 'Activate world: Library Season');
    await until(async () => (await worlds()).filter((w) => w.is_active).map((w) => w.name).join() === 'Library Season', 'only Library Season should be active');
    const mem = await until(async () => { const m = (await c.db('memories')).filter((x) => x.source === 'world'); return m.length ? m : null; }, 'no preference memory was created');
    eq(mem.length, 1, 'exactly one aesthetic-preference memory, not one per activation');
    eq(mem[0].memory_type, 'inferred', 'an observation, not something the student said');
    expect(mem[0].recurrence_count >= 1, 'second activation should reinforce, not duplicate');
    expect((await c.db('activity_events')).some((e) => e.event_type === 'world_activated'), 'no world_activated event');
  });

  await check('worlds.dismissed-preference-stays-dismissed', 'A hidden taste memory is not resurrected by the next activation', async () => {
    await c.patch('memories', { source: 'world' }, { status: 'dismissed' });
    await act('Rainy Nights', 'Activate world: Rainy Nights');
    await until(async () => (await worlds()).find((w) => w.name === 'Rainy Nights')?.is_active === true, 'activation');
    await sleep(page, 800);
    const mem = (await c.db('memories')).filter((x) => x.source === 'world');
    eq(mem.length, 1, 'a new memory was created after the old one was dismissed');
    eq(mem[0].status, 'dismissed', 'dismissed memory was changed');
  });

  await check('worlds.activate-failure', 'A failed switch keeps the current world and says so', async () => {
    await page.waitForFunction(() => !document.body.innerText.includes('is now your active world'), null, { timeout: 7000 });
    await api('/__fake/faults', [{ table: 'worlds', method: 'PATCH', status: 500 }]);
    await act('Library Season', 'Activate world: Library Season');
    await toastAlert(/Couldn.t switch worlds/).waitFor({ timeout: 4000 });
    eq((await worlds()).filter((w) => w.is_active).map((w) => w.name).join(), 'Rainy Nights', 'active world changed despite failure');
    eq(await page.getByText('Library Season is now your active world.').count(), 0, 'success toast for a failed switch');
    await api('/__fake/faults', { clear: true });
  });

  await check('worlds.card-is-keyboard-reachable', 'Each world opens from a real button, and its actions have names', async () => {
    expect(await page.getByRole('button', { name: 'Open world: Rainy Nights' }).count() === 1, 'no accessible open button');
    for (const n of ['Edit world: Rainy Nights', 'Duplicate world: Rainy Nights', 'Delete world: Rainy Nights']) expect(await page.getByRole('button', { name: n }).count() === 1, `missing "${n}"`);
  });

  await check('worlds.duplicate', 'Duplicating copies the board, and the copy is its own world', async () => {
    const rainy = (await worlds()).find((w) => w.name === 'Rainy Nights');
    await c.seed('world_elements', [
      { world_id: rainy.id, element_type: 'text', pos_x: 40, pos_y: 40, width: 200, height: 80, z_index: 1, opacity: 1, props: { text: 'hello' } },
      { world_id: rainy.id, element_type: 'color', pos_x: 300, pos_y: 60, width: 100, height: 100, z_index: 2, opacity: 1, props: { color: '#ff8800' } },
    ]);
    await page.reload(); await sleep(page, 900);
    await act('Rainy Nights', 'Duplicate world: Rainy Nights');
    const copy = await until(async () => (await worlds()).find((w) => w.name === 'Rainy Nights (copy)'), 'copy not created');
    eq((await c.db('world_elements')).filter((e) => e.world_id === copy.id).length, 2, 'elements should be copied');
    eq(copy.is_active, false, 'a copy must not be active');
  });

  await check('worlds.duplicate-failure-leaves-no-half-copy', 'If the board cannot be copied, no empty copy is left behind', async () => {
    const before = (await worlds()).length;
    await api('/__fake/faults', [{ table: 'world_elements', method: 'POST', status: 500 }]);
    await act('Rainy Nights', 'Duplicate world: Rainy Nights');
    await toastAlert(/Couldn.t copy everything/).waitFor({ timeout: 4000 });
    await sleep(page, 400);
    eq((await worlds()).length, before, 'a half-copied world remained');
    await api('/__fake/faults', { clear: true });
  });

  await check('worlds.delete-says-what-goes', 'Delete names what will be lost; a failed delete removes nothing', async () => {
    await api('/__fake/faults', [{ table: 'worlds', method: 'DELETE', status: 500 }]);
    await act('Rainy Nights (copy)', 'Delete world: Rainy Nights (copy)');
    expect(/2 elements/.test(await dlg().innerText()), `no element count in: ${(await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 120)}`);
    await dlg().getByRole('button', { name: 'Delete', exact: true }).click();
    await toastAlert(/Couldn.t delete that world/).waitFor({ timeout: 4000 });
    expect((await worlds()).some((w) => w.name === 'Rainy Nights (copy)'), 'world removed despite failure');
    eq(await page.getByText('World deleted.').count(), 0, 'success toast for failed delete');
    await api('/__fake/faults', { clear: true });
    await act('Rainy Nights (copy)', 'Delete world: Rainy Nights (copy)');
    await dlg().getByRole('button', { name: 'Delete', exact: true }).click();
    await until(async () => !(await worlds()).some((w) => w.name === 'Rainy Nights (copy)'), 'world not deleted');
    eq((await c.db('world_elements')).filter((e) => e.props?.text === 'hello').length, 1, 'only the copy’s elements should go');
  });

  await check('worlds.marker-never-shown-or-lost', 'The automation’s internal marker is hidden, kept on edit, and not copied', async () => {
    await c.seed('worlds', [{ name: 'Auto World', description: MARKER, position: 9, is_active: false, theme_settings: (await worlds())[0].theme_settings }]);
    await page.reload(); await sleep(page, 900);
    expect(!/alora_monthly_auto/.test(await page.locator('main').innerText()), 'internal marker is visible on the card');
    await act('Auto World', 'Edit world: Auto World');
    eq(await field(dlg(), 'Short Description').inputValue(), '', 'marker leaked into the edit form');
    await field(dlg(), 'Short Description').fill('Made by Alora, tweaked by me');
    await submit(page, 'Save');
    const w = await until(async () => (await worlds()).find((x) => x.name === 'Auto World' && x.description?.includes('tweaked')), 'edit not saved');
    expect(w.description.startsWith(MARKER), 'marker lost on edit — the automation would create a second world next month');
    await act('Auto World', 'Duplicate world: Auto World');
    const copy = await until(async () => (await worlds()).find((x) => x.name === 'Auto World (copy)'), 'copy not created');
    expect(!String(copy.description ?? '').includes('__alora_monthly_auto__'), 'a copy inherited the automation marker');
    await act('Auto World (copy)', 'Delete world: Auto World (copy)');
    await dlg().getByRole('button', { name: 'Delete', exact: true }).click();
    await until(async () => !(await worlds()).some((x) => x.name === 'Auto World (copy)'), 'copy cleanup');
  });

  await check('worlds.monthly-automation', "The monthly vibe is built from the student's own words, announced, and not duplicated", async () => {
    await c.seed('journal_entries', ['Obsessed with calculus tonight.', 'Calculus again, calculus all day.', 'More calculus practice problems.'].map((content) => ({ content, mood: 'focused' })));
    await page.reload(); await sleep(page, 1800);
    const auto = await until(async () => (await worlds()).filter((w) => String(w.description ?? '').startsWith(MARKER)), 'no automation world');
    eq(auto.length, 1, 'exactly one automation world');
    expect(/— calculus$/.test(auto[0].name), `world not named after the student's own word: "${auto[0].name}"`);
    eq(auto[0].is_active, true, 'monthly world should be on');
    eq((await worlds()).filter((w) => w.is_active).length, 1, 'only one world active');
    expect(await page.getByText(/New month, new vibe/).count() >= 1, 'the switch was not announced');
    const prof = (await c.db('alora_profiles'))[0];
    expect(!!prof.preferences?.moodboardAutomation?.lastGeneratedMonth, 'month not recorded');
    await page.reload(); await sleep(page, 1500);
    eq((await worlds()).filter((w) => String(w.description ?? '').startsWith(MARKER)).length, 1, 'second world created on reload');
  });

  await check('worlds.monthly-automation-failure-safe', 'If the monthly world cannot be saved, the current vibe stays and the month is not stamped', async () => {
    const prof = (await c.db('alora_profiles'))[0];
    await c.patch('alora_profiles', { id: prof.id }, { preferences: { ...prof.preferences, moodboardAutomation: { enabled: true } } });
    const activeBefore = (await worlds()).find((w) => w.is_active).name;
    await api('/__fake/faults', [{ table: 'worlds', method: 'PATCH', status: 500, times: 4 }]);
    await page.reload(); await sleep(page, 1800);
    eq((await worlds()).find((w) => w.is_active)?.name, activeBefore, 'active world changed although saving failed');
    expect(!(await c.db('alora_profiles'))[0].preferences?.moodboardAutomation?.lastGeneratedMonth, 'month was recorded although nothing was saved');
    await api('/__fake/faults', { clear: true });
  });

  await check('worlds.load-error', 'A failed load is an error with retry, not "No worlds yet"', async () => {
    await api('/__fake/faults', [{ table: 'worlds', method: 'GET', status: 500, times: 50 }]);
    await page.reload();
    await page.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 6000 });
    await api('/__fake/faults', { clear: true });
    // (if the app already recovered on its own the button is gone — that's fine too)
    await page.getByRole('button', { name: 'Try again' }).click({ timeout: 2500 }).catch(() => {});
    await page.getByRole('list', { name: 'Your worlds' }).waitFor({ timeout: 6000 });
    eq(await page.getByText('No worlds yet').count(), 0, 'empty state after retry');
  });

  // ------------------------------------------------------------ the board editor
  async function openBoard(name) { await page.getByRole('button', { name: `Open world: ${name}` }).click(); await page.getByRole('button', { name: 'Back to all worlds' }).waitFor(); await sleep(page, 500); }
  const selectEl = async (text) => { await page.locator('.moodboard-element', { hasText: text }).first().click(); };

  await check('worlds.board-loads-and-selects', 'The board shows its elements and an element can be selected', async () => {
    await openBoard('Rainy Nights');
    expect(await page.locator('.moodboard-element').count() >= 2, 'elements not rendered');
    await selectEl('hello');
    expect(await page.getByRole('button', { name: 'Bring element forward' }).count() === 1, 'no controls after selecting');
  });

  await check('worlds.board-edit-text', 'Text is edited in a proper dialog (no browser prompt) and saved', async () => {
    let prompted = false;
    page.once('dialog', (d) => { prompted = true; d.dismiss(); });
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    await page.getByRole('textbox', { name: 'Text' }).fill('hello again');
    await submit(page, 'Save');
    expect(!prompted, 'a blocking window.prompt appeared');
    const rainy = (await worlds()).find((w) => w.name === 'Rainy Nights');
    await until(async () => (await c.db('world_elements')).some((e) => e.world_id === rainy.id && e.props?.text === 'hello again'), 'edited text not saved');
    await page.locator('.moodboard-element', { hasText: 'hello again' }).dblclick();
    await page.getByRole('textbox', { name: 'Text' }).waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  await check('worlds.board-zorder-persists', 'Bring-forward really saves (it used to save the OLD value)', async () => {
    const rainy = (await worlds()).find((w) => w.name === 'Rainy Nights');
    const before = (await c.db('world_elements')).find((e) => e.world_id === rainy.id && e.props?.text === 'hello again').z_index;
    await page.getByRole('button', { name: 'Bring element forward' }).click();
    await until(async () => (await c.db('world_elements')).find((e) => e.world_id === rainy.id && e.props?.text === 'hello again').z_index === before + 1, 'z-order change was not persisted');
    await page.getByRole('button', { name: 'Send element backward' }).click();
    await until(async () => (await c.db('world_elements')).find((e) => e.world_id === rainy.id && e.props?.text === 'hello again').z_index === before, 'send-backward was not persisted');
  });

  await check('worlds.board-opacity-saves-on-exit', 'A change made just before leaving the board is not lost', async () => {
    const rainy = (await worlds()).find((w) => w.name === 'Rainy Nights');
    await page.locator('input[type=range]').first().evaluate((el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '0.4'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.getByRole('button', { name: 'Back to all worlds' }).click(); // well inside the 500 ms debounce
    await until(async () => (await c.db('world_elements')).find((e) => e.world_id === rainy.id && e.props?.text === 'hello again').opacity === 0.4, 'opacity change lost when leaving the board');
  });

  await check('worlds.board-delete-failure', 'A failed element delete leaves it on the board and says so', async () => {
    await openBoard('Rainy Nights');
    await selectEl('hello again');
    await api('/__fake/faults', [{ table: 'world_elements', method: 'DELETE', status: 500 }]);
    await page.getByRole('button', { name: 'Delete element' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await toastAlert(/Couldn.t delete that element/).waitFor({ timeout: 4000 });
    expect(await page.locator('.moodboard-element', { hasText: 'hello again' }).count() === 1, 'element vanished although delete failed');
    await api('/__fake/faults', { clear: true });
  });

  await check('worlds.board-set-active-is-live', 'Setting a world active updates the editor straight away', async () => {
    await page.getByRole('button', { name: 'Back to all worlds' }).click();
    await page.getByRole('button', { name: 'Open world: Library Season' }).click();
    await page.getByRole('button', { name: 'Back to all worlds' }).waitFor();
    await page.getByRole('button', { name: 'Set Active' }).click();
    await page.getByRole('button', { name: 'Set Active' }).waitFor({ state: 'detached', timeout: 4000 });
    await until(async () => (await worlds()).find((w) => w.name === 'Library Season')?.is_active === true, 'not activated in DB');
  });

  await check('worlds.board-load-error', 'A board that fails to load says so — it does not look empty', async () => {
    await page.getByRole('button', { name: 'Back to all worlds' }).click();
    await api('/__fake/faults', [{ table: 'world_elements', method: 'GET', status: 500, times: 3 }]);
    await page.getByRole('button', { name: 'Open world: Rainy Nights' }).click();
    await page.getByRole('alert').filter({ hasText: /Couldn.t open this board/ }).waitFor({ timeout: 5000 });
    expect(await page.getByText('Build your world.').count() === 0, 'an error looked like an empty board');
    await api('/__fake/faults', { clear: true });
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.locator('.moodboard-element').first().waitFor({ timeout: 5000 });
  });

  await check('worlds.board-mobile-toolbar', 'On a phone every toolbar button is visible and named (Appearance had no icon)', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(page, 400);
    const btn = page.getByRole('button', { name: 'Appearance', exact: true });
    const box = await btn.last().boundingBox();
    expect(!!box && box.width >= 24 && box.height >= 24, `Appearance button is ${box ? `${Math.round(box.width)}×${Math.round(box.height)}` : 'not rendered'}`);
    expect(await btn.last().locator('svg').count() === 1, 'no icon on the phone toolbar button');
    eq((await overflowX(page)).over <= 0, true, 'horizontal overflow on the board at 390px');
    await page.setViewportSize({ width: 1280, height: 900 });
  });
});

// =============================================================== ROUTINES ====
await area('routines', async (c) => {
  const { page } = c;
  // The page's clock is pinned to "D days from today". D = -1 keeps the pinned time in the PAST: a clock jumped
  // forward would make the session token look expired and silently break every authenticated write.
  const D = -1;
  const at10 = async () => { await page.clock.setFixedTime(new Date(istAt(D, 10, 0))); await page.reload(); await sleep(page, 700); };
  const planned = () => page.locator('ol[aria-label="Today\'s schedule"] > li').allInnerTexts();
  const titles = async () => (await planned()).map((t) => t.split('\n').find((l) => l.trim() && !/^\d{1,2}:\d{2}/.test(l.trim())) ?? '');
  await c.go('Routines'); await sleep(page, 500);

  await check('routines.empty', 'With nothing due, the page says so honestly', async () => {
    await at10();
    expect(await page.getByText('Nothing to schedule').count() === 1, 'no empty state');
  });

  await check('routines.deadline-order', 'Work is planned in deadline order, and overdue urgent work comes first', async () => {
    await c.seed('tasks', [
      { title: 'Medium due 9pm', priority: 'medium', deadline: istAt(D, 21, 0), estimated_effort: '30m', status: 'todo' },
      { title: 'Low due 11am', priority: 'low', deadline: istAt(D, 11, 0), estimated_effort: '30m', status: 'todo' },
      { title: 'Overdue urgent', priority: 'urgent', deadline: istAt(D, 8, 0), estimated_effort: '30m', status: 'todo' },
      { title: 'Due tomorrow (not today)', priority: 'urgent', deadline: istAt(D + 1, 9, 0), status: 'todo' },
      { title: 'Already finished', priority: 'urgent', deadline: istAt(D, 9, 0), status: 'completed' },
    ]);
    await at10();
    const t = await titles();
    eq(JSON.stringify(t.map((x) => x.trim())), JSON.stringify(['Overdue urgent', 'Low due 11am', 'Medium due 9pm']), 'plan order');
  });

  await check('routines.times-are-future', 'Nothing is proposed in the past', async () => {
    const first = (await planned())[0];
    const m = first.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    expect(!!m, `no start time in "${first.slice(0, 40)}"`);
    let h = Number(m[1]); if (/pm/i.test(m[3] ?? '') && h < 12) h += 12; if (/am/i.test(m[3] ?? '') && h === 12) h = 0;
    expect(h * 60 + Number(m[2]) >= 10 * 60, `first block starts at ${m[0]}, before the current time (10:00)`);
  });

  await check('routines.overdue-flag', 'An overdue task is labelled as overdue', async () => {
    expect(await page.getByText(/Overdue — was due/).count() >= 1, 'no overdue label');
  });

  await check('routines.late-flag', 'A task the plan cannot finish before its deadline says so', async () => {
    await c.seed('tasks', [{ title: 'Tight one', priority: 'high', deadline: istAt(D, 10, 30), estimated_effort: '2h', status: 'todo' }]);
    await at10();
    const card = page.locator('ol[aria-label="Today\'s schedule"] > li', { hasText: 'Tight one' });
    expect(/Ends after its .* deadline/.test(await card.innerText()), 'a block that ends after its deadline was not flagged');
    // …and it is not hidden: the plan still contains it.
    eq((await titles()).filter((x) => /Tight one/.test(x)).length, 1, 'tight task missing from plan');
  });

  await check('routines.unscheduled', "Tasks that don't fit the day are listed, not silently dropped", async () => {
    await c.seed('tasks', Array.from({ length: 6 }, (_, i) => ({ title: `Huge ${i}`, priority: 'low', deadline: istAt(D, 23, 0), estimated_effort: '3h', status: 'todo' })));
    await at10();
    expect(await page.getByRole('region', { name: "Didn't fit today" }).count() === 1, 'no "Didn\'t fit today" section');
    const spilled = await page.getByRole('region', { name: "Didn't fit today" }).locator('li').count();
    const scheduled = (await titles()).filter((x) => /^Huge/.test(x.trim())).length;
    eq(spilled + scheduled, 6, 'every Huge task should be either planned or listed as not fitting');
    expect(spilled > 0, 'six 3-hour tasks cannot all fit between 10:00 and 22:00');
  });

  await check('routines.mark-done', 'A task can be marked done from the plan, and it persists', async () => {
    await page.getByRole('button', { name: 'Mark done: Overdue urgent' }).click();
    await until(async () => (await c.db('tasks')).find((t) => t.title === 'Overdue urgent')?.status === 'completed', 'completion not saved');
    const row = (await c.db('tasks')).find((t) => t.title === 'Overdue urgent');
    expect(!!row.completed_at, 'completed_at not set');
    expect(!(await titles()).some((x) => /Overdue urgent/.test(x)), 'finished task still in the plan');
    await until(async () => (await c.db('activity_events')).some((e) => e.event_type === 'task_completed'), 'the brain did not hear about the completion');
  });

  await check('routines.mark-done-failure', 'A failed completion puts the task back and says so', async () => {
    await api('/__fake/faults', [{ table: 'tasks', method: 'PATCH', status: 500 }]);
    await page.getByRole('button', { name: 'Mark done: Low due 11am' }).click();
    await page.getByRole('alert').filter({ hasText: /Couldn.t mark/ }).first().waitFor({ timeout: 4000 });
    expect((await titles()).some((x) => /Low due 11am/.test(x)), 'task vanished from the plan although the save failed');
    eq((await c.db('tasks')).find((t) => t.title === 'Low due 11am').status, 'todo', 'status changed despite failure');
    await api('/__fake/faults', { clear: true });
  });

  await check('routines.load-error', 'A failed load is an error with retry — not "nothing to schedule"', async () => {
    await api('/__fake/faults', [{ table: 'tasks', method: 'GET', status: 500, times: 2 }]);
    await page.reload();
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('list', { name: "Today's schedule" }).waitFor({ timeout: 6000 });
    eq(await page.getByText('Nothing to schedule').count(), 0, 'empty state shown after a successful retry');
  });

  await check('routines.day-ended', "After the end of the day it says so, and still lists what's open", async () => {
    await page.clock.setFixedTime(new Date(istAt(D, 22, 45)));
    await page.reload(); await sleep(page, 900);
    expect(await page.getByText(/past the end of the suggested day/).count() >= 1, 'no end-of-day message');
    expect(await page.getByRole('region', { name: 'Still open' }).count() === 1, 'open tasks not listed after the day ended');
    await page.clock.setFixedTime(new Date());
  });
});

// ================================================================== HOME ====
await area('home', async (c) => {
  const { page } = c;
  const fx = await seedAcademic(c);
  const [goal] = await c.seed('goals', [{ title: 'Ace Linear Algebra', progress: 40 }]);
  const y = istAt(-1, 12);
  const day = 86400e3;
  await c.seed('tasks', [
    { title: 'Overdue A', deadline: y, status: 'todo', priority: 'high' },
    { title: 'Overdue B', deadline: y, status: 'todo', priority: 'low' },
    { title: 'Due today C', deadline: istAt(0, 23, 59), status: 'todo', priority: 'medium' },
    { title: 'Due in three days', deadline: new Date(Date.now() + 3 * day).toISOString(), status: 'todo', priority: 'medium' },
    // 150 long-finished tasks with the EARLIEST deadlines: they used to fill the "first 20 by deadline" window and hide real work
    ...Array.from({ length: 150 }, (_, i) => ({ title: `Old finished ${i}`, deadline: new Date(Date.now() - (200 + i) * day).toISOString(), status: 'completed', completed_at: new Date(Date.now() - (190 + i) * day).toISOString() })),
  ]);
  await c.seed('activity_events', [0, 1, 2].map((n) => ({ event_type: 'class_logged', entity_type: 'class', created_at: new Date(Date.now() - n * day).toISOString() })));
  await page.reload(); await sleep(page, 1800);
  const mainText = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  await check('home.numbers-match-data', 'Stat cards agree with the data (overdue = 2, goal progress = 40%)', async () => {
    const txt = await mainText();
    expect(/OVERDUE\s*2\b/i.test(txt), `overdue card wrong: "${txt.match(/OVERDUE\s*\S+/i)?.[0]}"`);
    expect(/GOAL PROGRESS\s*40%/i.test(txt), `goal progress card wrong: "${txt.match(/GOAL PROGRESS\s*\S+/i)?.[0]}"`);
  });
  await check('home.old-completed-dont-hide-work', 'Hundreds of old finished tasks do not hide upcoming deadlines', async () => {
    expect((await mainText()).includes('Due in three days'), 'upcoming task missing from Upcoming Deadlines');
  });
  await check('home.overdue-label', 'Overdue items say how late they are in calendar days', async () => {
    expect(/Overdue A.*1d late|Overdue A.*earlier today/.test(await mainText()), 'no lateness label');
  });
  await check('home.streak-from-activity', 'Streak is derived from real activity and cached on the profile', async () => {
    expect(/STREAK\s*3 days/i.test(await mainText()), `streak card wrong: "${(await mainText()).match(/STREAK\s*\S+\s*\S*/i)?.[0]}"`);
    const prof = await until(async () => { const r = await c.db('alora_profiles'); return r[0]?.streak_days === 3 ? r[0] : null; }, 'streak cached to alora_profiles');
    expect(prof.streak_days === 3, 'streak not cached');
  });
  await check('home.no-fake-zeros', 'No quiz history shows "—", not an invented 0%', async () => {
    expect(/QUIZ AVG\s*—/i.test(await mainText()), `quiz avg: "${(await mainText()).match(/QUIZ AVG\s*\S+/i)?.[0]}"`);
  });
  const resetChecked = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('alora.insights.checkedAt')).forEach((k) => localStorage.removeItem(k)));
  await check('home.insight-appears-with-evidence', 'The insight engine surfaces a real finding, with its evidence', async () => {
    await c.seed('tasks', [{ title: 'Overdue D', deadline: y, status: 'todo', priority: 'low' }]);
    await resetChecked(); await page.reload(); await sleep(page, 1800);
    expect(/3 overdue tasks/i.test(await mainText()), 'no "3 overdue tasks" insight');
    await page.getByText('Why am I seeing this?').first().click();
    expect(/Overdue A|Overdue B|Overdue D/.test(await mainText()), 'evidence not shown');
  });
  await check('home.dismiss-sticks', 'A dismissed insight stays dismissed — across navigation, reload and regeneration', async () => {
    await page.getByRole('button', { name: /Dismiss insight: 3 overdue tasks/ }).click();
    await until(async () => (await c.db('insights')).find((i) => i.title === '3 overdue tasks')?.is_dismissed === true, 'dismissal persisted');
    await c.go('Tasks'); await c.go('Home'); await sleep(page, 1500);
    expect(!/3 overdue tasks/i.test(await mainText()), 'came back after navigating');
    await resetChecked(); await page.reload(); await sleep(page, 1800);
    expect(!/3 overdue tasks/i.test(await mainText()), 'came back after regeneration');
    eq((await c.db('insights')).filter((i) => i.title === '3 overdue tasks').length, 1, 'duplicate insight rows were created');
  });
  await check('home.insight-retired', 'An insight that is no longer true is retired, not left to go stale', async () => {
    await c.seed('tasks', [{ title: 'Overdue E', deadline: y, status: 'todo', priority: 'low' }]);
    await resetChecked(); await page.reload(); await sleep(page, 1800);
    expect(/4 overdue tasks/i.test(await mainText()), 'no "4 overdue tasks" insight');
    await c.patch('tasks', { title: 'Overdue D' }, { status: 'completed', completed_at: new Date().toISOString() });
    await c.patch('tasks', { title: 'Overdue E' }, { status: 'completed', completed_at: new Date().toISOString() });
    await resetChecked(); await page.reload(); await sleep(page, 1800);
    expect(!/4 overdue tasks/i.test(await mainText()), 'stale insight still shown after the tasks were finished');
    eq((await c.db('insights')).find((i) => i.title === '4 overdue tasks')?.is_dismissed, true, 'stale insight not retired in the database');
  });
  await check('home.nudges-off', 'Turning nudges off in Settings hides insights on Home', async () => {
    await c.seed('insights', [{ insight_type: 'progress', title: 'Seeded cheer', description: 'You are doing well.', evidence: [], severity: 'positive' }]);
    await page.reload(); await sleep(page, 1500);
    expect(/Seeded cheer/i.test(await mainText()), 'seeded insight not shown while nudges are on');
    await c.go('Settings');
    await page.getByRole('switch', { name: 'Show nudges on Home' }).click(); await sleep(page, 600);
    await c.go('Home'); await sleep(page, 1200);
    expect(!/Seeded cheer/i.test(await mainText()), 'insight shown although nudges are off');
    await c.go('Settings');
    await page.getByRole('switch', { name: 'Show nudges on Home' }).click(); await sleep(page, 600);
    await c.go('Home'); await sleep(page, 1200);
    expect(/Seeded cheer/i.test(await mainText()), 'insight did not return when nudges were turned back on');
  });
  await check('home.load-failure', 'A failed load is an error with retry — not "all clear" and not zeros', async () => {
    await api('/__fake/faults', [{ table: 'tasks', method: 'GET', status: 500, times: 12 }]);
    await page.reload(); await sleep(page, 1800);
    const txt = await mainText();
    expect(!/Perfect time to get ahead|You're ahead of the game/.test(txt), 'happy "nothing due" copy shown although the tasks query failed');
    expect(!/OVERDUE\s*0\b/i.test(txt), 'shows "Overdue 0" although the tasks query failed');
    expect(await page.getByRole('button', { name: 'Try again' }).count() > 0, 'no retry button');
    await api('/__fake/faults', { clear: true });
    await page.getByRole('button', { name: 'Try again' }).click(); await sleep(page, 1200);
    expect(/OVERDUE\s*2\b/i.test(await mainText()), 'retry did not recover the dashboard');
  });
});

// ======================================================== A11Y / TOUCH ====
// ======================================================= REMINDERS & AUDIO ====
await area('reminders', async (c) => {
  const { page } = c;
  await c.go('Settings'); await sleep(page, 500);
  const email = page.getByRole('switch', { name: 'Email reminders' });
  const push = page.getByRole('switch', { name: 'Push reminders on this device' });
  const master = page.getByRole('switch', { name: 'Show nudges on Home' });
  await check('reminders.push-honest-when-unconfigured', 'With no VAPID key, push says it is not set up and cannot be switched on', async () => {
    await page.getByText("Push isn't set up for this Alora yet.").first().waitFor({ timeout: 4000 });
    expect(await push.isDisabled(), 'the push switch should be disabled when push is not configured');
    eq((await c.db('push_subscriptions')).length, 0, 'a subscription row appeared from nowhere');
  });
  await check('reminders.email-defaults-off-and-persists', 'Email reminders start off, save to the database, and survive reload', async () => {
    eq(await email.getAttribute('aria-checked'), 'false', 'email reminders should be opt-in');
    await email.click();
    await until(async () => (await c.db('settings'))[0]?.email_reminders_enabled === true, 'email_reminders_enabled was not persisted');
    await page.reload(); await c.go('Settings'); await sleep(page, 400);
    eq(await page.getByRole('switch', { name: 'Email reminders' }).getAttribute('aria-checked'), 'true', 'email switch after reload');
    await page.getByText(/sent to reminders@example\.test|The same digest, sent to/).first().waitFor({ timeout: 3000 });
  });
  await check('reminders.email-failure-reverts', 'A failed save puts the switch back and says so', async () => {
    await api('/__fake/faults', [{ table: 'settings', method: 'POST', status: 500, times: 1 }]);
    const sw = page.getByRole('switch', { name: 'Email reminders' });
    const before = await sw.getAttribute('aria-checked');
    await sw.click();
    await page.getByText(/Couldn't save/i).first().waitFor({ timeout: 6000 });
    await until(async () => (await sw.getAttribute('aria-checked')) === before, 'switch stayed in the wrong state after the failed save');
    await api('/__fake/faults', { clear: true });
  });
  await check('reminders.master-switch-gates-channels', 'Turning nudges off disables the push and email switches', async () => {
    await master.click(); await sleep(page, 600);
    expect(await page.getByRole('switch', { name: 'Email reminders' }).isDisabled(), 'email switch still usable with the master switch off');
    await page.getByRole('switch', { name: 'Show nudges on Home' }).click(); await sleep(page, 600);
    expect(!(await page.getByRole('switch', { name: 'Email reminders' }).isDisabled()), 'email switch should come back with the master switch');
  });
  await check('reminders.service-worker-served', 'The push service worker is served and handles push + click', async () => {
    const r = await page.request.get(`${APP}/sw.js`);
    eq(r.status(), 200, 'sw.js status');
    const body = await r.text();
    expect(/addEventListener\('push'/.test(body) && /notificationclick/.test(body), 'sw.js does not handle push / notificationclick');
  });
});

await area('audio', async (c) => {
  const { page } = c;
  const fx = await seedAcademic(c);
  await page.reload(); await c.go('Academia'); await sleep(page, 800);
  await page.getByRole('button', { name: /Structure/ }).click();
  await page.getByText('Year 1').first().waitFor();
  for (const label of ['Year 1', 'Semester 1']) {
    if (await page.getByText('Linear Algebra', { exact: true }).first().isVisible()) break;
    await page.getByText(label, { exact: true }).first().click(); await sleep(page, 250);
  }
  await page.getByText('Linear Algebra', { exact: true }).first().click(); await sleep(page, 400);
  await page.getByRole('button', { name: 'Classes', exact: true }).click(); await sleep(page, 400);
  const fileInput = () => page.locator('input[type=file]:not([webkitdirectory])').first();
  const mp3 = Buffer.from('ID3-fake-audio');

  await check('audio.upload-shows-player', 'An uploaded recording appears with a player and a Transcribe button (no transcript invented)', async () => {
    await fileInput().setInputFiles({ name: 'lecture3.mp3', mimeType: 'audio/mpeg', buffer: mp3 });
    await page.getByRole('button', { name: 'Transcribe' }).waitFor({ timeout: 6000 });
    await page.locator('audio').waitFor({ timeout: 5000 }).catch(() => { throw new Fail('no audio player'); });
    const rows = await c.db('attachments');
    eq(rows.length, 1, 'attachment row'); eq(rows[0].file_type, 'audio/mpeg', 'file type'); expect(!rows[0].transcript, 'a transcript existed before anyone asked for one');
  });
  await check('audio.transcribe-failure-is-honest', 'If transcription fails the student is told, nothing is saved, and they can retry', async () => {
    await api('/__fake/config', { functionsMode: 'error' });
    await page.getByRole('button', { name: 'Transcribe' }).click();
    await page.getByRole('alert').filter({ hasText: /transcription service/i }).waitFor({ timeout: 6000 });
    expect(!(await c.db('attachments'))[0].transcript, 'a transcript was saved despite the failure');
    await api('/__fake/config', { functionsMode: 'ok' });
  });
  await check('audio.transcribe-saves', 'Transcribe stores the transcript on the recording and shows it', async () => {
    await page.getByRole('button', { name: 'Transcribe' }).click();
    await page.getByText(/transcript of lecture3\.mp3/).first().waitFor({ timeout: 6000 });
    expect(/photosynthesis/.test((await c.db('attachments'))[0].transcript || ''), 'transcript not persisted on the attachment');
    await page.reload(); await sleep(page, 600);
  });
  await check('audio.add-to-class-notes-feeds-brain', 'Adding the transcript to class notes updates the log and the class memory — once, even if pressed twice', async () => {
    // reopen after reload
    await page.getByRole('button', { name: /Structure/ }).click();
    for (const label of ['Year 1', 'Semester 1']) {
      if (await page.getByText('Linear Algebra', { exact: true }).first().isVisible()) break;
      await page.getByText(label, { exact: true }).first().click(); await sleep(page, 250);
    }
    await page.getByText('Linear Algebra', { exact: true }).first().click(); await sleep(page, 400);
    await page.getByRole('button', { name: 'Classes', exact: true }).click(); await sleep(page, 500);
    await page.getByText(/transcript of lecture3\.mp3/).first().waitFor({ timeout: 6000 }); // survives reload
    await page.getByRole('button', { name: 'Add to class notes' }).click();
    await until(async () => /Calvin cycle/.test((await c.db('class_logs'))[0]?.raw_thoughts || ''), 'transcript was not appended to the class log');
    const log = (await c.db('class_logs'))[0];
    expect(/Eigenvectors keep their direction/.test(log.raw_thoughts), "the student's original notes were lost");
    await sleep(page, 600);
    await page.getByRole('button', { name: 'Add to class notes' }).click(); await sleep(page, 900);
    eq(((await c.db('class_logs'))[0].raw_thoughts.match(/Calvin cycle/g) || []).length, 1, 'transcript was appended twice');
    eq((await c.db('memories')).filter((m) => m.source === 'class').length, 1, 'class memory should be one refreshed memory, not duplicates');
  });
  await check('audio.too-large-explains', 'A recording over 14 MB says it is too large to transcribe instead of failing', async () => {
    await c.patch('attachments', { id: (await c.db('attachments'))[0].id }, { transcript: null, file_size: 20 * 1024 * 1024 });
    await page.reload(); await sleep(page, 600);
    await page.getByRole('button', { name: /Structure/ }).click();
    for (const label of ['Year 1', 'Semester 1']) {
      if (await page.getByText('Linear Algebra', { exact: true }).first().isVisible()) break;
      await page.getByText(label, { exact: true }).first().click(); await sleep(page, 250);
    }
    await page.getByText('Linear Algebra', { exact: true }).first().click(); await sleep(page, 400);
    await page.getByRole('button', { name: 'Classes', exact: true }).click(); await sleep(page, 500);
    await page.getByText(/too large to transcribe/i).first().waitFor({ timeout: 5000 });
    eq(await page.getByRole('button', { name: 'Transcribe' }).count(), 0, 'Transcribe offered for a file that cannot be transcribed');
  });
  await check('audio.remove', 'A recording can be removed', async () => {
    await page.locator('audio').hover();
    await page.getByRole('button', { name: /^Remove lecture3\.mp3/ }).click();
    await until(async () => (await c.db('attachments')).length === 0, 'attachment row not deleted');
  });
});

await area('a11y', async (c) => {
  const { page } = c;
  await c.seed('tasks', [{ title: 'A11y probe task', priority: 'low', deadline: new Date(Date.now() + 3600e3).toISOString() }]);
  await c.go('Tasks'); await page.reload(); await c.go('Tasks'); await sleep(page, 600);
  await check('a11y.dialog-semantics', 'Dialogs have role=dialog, aria-modal, and close on Escape', async () => {
    await page.getByRole('button', { name: /Add Task/ }).first().click();
    expect(await page.locator('[role=dialog][aria-modal=true]').count() === 1, 'modal is a bare <div> (no role=dialog / aria-modal)');
    await page.keyboard.press('Escape'); await sleep(page, 300);
    eq(await page.getByPlaceholder('What needs to be done?').count(), 0, 'Escape did not close the modal');
  });
  await check('a11y.icon-buttons', 'Every icon-only button has an accessible name', async () => {
    const nameless = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && !(b.innerText || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length);
    eq(nameless, 0, 'unlabelled icon buttons on Tasks');
  });
});

/** In-page audit: every visible interactive control must have an accessible name, and every field a label. */
const AUDIT = () => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label')?.trim(); if (aria) return aria;
    const by = el.getAttribute('aria-labelledby'); if (by) { const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim(); if (t) return t; }
    if (el.labels && el.labels.length) { const t = [...el.labels].map((l) => l.textContent).join(' ').trim(); if (t) return t; }
    const text = (el.innerText || el.textContent || '').trim(); if (text) return text;
    const alt = el.querySelector('img[alt]:not([alt=""])')?.getAttribute('alt'); if (alt) return alt;
    return el.getAttribute('title')?.trim() || '';
  };
  const bad = [];
  for (const el of document.querySelectorAll('button, a[href], [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], input:not([type=hidden]), select, textarea')) {
    if (!visible(el)) continue;
    // Programmatic file inputs behind a visible "Attach" button: out of the tab order and hidden from assistive tech.
    if (el.getAttribute('aria-hidden') === 'true' && el.getAttribute('tabindex') === '-1') continue;
    if (!nameOf(el)) {
      const where = el.closest('[class*=glass-card], li, section, nav, aside, header, form')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40) ?? '';
      bad.push(`<${el.tagName.toLowerCase()}${el.type ? ` type=${el.type}` : ''}> in "${where}"`);
    }
  }
  return bad;
};

await area('a11y-sweep', async (c) => {
  const { page } = c;
  const fx = await seedAcademic(c);
  const [goal] = await c.seed('goals', [{ title: 'Ace Linear Algebra', progress: 40, target_date: '2027-01-15' }]);
  await c.seed('identities', [{ name: 'The Scholar', description: 'Reads daily', progress: 20 }]);
  await c.seed('habits', [{ name: 'Read 30 pages', frequency: 'daily', streak: 2 }]);
  await c.seed('tasks', [
    { title: 'Problem set 4', priority: 'high', deadline: new Date(Date.now() + 5 * 3600e3).toISOString(), status: 'todo', related_goal_id: goal.id },
    { title: 'Read chapter 7', priority: 'low', status: 'todo' },
  ]);
  await c.seed('journal_entries', [{ content: 'Eigenvectors finally clicked today.', mood: 'happy', tags: ['math'], is_novel_eligible: true }]);
  await c.seed('memories', [{ content: 'I study best in the morning', category: 'learning', importance: 'high', memory_type: 'explicit', source: 'user', status: 'active', confidence: 1 }]);
  const [proj] = await c.seed('novel_projects', [{ title: 'My Journey', description: 'x', themes: ['growth'] }]);
  const [chap] = await c.seed('novel_chapters', [{ novel_project_id: proj.id, title: 'Arrival', summary: 's', position: 1, status: 'draft' }]);
  await c.seed('novel_scenes', [{ chapter_id: chap.id, title: 'Day one', raw_content: 'It began.', curated_content: 'It began, quietly.', position: 1 }]);
  const theme = (await c.db('worlds'))[0]?.theme_settings ?? JSON.parse(JSON.stringify({}));
  void theme;
  await page.reload(); await sleep(page, 900);

  const pages = ['Home', 'Academia', 'Daily Quiz', 'Tasks', 'Routines', 'Alora Chat', 'Journal', 'My Future', 'Novel', 'Memory', 'Vibe', 'Settings'];
  for (const label of pages) {
    await check(`a11y-sweep.${label.toLowerCase().replace(/\s+/g, '-')}`, `${label}: every control has an accessible name`, async () => {
      await c.go(label); await sleep(page, 900);
      if (label === 'Academia') { await page.getByText('Linear Algebra').first().click().catch(() => {}); await sleep(page, 700); }
      if (label === 'Novel') { for (const n of ['My Journey: expand', 'Arrival: expand']) await page.getByRole('button', { name: n }).click().catch(() => {}); await sleep(page, 300); }
      const bad = await page.evaluate(AUDIT);
      eq(bad, [], `${bad.length} unnamed control(s): ${bad.slice(0, 5).join(' | ')}`);
    });
  }
  void fx;
});

await area('touch', { mobile: true, viewport: { width: 820, height: 1180 } }, async (c) => {
  const { page } = c;
  await c.seed('tasks', [{ title: 'Touch probe task', priority: 'low', deadline: new Date(Date.now() + 3600e3).toISOString() }]);
  await page.reload(); await page.waitForTimeout(800);
  await page.locator('aside nav button', { hasText: /^\s*Tasks\s*$/ }).first().click();
  await sleep(page, 600);
  await check('touch.actions-reachable', 'Edit/Delete are visible on a touch tablet (≥768px) without hover', async () => {
    const op = await row(page, 'Touch probe task').locator('button').nth(1).evaluate((el) => getComputedStyle(el.parentElement).opacity);
    expect(Number(op) > 0.5, `row actions have opacity ${op} on a touch device (hover-only reveal)`);
  });
});

await area('mobile', { mobile: true }, async (c) => {
  const { page } = c;
  await check('mobile.nav-labels', 'Bottom-nav labels are unambiguous', async () => {
    const labels = await page.locator('nav.fixed.bottom-0 button span').allInnerTexts();
    expect(!labels.includes('Daily') && !labels.includes('My') && !labels.includes('Alora'), `truncated labels: ${labels.join(', ')}`);
  });
  await check('mobile.no-overflow-all-pages', 'No horizontal scroll on any page at 390px', async () => {
    const bad = [];
    for (const l of ['Home', 'Academia', 'Daily Quiz', 'Tasks', 'Routines', 'Alora Chat', 'Journal', 'My Future', 'Novel', 'Memory', 'Vibe', 'Settings']) {
      await c.go(l); const o = await overflowX(page); if (o.over > 0) bad.push(`${l}:+${o.over}`);
    }
    eq(bad, [], 'pages overflow horizontally');
  });
  await check('mobile.chat-composer-visible', 'Chat composer is visible above the bottom nav', async () => {
    await c.go('Alora Chat'); await sleep(page, 500);
    const box = await page.locator('textarea').first().boundingBox();
    const nav = await page.locator('nav.fixed.bottom-0').boundingBox();
    expect(box && nav && box.y + box.height <= nav.y + 1, `composer (${box && Math.round(box.y + box.height)}) is hidden behind the nav (${nav && Math.round(nav.y)})`);
  });
  await check('mobile.dialog-usable', 'A form dialog fits the phone screen, can be completed with touch, and saves', async () => {
    await c.go('Tasks'); await sleep(page, 400);
    await page.getByRole('button', { name: /Add Task/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 4000 });
    await page.getByPlaceholder('What needs to be done?').fill('Phone-made task');
    const vp = page.viewportSize();
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= vp.width + 1, `dialog spills sideways (x=${box && Math.round(box.x)}, w=${box && Math.round(box.width)}, screen ${vp.width})`);
    const create = page.getByRole('button', { name: 'Create', exact: true }).last();
    await create.scrollIntoViewIfNeeded();
    const cb = await create.boundingBox();
    expect(cb && cb.y >= 0 && cb.y + cb.height <= vp.height, `Create button is off-screen (y=${cb && Math.round(cb.y)}, screen ${vp.height})`);
    await submit(page, 'Create');
    await page.getByText('Phone-made task').first().waitFor({ timeout: 5000 });
    eq((await c.db('tasks')).filter((t) => t.title === 'Phone-made task').length, 1, 'task row persisted from the phone');
  });
});

// ================================================================ REPORT ====
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\n══ ${pass}/${results.length} checks passed ══`);
import('node:fs').then((fs) => fs.promises.writeFile(new URL('./.out/last-run.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), pass, total: results.length, results }, null, 2)));
process.exitCode = pass === results.length ? 0 : 1;
