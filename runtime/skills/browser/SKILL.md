---
name: browser
description: Test and debug the running web app in the sandbox's isolated headless Chrome (DevTools on localhost:9222). Use when asked to open, check, screenshot, click through, debug console or network errors, or measure performance of a page served by the project (e.g. http://localhost:3000). Invoke as /browser <url> <goal>.
---

# Browser testing inside agentic-devbox

The sandbox runs its own headless Google Chrome. It never uses the host's browser.

- DevTools endpoint: `http://127.0.0.1:9222` (check with `curl -s http://127.0.0.1:9222/json/version`).
- The agent shares the app container's network, so the app is reachable at `http://localhost:<port>`.
- Every container start gets a fresh, throwaway browser profile: no cookies or saved logins.

## How to work

1. **Confirm the target is up.** Run `curl -sS -o /dev/null -w '%{http_code}\n' <url>`. If it fails, check the app logs before touching the browser.
2. **Prefer the `chrome-devtools` MCP tools** when they are available. They are already connected to the sandbox Chrome:
   - `navigate_page` / `new_page` to open the URL,
   - `take_snapshot` to read the accessibility tree and get element `uid`s, then `click`, `fill`, `fill_form` and `press_key` to interact,
   - `list_console_messages` and `list_network_requests` / `get_network_request` to debug,
   - `take_screenshot` for visual checks,
   - `performance_start_trace` / `performance_stop_trace` for Core Web Vitals.
3. **Without MCP, use the `devbox-browser` CLI:**
   - `devbox-browser open <url>`: HTTP status, title and final URL as JSON.
   - `devbox-browser console <url>`: console output, page errors, failed and 4xx/5xx requests (exits 1 on errors).
   - `devbox-browser screenshot <url> [/tmp/shot.png] --full-page`: then open the PNG to inspect it.
   - `devbox-browser run script.mjs`: for multi-step flows. The script exports `default async ({ page, browser, args })` and uses the Puppeteer API on `page`.
4. **Report** what you checked, what you saw (quote console errors exactly) and the screenshot paths. If you changed code to fix an issue, re-run the same check to prove the fix.

## Rules

- Only browse the project's own URLs (localhost or the compose service names) unless the user asks for something else.
- Never type real credentials into pages. Use the test accounts from the project's docs or seed data.
- Leave the browser as you found it: close the tabs you opened.
