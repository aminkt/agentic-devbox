import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DockerStreamDemuxer, encodeFrame, FRAME, FrameDecoder } from '../lib/bridge.mjs';
import { formatPs, parseDockerArgs } from '../lib/dockercli.mjs';

test('docker exec -it with an absolute script path', () => {
  const r = parseDockerArgs(['exec', '-it', 'jom_app', 'php', '/app/www/html/jom_adira_0/tools/DB/db-cli.php', '--sql', 'SELECT 1 from dual']);
  assert.equal(r.op, 'exec');
  assert.equal(r.target, 'jom_app');
  assert.equal(r.interactive, true);
  assert.equal(r.ttyRequested, true);
  assert.deepEqual(r.cmd, ['php', '/app/www/html/jom_adira_0/tools/DB/db-cli.php', '--sql', 'SELECT 1 from dual']);
});

test('docker exec -i with bash -c keeps the script as one argument', () => {
  const script = 'cd /app/www/html/jom_adira_0 && php vendor/bin/phpunit --testsuite=SiteComponents --no-coverage';
  const r = parseDockerArgs(['exec', '-i', 'jom_app', 'bash', '-c', script]);
  assert.deepEqual(r.cmd, ['bash', '-c', script]);
  assert.equal(r.ttyRequested, false);
});

test('user, workdir and env flags in every spelling', () => {
  const r = parseDockerArgs(['exec', '-i', '-u', '1000:1000', '--workdir=/app/www', '-e', 'A=1', '--env', 'B=2', 'jom_app', 'php', 'upgrade.php']);
  assert.equal(r.user, '1000:1000');
  assert.equal(r.workdir, '/app/www');
  assert.deepEqual(r.env, ['A=1', 'B=2']);
  assert.equal(parseDockerArgs(['exec', '--user=root', 'jom_app', 'id']).user, 'root');
  assert.equal(parseDockerArgs(['exec', '-uroot', 'jom_app', 'id']).user, 'root');
});

test('docker-compose and docker compose exec, with global flags and -T', () => {
  const legacy = parseDockerArgs(['exec', 'jom_app', 'bash', '-c', 'cd /app/www/html/jom_adira_1 && ./vendor/bin/phpunit'], 'docker-compose');
  assert.equal(legacy.compose, true);
  assert.equal(legacy.interactive, true);
  assert.equal(legacy.ttyRequested, true);
  const modern = parseDockerArgs(['compose', '-f', 'docker-compose.yml', '--project-name=x', 'exec', '-T', 'jom_app', 'ls']);
  assert.equal(modern.target, 'jom_app');
  assert.equal(modern.ttyRequested, false);
  assert.deepEqual(modern.cmd, ['ls']);
});

test('ps with a Go template', () => {
  const r = parseDockerArgs(['ps', '--format', '{{.Names}}\\t{{.Image}}']);
  assert.equal(r.op, 'ps');
  const out = formatPs([{ id: 'abcdef1234567890', name: 'jom_app', image: 'juris_orgination_ps', status: 'Up', state: 'running', service: 'jom_app' }], r);
  assert.equal(out, 'jom_app\tjuris_orgination_ps');
});

test('unsupported commands and incomplete exec are rejected', () => {
  assert.throws(() => parseDockerArgs(['run', 'alpine']), /not available/);
  assert.throws(() => parseDockerArgs(['exec', '-it', 'jom_app']), /needs a command/);
  assert.throws(() => parseDockerArgs(['compose', 'up']), /not available/);
});

test('frames survive arbitrary chunking', () => {
  const frames = [];
  const decoder = new FrameDecoder((type, payload) => frames.push([type, payload.toString()]));
  const wire = Buffer.concat([encodeFrame(FRAME.STDOUT, 'hello'), encodeFrame(FRAME.EXIT, { code: 3 })]);
  for (const byte of wire) decoder.push(Buffer.from([byte]));
  assert.deepEqual(frames, [[FRAME.STDOUT, 'hello'], [FRAME.EXIT, '{"code":3}']]);
});

test('docker stream demuxer splits stdout and stderr', () => {
  const out = [];
  const demux = new DockerStreamDemuxer((stream, data) => out.push([stream, data.toString()]));
  const frame = (stream, text) => Buffer.concat([Buffer.from([stream, 0, 0, 0]), Buffer.from([0, 0, 0, text.length]), Buffer.from(text)]);
  const wire = Buffer.concat([frame(1, 'out'), frame(2, 'err')]);
  demux.push(wire.subarray(0, 5));
  demux.push(wire.subarray(5));
  assert.deepEqual(out, [['stdout', 'out'], ['stderr', 'err']]);
});
