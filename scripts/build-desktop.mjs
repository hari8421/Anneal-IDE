#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PKGDIST = join(ROOT, '.desktop-pkg-dist');
const OUT = join(ROOT, 'pkg-out');
const ENTRY = join(ROOT, '.desktop-entry.ts');

process.env.NODE_ENV = 'production';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const TARGETS =
  process.env.ANNEAL_DESKTOP_TARGETS ??
  pkg['pkg:targets'] ??
  ['node24-linux-x64', 'node24-macos-arm64', 'node24-win-x64'].join(',');
const OUT_PATH = process.env.ANNEAL_DESKTOP_OUT ?? join(OUT, 'anneal');
const COMPRESS = pkg['pkg:compress'] ?? 'GZip';

console.log(`[build-desktop] targets: ${TARGETS}`);
console.log(`[build-desktop] out: ${OUT_PATH}`);

if (!existsSync(DIST) || !existsSync(join(DIST, 'index.html'))) {
  console.log('[build-desktop] no dist found — running npm run build');
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
}

// --- Stage a minimal, self-contained tree -----------------------------------
// The SPA is copied wholesale (Vite emits hashed assets), and the server is
// bundled into a single CommonJS file so the snapshot needs no module
// resolution at runtime.
rmSync(PKGDIST, { recursive: true, force: true });
mkdirSync(PKGDIST, { recursive: true });
cpSync(DIST, join(PKGDIST, 'dist'), { recursive: true });

writeFileSync(ENTRY, entrySource(), 'utf8');
try {
  const { build } = await import('esbuild');
  await build({
    entryPoints: [ENTRY],
    outfile: join(PKGDIST, 'dist', 'bin', 'anneal-server.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    logLevel: 'warning',
    legalComments: 'none',
  });
} finally {
  rmSync(ENTRY, { force: true });
}

writeFileSync(
  join(PKGDIST, 'package.json'),
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      private: true,
      type: 'commonjs',
      bin: { anneal: './dist/bin/anneal-server.cjs' },
      // pkg only snapshots files listed as assets; the SPA must be explicit.
      pkg: { assets: ['dist/**/*'], scripts: [] },
    },
    null,
    2,
  )}\n`,
  'utf8',
);

const bundlePath = join(PKGDIST, 'dist', 'bin', 'anneal-server.cjs');
console.log(`[build-desktop] bundled server: ${relative(ROOT, bundlePath)}`);

if (process.env.ANNEAL_DESKTOP_SKIP_PKG === '1') {
  console.log('[build-desktop] ANNEAL_DESKTOP_SKIP_PKG=1 — packaging skipped');
  process.exit(0);
}

// --- Package per platform ----------------------------------------------------
// Prefer the locally installed @yao-pkg/pkg. `npx pkg` can otherwise resolve the
// abandoned `pkg@5.x` from the registry, which cannot target node24.
const LOCAL_PKG = join(ROOT, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
if (!existsSync(LOCAL_PKG)) {
  console.error('[build-desktop] @yao-pkg/pkg is not installed — run npm install first');
  process.exit(1);
}

const targets = TARGETS.split(',').map((target) => target.trim()).filter(Boolean);
const singleTarget = targets.length === 1;
const outPaths = targets.map((target) => {
  const parts = target.split('-');
  const platform = parts[1];
  const arch = parts.slice(2).join('-');
  const ext = platform === 'win' ? '.exe' : '';
  return join(OUT_PATH, `${pkg.name}-${platform}-${arch}${ext}`);
});

// For a single target pkg writes an unsuffixed binary (or treats an extensionless
// out path as a directory), so let it write into the output directory and then
// rename to the canonical platform-suffixed name.
const rawOutPaths = singleTarget
  ? [join(OUT_PATH, `${pkg.name}${targets[0].split('-')[1] === 'win' ? '.exe' : ''}`)]
  : outPaths;

// pkg refuses to replace an existing output on this platform and exits 0, so a
// rebuild could silently ship the previous binary. Clear every output this run
// owns, including stale directories from earlier builds.
mkdirSync(OUT_PATH, { recursive: true });
for (const path of [...outPaths, ...rawOutPaths]) rmSync(path, { recursive: true, force: true });

console.log(`[build-desktop] packaging ${TARGETS}`);
try {
  execFileSync(
    process.execPath,
    [
      LOCAL_PKG,
      PKGDIST,
      '--target',
      TARGETS,
      '--compress',
      COMPRESS,
      '--out-path',
      OUT_PATH,
      '--options',
      'experimental-require-module',
      // Bytecode compilation makes pkg *spawn* the target-architecture Node
      // binary. When the target arch is not the host's (an arm64 Mac building
      // linux-x64/win-x64 here), that spawn dies with EBADARCH — the opaque
      // "spawn Unknown system error -86". Without bytecode pkg only copies
      // files, so cross-building from any host works.
      '--no-bytecode',
      '--public',
      '--public-packages',
      '*',
    ],
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '' } },
  );
} catch {
  console.error('[build-desktop] pkg failed — check the output above');
  process.exit(1);
}

// pkg spawns writers that can outlive the parent process, so its exit does not
// mean the binaries are on disk yet. Poll until every file exists and its size
// holds steady between two polls.
const waitForFiles = async (paths) => {
  const deadline = Date.now() + 120_000;
  const sizes = new Map();
  const isFile = (path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  };
  while (Date.now() < deadline) {
    let allPresent = true;
    let allStable = true;
    for (const path of paths) {
      if (!isFile(path)) {
        allPresent = false;
        break;
      }
      const size = sizeOf(path);
      if (size <= 0 || sizes.get(path) !== size) allStable = false;
      sizes.set(path, size);
    }
    if (allPresent && allStable) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
};

if (!(await waitForFiles(rawOutPaths))) {
  console.error('[build-desktop] pkg did not produce the expected output: ' + rawOutPaths.join(', '));
  process.exit(1);
}
if (singleTarget) {
  for (let i = 0; i < rawOutPaths.length; i += 1) {
    rmSync(outPaths[i], { recursive: true, force: true });
    renameSync(rawOutPaths[i], outPaths[i]);
  }
}
if (!(await waitForFiles(outPaths))) {
  console.warn('[build-desktop] final binary paths did not stabilise; falling back to discovery');
}

const files = walkSync(OUT);
const binaries = files.filter((file) => {
  const name = basename(file);
  if (name.endsWith('.exe') || /^anneal(-ide)?-/.test(name)) return true;
  return sizeOf(file) >= 5_000_000;
});
if (binaries.length === 0) {
  console.error('[build-desktop] no output binaries discovered under ' + OUT);
  console.error('[build-desktop] files under output dir:', files.map((f) => relative(OUT, f)).join(', '));
  process.exit(1);
}

let allOk = true;
for (const candidate of binaries) {
  const size = sizeOf(candidate);
  if (size < 5_000_000) {
    console.warn(`[build-desktop] suspiciously small output: ${relative(ROOT, candidate)} (${size} bytes)`);
    allOk = false;
  } else {
    console.log(`[build-desktop] OK ${relative(ROOT, candidate)} (${size} bytes)`);
  }
}
if (!allOk) process.exit(1);

console.log(`[build-desktop] done — binaries under ${OUT}`);

function entrySource() {
  return `import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer, finishShutdown } from './server/http';
import {
  chooseWorkspaceInteractively,
  resolveLaunchWorkspace,
  writeWorkspacePreference,
} from './server/workspace';

// A double-clicked binary that only prints to a console nobody is watching looks
// broken, so the desktop entry opens the UI. ANNEAL_NO_OPEN=1 opts out (servers,
// CI) and a missing opener degrades to a warning instead of a failed start.
function openBrowser(url: string): void {
  const command: string =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args: string[] =
    command === 'open' ? [url] : command === 'cmd' ? ['/c', 'start', '', url] : [url];
  const fallback = () => console.warn('[anneal] could not open a browser — open ' + url + ' manually');
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', fallback);
    child.unref();
  } catch {
    fallback();
  }
}

async function main() {
  // Bundled into dist/bin, so the copied SPA sits one level up.
  const embeddedDist = process.env.ANNEAL_EMBEDDED_DIST ?? path.join(__dirname, '..');

  // Never silently open the directory the binary happened to be launched from.
  // Explicit flag/env wins, then the remembered folder, then a native picker.
  let launch = resolveLaunchWorkspace();
  if (!launch && process.env.ANNEAL_NO_PROMPT !== '1') {
    const chosen = chooseWorkspaceInteractively();
    if (chosen) launch = { root: chosen, source: 'arg', explicit: true };
  }
  if (!launch) {
    console.error(
      '[anneal] no workspace selected. Launch with --workspace /path/to/project or set ANNEAL_WORKSPACE.',
    );
    process.exit(1);
  }
  const workspace = launch.root;
  if (launch.explicit) writeWorkspacePreference(workspace);
  console.log('[anneal] workspace: ' + workspace);
  const server = await createServer({ workspace, embeddedDist });
  await server.listen();

  const url =
    'http://' + (process.env.ANNEAL_HOST ?? '127.0.0.1') + ':' + (process.env.ANNEAL_PORT ?? '8787');
  if (process.env.ANNEAL_NO_OPEN === '1') {
    console.log('[anneal] browser auto-open disabled; open ' + url + ' manually');
  } else {
    console.log('[anneal] opening ' + url);
    openBrowser(url);
  }

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await finishShutdown().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  console.error('[anneal] could not start:', error);
  process.exit(1);
});
`;
}

function sizeOf(path) {
  try {
    return statSync(path).size;
  } catch {
    return -1;
  }
}

function walkSync(root) {
  const list = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      if (!statSync(dir).isDirectory()) continue;
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) list.push(full);
    }
  }
  return list;
}
