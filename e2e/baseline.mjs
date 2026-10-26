// Baseline walkthrough: sign up, visit every page on desktop + mobile, report what a user would hit.
import { launch, signUp, gotoPage, resetBackend, overflowX, shot, NAV } from './lib.mjs';

const results = [];
for (const mobile of [false, true]) {
  await resetBackend();
  const { browser, page, issues } = await launch({ mobile });
  const tag = mobile ? 'mobile' : 'desktop';
  await signUp(page);
  await page.waitForTimeout(1200);
  for (const [id, label] of NAV) {
    const before = issues.length;
    await gotoPage(page, label, { mobile });
    await page.waitForTimeout(700);
    const ov = await overflowX(page);
    const text = (await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
    await shot(page, `${tag}-${id}`);
    const rec = { tag, id, overflow: ov.over, text, newIssues: issues.slice(before).map((i) => `${i.kind}: ${i.text}`) }; results.push(rec); console.log(JSON.stringify(rec));
  }
  results.push({ tag, id: '(all)', totalIssues: issues.length });
  await browser.close();
}

