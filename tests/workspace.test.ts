import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readWorkspacePreference,
  resolveLaunchWorkspace,
  workspaceFromArgs,
  writeWorkspacePreference,
} from '../server/workspace';
import { tempDir } from './helpers';

describe('workspace selection', () => {
  it('parses explicit --workspace arguments before positional folders', async () => {
    const first = await tempDir('anneal-ws-first-');
    const second = await tempDir('anneal-ws-second-');
    expect(workspaceFromArgs(['node', 'app', first, '--workspace', second])).toBe(path.resolve(second));
    expect(workspaceFromArgs(['node', 'app', `--workspace=${first}`])).toBe(path.resolve(first));
    expect(workspaceFromArgs(['node', 'app', '-w', second])).toBe(path.resolve(second));
  });

  it('prefers arguments, then environment, then the remembered folder', async () => {
    const arg = await tempDir('anneal-ws-arg-');
    const env = await tempDir('anneal-ws-env-');
    const remembered = await tempDir('anneal-ws-saved-');
    const preferenceFile = path.join(await tempDir('anneal-ws-home-'), '.anneal', 'workspace.json');
    writeWorkspacePreference(remembered, preferenceFile);

    expect(resolveLaunchWorkspace(undefined, ['node', 'app', arg], {}, preferenceFile)).toMatchObject({
      root: path.resolve(arg),
      source: 'arg',
      explicit: true,
    });
    expect(resolveLaunchWorkspace(undefined, ['node', 'app'], { ANNEAL_WORKSPACE: env }, preferenceFile)).toMatchObject({
      root: path.resolve(env),
      source: 'env',
      explicit: true,
    });
    expect(resolveLaunchWorkspace(undefined, ['node', 'app'], {}, preferenceFile)).toMatchObject({
      root: path.resolve(remembered),
      source: 'preference',
      explicit: false,
    });
  });

  it('never falls back to the current directory unless a fallback is supplied', async () => {
    const preferenceFile = path.join(await tempDir('anneal-ws-empty-'), '.anneal', 'workspace.json');
    expect(readWorkspacePreference(preferenceFile)).toBeUndefined();
    expect(resolveLaunchWorkspace(undefined, ['node', 'app'], {}, preferenceFile)).toBeUndefined();

    const fallback = await tempDir('anneal-ws-fallback-');
    expect(resolveLaunchWorkspace(fallback, ['node', 'app'], {}, preferenceFile)).toMatchObject({
      root: path.resolve(fallback),
      source: 'fallback',
    });
  });

  it('persists and reloads a workspace preference', async () => {
    const folder = await tempDir('anneal-ws-save-');
    const preferenceFile = path.join(await tempDir('anneal-ws-home-'), '.anneal', 'workspace.json');
    writeWorkspacePreference(folder, preferenceFile);
    expect(readWorkspacePreference(preferenceFile)).toBe(path.resolve(folder));
  });
});
