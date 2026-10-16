// Live MCP handshake: initialize + tools/list against each configured server.
// stdio servers are spawned exactly as agents would spawn them; http servers get a POST.

import { spawn } from 'node:child_process';

const PROTOCOL = '2025-06-18';
const CLIENT = { name: 'agentic-devbox-check', version: '1.0.0' };

function rpc(id, method, params = {}) {
  return { jsonrpc: '2.0', id, method, params };
}

function checkStdio(server, env, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(server.command, server.args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    let stderr = '';
    const finish = (result) => {
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: `timed out after ${timeoutMs / 1000}s ${stderr.trim().split('\n').at(-1) ?? ''}` }), timeoutMs);
    const send = (msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);

    child.on('error', (err) => finish({ ok: false, error: err.message }));
    child.on('exit', (code) => finish({ ok: false, error: `exited with code ${code}: ${stderr.trim().split('\n').at(-1) ?? ''}` }));
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue; // servers sometimes log to stdout; ignore non-JSON lines
        }
        if (msg.id === 1) {
          if (msg.error) return finish({ ok: false, error: msg.error.message });
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send(rpc(2, 'tools/list'));
        } else if (msg.id === 2) {
          if (msg.error) return finish({ ok: false, error: msg.error.message });
          return finish({ ok: true, tools: (msg.result?.tools ?? []).map((t) => t.name) });
        }
      }
    });
    send(rpc(1, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT }));
  });
}

async function checkHttp(server, headers, timeoutMs) {
  try {
    const res = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(rpc(1, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT })),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: `HTTP ${res.status}: reachable, but credentials were rejected or are missing` };
    return res.ok ? { ok: true, tools: null } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.cause?.message ?? err.message };
  }
}

export async function checkServer(server, ctx, timeoutMs = 90000) {
  if (server.type === 'stdio') {
    return checkStdio({ command: server.command, args: ctx.expand(server.args) }, ctx.expand(server.env), timeoutMs);
  }
  return checkHttp({ url: ctx.expand(server.url) }, ctx.expand(server.headers), Math.min(timeoutMs, 20000));
}
