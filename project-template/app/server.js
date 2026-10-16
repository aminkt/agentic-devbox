// Minimal example app (no dependencies) for agentic-devbox demos:
// a notes page with a form, so agents have something real to browse, click and test.

import http from 'node:http';

const port = Number(process.env.PORT ?? 3000);
const notes = [{ id: 1, text: 'Try: /browser http://localhost:3000 add a note and verify it appears' }];

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Notes · agentic-devbox example</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; }
    form { display: flex; gap: .5rem; } input { flex: 1; padding: .5rem; } button { padding: .5rem 1rem; }
    li { padding: .25rem 0; }
  </style>
</head>
<body>
  <h1>Notes</h1>
  <form id="add">
    <input id="text" name="text" placeholder="Write a note" aria-label="Note text" required>
    <button type="submit">Add</button>
  </form>
  <ul id="notes"></ul>
  <script type="module">
    const list = document.querySelector('#notes');
    async function render() {
      const notes = await (await fetch('/api/notes')).json();
      list.replaceChildren(...notes.map((n) => Object.assign(document.createElement('li'), { textContent: n.text })));
    }
    document.querySelector('#add').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.querySelector('#text');
      await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: input.value }) });
      input.value = '';
      await render();
    });
    render();
  </script>
</body>
</html>`;

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') return send(res, 200, page, 'text/html; charset=utf-8');
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && req.url === '/api/notes') return send(res, 200, notes);
  if (req.method === 'POST' && req.url === '/api/notes') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const text = String(JSON.parse(raw || '{}').text ?? '').trim();
    if (!text) return send(res, 400, { error: 'text is required' });
    const note = { id: notes.length + 1, text: text.slice(0, 500) };
    notes.push(note);
    return send(res, 201, note);
  }
  return send(res, 404, { error: 'not found' });
});

server.listen(port, '0.0.0.0', () => console.log(`notes app listening on http://localhost:${port}`));
