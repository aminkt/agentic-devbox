// Shared pieces of the exec bridge: the frame protocol spoken over the bridge's unix
// socket, and a minimal Docker Engine API client used by the bridge server.
//
// Frame: [type: 1 byte][length: 4 bytes, big endian][payload]. Both directions use it.

import http from 'node:http';

export const DEFAULT_BRIDGE_SOCKET = '/run/agent-exec-bridge/bridge.sock';

export const FRAME = {
  STDIN: 0,
  STDOUT: 1,
  STDERR: 2,
  EXIT: 3, // payload: {"code": n}
  ERROR: 4, // payload: message text
  RESIZE: 5, // payload: {"cols": n, "rows": n}
  STDIN_END: 6,
  RESULT: 7, // payload: JSON (ps output)
  REQUEST: 9, // payload: JSON request, always the first frame from the client
};

export function encodeFrame(type, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const header = Buffer.alloc(5);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(body.length, 1);
  return Buffer.concat([header, body]);
}

// Incremental decoder: feed it chunks, it calls onFrame(type, payload) per complete frame.
export class FrameDecoder {
  constructor(onFrame, maxFrame = 8 * 1024 * 1024) {
    this.onFrame = onFrame;
    this.maxFrame = maxFrame;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.buffer.length >= 5) {
      const length = this.buffer.readUInt32BE(1);
      if (length > this.maxFrame) throw new Error(`frame of ${length} bytes exceeds the limit`);
      if (this.buffer.length < 5 + length) return;
      const type = this.buffer.readUInt8(0);
      const payload = this.buffer.subarray(5, 5 + length);
      this.buffer = this.buffer.subarray(5 + length);
      this.onFrame(type, payload);
    }
  }
}

// Docker multiplexes stdout and stderr of non-TTY execs: [stream][0 0 0][size BE][data].
export class DockerStreamDemuxer {
  constructor(onData) {
    this.onData = onData;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.buffer.length >= 8) {
      const size = this.buffer.readUInt32BE(4);
      if (this.buffer.length < 8 + size) return;
      this.onData(this.buffer.readUInt8(0) === 2 ? 'stderr' : 'stdout', this.buffer.subarray(8, 8 + size));
      this.buffer = this.buffer.subarray(8 + size);
    }
  }
}

export class DockerClient {
  constructor(socketPath = '/var/run/docker.sock') {
    this.socketPath = socketPath;
  }

  request(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        { socketPath: this.socketPath, method, path, headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => {
            const parsed = data ? safeJson(data) : null;
            if (res.statusCode >= 400) reject(new Error(parsed?.message ?? `Docker API ${method} ${path}: HTTP ${res.statusCode}`));
            else resolve(parsed);
          });
        },
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Starts an exec and returns the hijacked raw socket (plus any bytes already read).
  startExec(execId, tty) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ Detach: false, Tty: tty });
      const req = http.request({
        socketPath: this.socketPath,
        method: 'POST',
        path: `/exec/${execId}/start`,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), connection: 'Upgrade', upgrade: 'tcp' },
      });
      req.on('upgrade', (_res, socket, head) => resolve({ socket, head }));
      req.on('response', (res) => reject(new Error(`exec start was not upgraded (HTTP ${res.statusCode})`)));
      req.on('error', reject);
      req.end(payload);
    });
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.trim() };
  }
}
