// Shared helpers for ALORA's browser end-to-end checks.
// Runs the REAL app (Vite) in headless Chromium against tools/fake-supabase.
// Playwright is resolved from the environment (pre-installed in the sandbox) —
// it is intentionally NOT a package.json dependency, so the browser build it
// ships with always matches.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
export function loadPlaywright() {
  try { return require('playwright'); } catch {
    try { return require('/usr/lib/node_modules/playwright'); } catch {
      throw new Error('Playwright is not available in this environment. Install it (npm i -D playwright && npx playwright install chromium) or run in the sandbox that ships it.');
    }
  }
}

export const APP = process.env.E2E_APP_URL || 'http://127.0.0.1:5173';
export const API = process.env.E2E_API_URL || 'http://127.0.0.1:54321';
export const OUT = process.env.E2E_OUT || path.resolve(process.cwd(), 'e2e/.out');
fs.mkdirSync(OUT, { recursive: true });

export const NAV = [
  ['home', 'Home'], ['academia', 'Academia'], ['quiz', 'Daily Quiz'], ['tasks', 'Tasks'],
  ['routines', 'Routines'], ['chat', 'Alora Chat'], ['journal', 'Journal'], ['future', 'My Future'],
  ['novel', 'Novel'], ['memory', 'Memory'], ['worlds', 'Vibe'], ['settings', 'Settings'],
];

export async function api(pathname, body) {
  const r = await fetch(API + pathname, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.json();
}
export const resetBackend = () => api('/__fake/reset', {});
export const dump = (table, email) => api(`/__fake/dump/${table}${email ? `?email=${encodeURIComponent(email)}` : ''}`);

/** Attaches listeners that record everything a user would never see but a tester must. */
export function trackIssues(page) {
  const issues = [];
  const push = (kind, text, extra = {}) => issues.push({ kind, text: String(text).slice(0, 400), url: page.url(), ...extra });
  page.on('console', (m) => { if (m.type() === 'error') push('console.error', m.text()); else if (m.type() === 'warning') push('console.warn', m.text()); });
  page.on('pageerror', (e) => push('pageerror', e.message));
  page.on('requestfailed', (r) => push('requestfailed', `${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    const u = r.url();
    if (u.startsWith(API) && r.status() >= 400) push('http', `${r.status()} ${r.request().method()} ${u.replace(API, '')}`, { status: r.status() });
  });
  return issues;
}

export async function launch({ mobile = false, locale = 'en-IN', timezoneId = 'Asia/Kolkata', colorScheme = 'light' } = {}) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale, timezoneId, colorScheme,
  });
  context.setDefaultTimeout(6000);
  const page = await context.newPage();
  const issues = trackIssues(page);
  return { browser, context, page, issues };
}

export async function signUp(page, { name = 'Test Student', email = 'student@example.test', password = 'secret12' } = {}) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create Account' }).first().click();
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('At least 6 characters').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.locator('nav:visible').first().waitFor({ timeout: 15000 });
  return { name, email, password };
}

// What the mobile nav shows for each page. Read straight from src/lib/nav.ts so this can never drift from the
// app (it used to be a hand-kept copy, and went stale the moment a label changed).
const MOBILE_LABELS = (() => {
  const src = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/lib/nav.ts'), 'utf8');
  const map = {};
  for (const m of src.matchAll(/label:\s*'([^']+)',\s*shortLabel:\s*'([^']+)'/g)) map[m[1]] = m[2];
  return map;
})();
function mobileLabel(label) {
  if (!MOBILE_LABELS[label]) throw new Error(`No mobile nav label known for "${label}" — is it in src/lib/nav.ts?`);
  return MOBILE_LABELS[label];
}

export async function gotoPage(page, label, { mobile = false } = {}) {
  if (!mobile) {
    await page.locator('aside nav button', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click();
  } else {
    const bar = page.locator('nav.fixed.bottom-0');
    const short = mobileLabel(label);
    const direct = bar.getByRole('button', { name: short, exact: true });
    if (await direct.count()) await direct.first().click();
    else {
      await bar.getByRole('button', { name: 'More' }).click();
      await page.getByRole('menu', { name: 'More pages' }).getByRole('menuitem', { name: short, exact: true }).click();
    }
  }
  await page.waitForTimeout(500);
}

export async function overflowX(page) {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, over: document.documentElement.scrollWidth - window.innerWidth }));
}
export async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}
