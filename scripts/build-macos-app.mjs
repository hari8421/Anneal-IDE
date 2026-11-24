#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, '.macos-app-build');
const OUT = join(ROOT, 'app-out');
const APP = join(OUT, 'Anneal IDE.app');
const HELPER = join(ROOT, 'pkg-out', 'anneal', 'anneal-ide-macos-arm64');

if (process.platform !== 'darwin') {
  console.error('[build-app] The native .app target can only be built on macOS.');
  process.exit(1);
}

for (const tool of ['swiftc', 'iconutil', 'codesign']) {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' });
  } catch {
    console.error(`[build-app] Missing required tool: ${tool}`);
    process.exit(1);
  }
}

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

console.log('[build-app] building web assets');
execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });

if (process.env.ANNEAL_APP_SKIP_PKG !== '1') {
  console.log('[build-app] building embedded macOS server');
  execFileSync('npm', ['run', 'build-desktop'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ANNEAL_DESKTOP_TARGETS: 'node24-macos-arm64' },
  });
}
if (!existsSync(HELPER)) {
  console.error(`[build-app] embedded server missing: ${HELPER}`);
  process.exit(1);
}

rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });
const resources = join(BUILD, 'Contents', 'Resources');
const binaries = join(BUILD, 'Contents', 'MacOS');
mkdirSync(resources, { recursive: true });
mkdirSync(binaries, { recursive: true });

console.log('[build-app] compiling native launcher');
execFileSync('swiftc', ['-O', '-o', join(binaries, 'anneal-launcher'), join(ROOT, 'desktop', 'macos', 'Launcher.swift'), '-framework', 'AppKit', '-framework', 'WebKit'], {
  cwd: ROOT,
  stdio: 'inherit',
});

console.log('[build-app] generating app icon');
const iconset = join(BUILD, 'AppIcon.iconset');
mkdirSync(iconset, { recursive: true });
execFileSync('swiftc', ['-O', '-o', join(BUILD, 'make-icon'), join(ROOT, 'desktop', 'macos', 'make-icon.swift'), '-framework', 'AppKit'], {
  cwd: ROOT,
  stdio: 'inherit',
});
execFileSync(join(BUILD, 'make-icon'), [iconset], { stdio: 'inherit' });
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(resources, 'AppIcon.icns')], { stdio: 'inherit' });

copyFileSync(HELPER, join(resources, 'anneal-server'));
chmodSync(join(resources, 'anneal-server'), 0o755);
chmodSync(join(binaries, 'anneal-launcher'), 0o755);

writeFileSync(join(BUILD, 'Contents', 'Info.plist'), infoPlist(version));

rmSync(APP, { recursive: true, force: true });
mkdirSync(APP, { recursive: true });
execFileSync('cp', ['-a', join(BUILD, 'Contents'), APP], { stdio: 'inherit' });

console.log('[build-app] signing app bundle');
execFileSync('codesign', ['--force', '--deep', '--sign', '-', APP], { stdio: 'inherit' });
try {
  execFileSync('xattr', ['-dr', 'com.apple.quarantine', APP], { stdio: 'ignore' });
} catch {
  // No quarantine attribute on a locally built app — nothing to do.
}

const size = (directorySize(APP) / 1024 / 1024).toFixed(1);
console.log(`[build-app] done — ${APP} (${size} MB)`);

function directorySize(target) {
  let total = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const entryPath = join(target, entry.name);
    total += entry.isDirectory() ? directorySize(entryPath) : statSync(entryPath).size;
  }
  return total;
}

function infoPlist(appVersion) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>anneal-launcher</string>
  <key>CFBundleIdentifier</key>
  <string>local.anneal.ide</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Anneal IDE</string>
  <key>CFBundleDisplayName</key>
  <string>Anneal IDE</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${appVersion}</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
`;
}
