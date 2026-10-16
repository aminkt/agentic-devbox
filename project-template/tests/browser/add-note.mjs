// Browser flow for the example app, run inside the sidecar:
//
//   devbox-browser run tests/browser/add-note.mjs [base-url]
//
// devbox-browser connects to the sandbox's headless Chrome and passes a fresh Puppeteer
// `page`. Throwing fails the run (exit code 1), so this works as a CI-style check too.

export default async function addNote({ page, args }) {
  const baseUrl = args[0] ?? 'http://localhost:3000';
  const text = `note from the sandbox browser ${Date.now()}`;

  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.type('#text', text);
  await page.click('button[type=submit]');
  await page.waitForFunction((expected) => [...document.querySelectorAll('#notes li')].some((li) => li.textContent === expected), {}, text);

  await page.screenshot({ path: '/tmp/devbox-browser/add-note.png', fullPage: true });

  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
  const count = await page.$$eval('#notes li', (items) => items.length);
  return { ok: true, notes: count, screenshot: '/tmp/devbox-browser/add-note.png' };
}
