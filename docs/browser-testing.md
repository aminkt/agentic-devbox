# Browser testing

Every sidecar runs its own headless Google Chrome, separate from any browser on your machine. Agents drive it three ways, all against the same browser at `http://127.0.0.1:9222`: the `/browser` skill, the Chrome DevTools MCP tools, and the `devbox-browser` command.

Because the sidecar shares the app's network namespace, the browser opens your app at `http://localhost:<port>`. Every container start gets a fresh profile in memory, so no cookies or logins carry over between runs.

## The `/browser` skill

The skill tells an agent how to test a page here: check the URL answers, use the DevTools MCP tools, collect console and network errors, take screenshots, and re-run the check after a fix. Ask for it by name:

```text
/browser http://localhost:3000 add a note and confirm it appears without console errors
```

Claude Code, Copilot CLI, Codex, OpenCode and Antigravity all load it. It lives in the image at `/opt/agentic-devbox/skills/browser/SKILL.md` and is symlinked into each agent's skills folder, so image updates reach every project. Add your own skills under `.agentic-devbox/home/agents/skills/<name>/SKILL.md`; every agent in the project sees them.

## Chrome DevTools MCP tools

The global layer configures [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) with `--browser-url=http://127.0.0.1:9222`, so it attaches to the sandbox Chrome instead of launching its own. Version 1.11.0 gives agents 32 tools, including:

| Task | Tools |
| --- | --- |
| Open and move between pages | `new_page`, `navigate_page`, `list_pages`, `select_page` |
| Read and interact | `take_snapshot` (accessibility tree with element ids), `click`, `fill`, `fill_form`, `press_key` |
| Debug | `list_console_messages`, `list_network_requests`, `get_network_request`, `evaluate_script` |
| Check visuals and speed | `take_screenshot`, `emulate`, `performance_start_trace`, `performance_stop_trace` |

If a project brings its own `chrome-devtools` server in `.mcp.json`, Claude Code prefers the project's definition once you trust the folder. Narrow the global server to the other agents to avoid the duplicate ([configuration.md](configuration.md#narrow-a-global-server-in-one-project)).

## The `devbox-browser` command

```bash
devbox-browser status                                   # Chrome version and open tabs
devbox-browser open http://localhost:3000               # HTTP status, title, final URL as JSON
devbox-browser console http://localhost:3000            # console, page errors, failed requests; exit 1 on errors
devbox-browser screenshot http://localhost:3000 /tmp/home.png --full-page
```

From your host, prefix with `agentic-devbox browser` (for example `agentic-devbox browser status`). Screenshots default to `/tmp/devbox-browser/`, outside your repository. Options: `--wait <ms>` extra settle time, `--timeout <ms>`, `--width`, `--height`.

## Scripted flows

`devbox-browser run` connects to the sandbox Chrome, opens a fresh tab and calls your script's default export with a [Puppeteer](https://pptr.dev) `page`. A thrown error fails the run with exit code 1, so scripts double as end-to-end checks. The example project ships [`tests/browser/add-note.mjs`](../project-template/tests/browser/add-note.mjs):

```js
export default async function addNote({ page, args }) {
  const baseUrl = args[0] ?? 'http://localhost:3000';
  const text = `note from the sandbox browser ${Date.now()}`;

  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.type('#text', text);
  await page.click('button[type=submit]');
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll('#notes li')].some((li) => li.textContent === expected),
    {},
    text,
  );
  await page.screenshot({ path: '/tmp/devbox-browser/add-note.png', fullPage: true });
  return { ok: true };
}
```

```bash
devbox-browser run tests/browser/add-note.mjs
```

[Playwright](https://playwright.dev) is installed too (`playwright-core`). Save this as `check.cjs` and run it with `node check.cjs`:

```js
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.goto('http://localhost:3000');
  console.log(await page.title());
  await page.close();
  await browser.close(); // disconnects; the sandbox keeps Chrome running
})();
```

`require` finds the preinstalled `puppeteer-core` and `playwright-core` through `NODE_PATH`. ES module scripts should use `devbox-browser run`, which passes the objects in.

## Self-signed certificates

A local app on HTTPS with a self-signed certificate fails with `ERR_CERT_AUTHORITY_INVALID`. For local development only, let the sandbox browser accept it:

```yaml
  universal-agent:
    environment:
      AGENTIC_DEVBOX_BROWSER_IGNORE_CERT_ERRORS: "1"
```

## Watch the browser from your host

Chrome only listens inside the namespace. To open its DevTools from your machine:

1. Set `AGENTIC_DEVBOX_CDP_EXPOSE: "1"` on `universal-agent`. The sidecar then forwards port 9223 to Chrome.
2. Publish it on the app service, on loopback only: `- "127.0.0.1:9223:9223"`.
3. Restart, then open `http://localhost:9223/json`, or add `localhost:9223` under `chrome://inspect` in your own Chrome.

Anyone who reaches that port controls the sandbox browser, so never publish it on `0.0.0.0`.

## Several sidecars in one namespace

Two sidecars that join the same app container would both start Chrome on port 9222. Give each its own port with `AGENTIC_DEVBOX_CDP_PORT`; the global `chrome-devtools` server follows it automatically.
