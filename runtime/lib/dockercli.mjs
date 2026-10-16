// Parses the subset of the docker / docker compose command line that the exec bridge
// supports: `docker exec`, `docker ps`, `docker compose exec`, `docker compose ps`,
// and the legacy `docker-compose` spelling of the compose commands.

import fs from 'node:fs';

const COMPOSE_GLOBAL_WITH_VALUE = new Set(['-f', '--file', '-p', '--project-name', '--project-directory', '--profile', '--env-file', '--ansi', '--progress', '--parallel']);
const COMPOSE_GLOBAL_FLAGS = new Set(['--compatibility', '--dry-run', '--all-resources']);
const DOCKER_GLOBAL_WITH_VALUE = new Set(['--context', '-c', '--host', '-H', '--log-level', '-l', '--config']);

function readEnvFile(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => (l.includes('=') ? l : `${l}=${process.env[l] ?? ''}`));
}

// exec [OPTIONS] TARGET COMMAND [ARG...]
function parseExec(args, compose) {
  const out = { op: 'exec', compose, interactive: compose, ttyRequested: compose, detach: false, env: [], user: '', workdir: '' };
  let i = 0;
  const value = (flag) => {
    if (i + 1 >= args.length) throw new Error(`flag ${flag} needs a value`);
    i += 1;
    return args[i];
  };
  for (; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      i += 1;
      break;
    }
    if (!arg.startsWith('-') || arg === '-') break;
    const [flag, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const take = () => (inline !== undefined ? inline : value(flag));
    switch (flag) {
      case '-i':
      case '--interactive':
        out.interactive = true;
        break;
      case '-t':
      case '--tty':
        out.ttyRequested = true;
        break;
      case '-T':
      case '--no-tty':
        out.ttyRequested = false;
        break;
      case '-d':
      case '--detach':
        out.detach = true;
        break;
      case '--privileged':
        out.privileged = true;
        break;
      case '-u':
      case '--user':
        out.user = take();
        break;
      case '-w':
      case '--workdir':
        out.workdir = take();
        break;
      case '-e':
      case '--env':
        out.env.push(take());
        break;
      case '--env-file':
        out.env.push(...readEnvFile(take()));
        break;
      case '--detach-keys':
      case '--index':
        take();
        break;
      default:
        // Combined short flags such as -it, -ti, -itd, or -uroot.
        if (/^-[itdT]+$/.test(flag)) {
          for (const c of flag.slice(1)) {
            if (c === 'i') out.interactive = true;
            if (c === 't') out.ttyRequested = true;
            if (c === 'T') out.ttyRequested = false;
            if (c === 'd') out.detach = true;
          }
        } else if (/^-u.+/.test(flag)) out.user = flag.slice(2);
        else if (/^-w.+/.test(flag)) out.workdir = flag.slice(2);
        else throw new Error(`unsupported option for exec: ${arg}`);
    }
  }
  const [target, ...cmd] = args.slice(i);
  if (!target) throw new Error('exec needs a container (or service) name');
  if (cmd.length === 0) throw new Error('exec needs a command to run');
  return { ...out, target, cmd };
}

function parsePs(args) {
  const out = { op: 'ps', format: '', quiet: false, all: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--format') out.format = args[(i += 1)] ?? '';
    else if (arg.startsWith('--format=')) out.format = arg.slice('--format='.length);
    else if (arg === '-q' || arg === '--quiet') out.quiet = true;
    else if (arg === '-a' || arg === '--all') out.all = true;
    else if (arg === '--services') out.services = true;
    else if (arg === '--no-trunc') continue;
    else throw new Error(`unsupported option for ps: ${arg}`);
  }
  return out;
}

function parseCompose(args) {
  let i = 0;
  for (; i < args.length; i += 1) {
    const arg = args[i];
    if (COMPOSE_GLOBAL_WITH_VALUE.has(arg)) i += 1;
    else if (arg.startsWith('--') && arg.includes('=') && COMPOSE_GLOBAL_WITH_VALUE.has(arg.slice(0, arg.indexOf('=')))) continue;
    else if (COMPOSE_GLOBAL_FLAGS.has(arg)) continue;
    else break;
  }
  const [sub, ...rest] = args.slice(i);
  if (sub === 'exec') return parseExec(rest, true);
  if (sub === 'ps') return parsePs(rest);
  if (sub === 'version') return { op: 'version' };
  throw new Error(`docker compose ${sub ?? ''} is not available in agentic-devbox (supported: exec, ps)`);
}

export function parseDockerArgs(argv, invokedAs = 'docker') {
  if (invokedAs === 'docker-compose') return parseCompose(argv);
  let i = 0;
  for (; i < argv.length; i += 1) {
    if (DOCKER_GLOBAL_WITH_VALUE.has(argv[i])) i += 1;
    else if (argv[i] === '--version' || argv[i] === '-v') return { op: 'version' };
    else if (!argv[i].startsWith('-')) break;
  }
  const [sub, ...rest] = argv.slice(i);
  if (sub === 'exec') return parseExec(rest, false);
  if (sub === 'ps' || (sub === 'container' && rest[0] === 'ls')) return parsePs(sub === 'ps' ? rest : rest.slice(1));
  if (sub === 'compose') return parseCompose(rest);
  if (sub === 'version') return { op: 'version' };
  if (!sub || sub === 'help' || sub === '--help') return { op: 'help' };
  throw new Error(`docker ${sub} is not available in agentic-devbox (supported: exec, ps, compose exec, compose ps)`);
}

// Renders `docker ps --format` templates such as "{{.Names}}\t{{.Image}}".
export function formatPs(containers, { format, quiet, services }) {
  if (services) return containers.map((c) => c.service).filter(Boolean).join('\n');
  if (quiet) return containers.map((c) => c.id.slice(0, 12)).join('\n');
  const fields = { ID: (c) => c.id.slice(0, 12), Names: (c) => c.name, Name: (c) => c.name, Image: (c) => c.image, Status: (c) => c.status, State: (c) => c.state, Service: (c) => c.service };
  if (format && format !== 'table') {
    const template = format.replace(/^table\s+/, '').replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    return containers.map((c) => template.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_, f) => (fields[f] ? fields[f](c) : ''))).join('\n');
  }
  const rows = [['CONTAINER ID', 'IMAGE', 'STATUS', 'NAMES'], ...containers.map((c) => [c.id.slice(0, 12), c.image, c.status, c.name])];
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  return rows.map((r) => r.map((cell, col) => cell.padEnd(widths[col] + 3)).join('').trimEnd()).join('\n');
}
