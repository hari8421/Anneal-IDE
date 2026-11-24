import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The workspace preference lives outside the project so a fresh launch knows
 * which project to open before any `.anneal/config.json` exists.
 */
export const WORKSPACE_PREF_FILE = path.join(os.homedir(), '.anneal', 'workspace.json');

export type WorkspaceSource = 'arg' | 'env' | 'preference' | 'fallback';

export interface LaunchWorkspace {
  root: string;
  source: WorkspaceSource;
  /** True when the user explicitly chose this folder for this launch. */
  explicit: boolean;
}

export function expandWorkspacePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return path.resolve(trimmed);
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

export function readWorkspacePreference(file: string = WORKSPACE_PREF_FILE): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { workspaceRoot?: unknown };
    const root = typeof parsed.workspaceRoot === 'string' ? expandWorkspacePath(parsed.workspaceRoot) : '';
    return root && isDirectory(root) ? root : undefined;
  } catch {
    return undefined;
  }
}

export function writeWorkspacePreference(root: string, file: string = WORKSPACE_PREF_FILE): void {
  const absolute = expandWorkspacePath(root);
  if (!isDirectory(absolute)) throw new Error(`Folder not found: ${root}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ workspaceRoot: absolute }, null, 2)}\n`, 'utf8');
}

/** Accepts `--workspace /path`, `--workspace=/path`, `-w /path` and a bare directory argument. */
export function workspaceFromArgs(argv: string[] = process.argv): string | undefined {
  const args = argv.slice(2);
  // Explicit flags win regardless of where a bare folder appears.
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--workspace' || arg === '-w') {
      const value = args[index + 1];
      if (value && !value.startsWith('-')) return expandWorkspacePath(value);
    } else if (arg.startsWith('--workspace=')) {
      return expandWorkspacePath(arg.slice('--workspace='.length));
    }
  }
  for (const arg of args) {
    if (arg.startsWith('-')) continue;
    const candidate = expandWorkspacePath(arg);
    if (isDirectory(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Explicit launch arguments win, then environment, then the remembered folder.
 * `fallback` is only for server modes that intentionally have a project root
 * (npm start / dev); the desktop binary passes none so it never silently opens
 * the directory it happened to be launched from.
 */
export function resolveLaunchWorkspace(
  fallback?: string,
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  preferenceFile: string = WORKSPACE_PREF_FILE,
): LaunchWorkspace | undefined {
  const fromArgs = workspaceFromArgs(argv);
  if (fromArgs) return { root: fromArgs, source: 'arg', explicit: true };

  const fromEnv = env.ANNEAL_WORKSPACE ?? env.ANNEAL_ROOT;
  if (fromEnv?.trim()) return { root: expandWorkspacePath(fromEnv), source: 'env', explicit: true };

  const remembered = readWorkspacePreference(preferenceFile);
  if (remembered) return { root: remembered, source: 'preference', explicit: false };

  if (fallback) return { root: expandWorkspacePath(fallback), source: 'fallback', explicit: false };
  return undefined;
}

/** Best-effort native folder picker; returns undefined when cancelled/unavailable. */
export function chooseWorkspaceInteractively(): string | undefined {
  try {
    let raw = '';
    if (process.platform === 'darwin') {
      raw = execFileSync(
        'osascript',
        ['-e', 'set chosenFolder to choose folder with prompt "Choose an Anneal workspace folder"\nPOSIX path of chosenFolder'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
    } else if (process.platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        '$dialog.Description = "Choose an Anneal workspace folder"',
        'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
      ].join('; ');
      raw = execFileSync('powershell', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } else {
      raw = execFileSync('zenity', ['--directory', '--title', 'Choose an Anneal workspace folder'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    }
    const candidate = expandWorkspacePath(raw.trim().split(/\r?\n/)[0] ?? '');
    return isDirectory(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}
