import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tempDir, writeFiles } from './helpers';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let child: ChildProcess | undefined;
let baseUrl = '';
let workspace = '';
let home = '';

async function waitForServer(url: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Server did not become ready in time');
}

beforeAll(async () => {
  workspace = await tempDir('anneal-http-');
  home = await tempDir('anneal-http-home-');
  await writeFiles(workspace, { 'src/existing.ts': 'export const existing = true;\n' });
  const port = 18_000 + Math.floor(Math.random() * 1000);
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: home,
      ANNEAL_WORKSPACE: workspace,
      ANNEAL_PORT: String(port),
      ANNEAL_HOST: '127.0.0.1',
      ANNEAL_MODEL: 'test-model',
      // Point at an unreachable address so the health check always reports offline.
      LMSTUDIO_BASE_URL: 'http://127.0.0.1:19999/v1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.resume();
  child.stderr?.resume();
  await waitForServer(baseUrl);
}, 60_000);

afterAll(() => {
  child?.kill('SIGTERM');
});

describe('HTTP API', () => {
  it('reports health with LM Studio offline instead of crashing', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; lmStudio: { ok: boolean; model: string }; config: { workspaceRoot: string } };
    expect(body.ok).toBe(false);
    expect(body.lmStudio.ok).toBe(false);
    expect(body.config.workspaceRoot).toBe(workspace);
  });

  it('persists the self-heal setting through the config API', async () => {
    const update = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selfHeal: false }),
    });
    expect(update.status).toBe(200);
    expect((await update.json() as { config: { selfHeal: boolean } }).config.selfHeal).toBe(false);

    const health = (await (await fetch(`${baseUrl}/api/health`)).json()) as { config: { selfHeal: boolean } };
    expect(health.config.selfHeal).toBe(false);

    const persisted = JSON.parse(await fs.readFile(path.join(workspace, '.anneal/config.json'), 'utf8')) as {
      selfHeal: boolean;
    };
    expect(persisted.selfHeal).toBe(false);

    const restore = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selfHeal: true }),
    });
    expect(restore.status).toBe(200);
  });

  it('lists, reads, writes and deletes workspace files', async () => {
    const tree = (await (await fetch(`${baseUrl}/api/files`)).json()) as { tree: Array<{ name: string }> };
    expect(tree.tree.some((node) => node.name === 'src')).toBe(true);

    const write = await fetch(`${baseUrl}/api/file`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'src/created.ts', content: 'export const created = 1;\n' }),
    });
    expect(write.status).toBe(200);

    const read = (await (await fetch(`${baseUrl}/api/file?path=src/created.ts`)).json()) as { content: string; language: string };
    expect(read.content).toContain('created = 1');
    expect(read.language).toBe('typescript');

    const removed = await fetch(`${baseUrl}/api/file?path=src/created.ts`, { method: 'DELETE' });
    expect(removed.status).toBe(200);
    expect((await fetch(`${baseUrl}/api/file?path=src/created.ts`)).status).toBe(404);
  });

  it('refuses path escapes from the HTTP layer', async () => {
    const response = await fetch(`${baseUrl}/api/file?path=${encodeURIComponent('../../etc/passwd')}`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/escapes the workspace/);
  });

  it('creates specs and persists tasks', async () => {
    const created = await fetch(`${baseUrl}/api/specs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'HTTP Flow' }),
    });
    expect(created.status).toBe(200);
    const { spec } = (await created.json()) as { spec: { id: string } };
    expect(spec.id).toBe('http-flow');

    const list = (await (await fetch(`${baseUrl}/api/specs`)).json()) as { specs: Array<{ id: string }> };
    expect(list.specs.map((entry) => entry.id)).toContain('http-flow');

    const save = await fetch(`${baseUrl}/api/specs/http-flow/tasks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '# Tasks\n\n- [ ] 1. Do it (R1)\n' }),
    });
    expect(save.status).toBe(200);

    const detail = (await (await fetch(`${baseUrl}/api/specs/http-flow`)).json()) as { tasksParsed: Array<{ id: string }> };
    expect(detail.tasksParsed.map((task) => task.id)).toEqual(['1']);
  });

  it('creates and lists checkpoints', async () => {
    const created = await fetch(`${baseUrl}/api/checkpoints`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'http snapshot' }),
    });
    expect(created.status).toBe(200);
    const { checkpoint } = (await created.json()) as { checkpoint: { id: string; label: string } };
    expect(checkpoint.label).toBe('http snapshot');

    const list = (await (await fetch(`${baseUrl}/api/checkpoints`)).json()) as { checkpoints: Array<{ id: string }> };
    expect(list.checkpoints.map((entry) => entry.id)).toContain(checkpoint.id);

    const diff = (await (await fetch(`${baseUrl}/api/checkpoints/${checkpoint.id}/diff`)).json()) as { diff: unknown[] };
    expect(Array.isArray(diff.diff)).toBe(true);
  });

  it('exposes run history and steering metadata', async () => {
    const runs = (await (await fetch(`${baseUrl}/api/runs`)).json()) as { runs: unknown[] };
    expect(Array.isArray(runs.runs)).toBe(true);
    const steering = (await (await fetch(`${baseUrl}/api/steering`)).json()) as { steering: unknown[] };
    expect(Array.isArray(steering.steering)).toBe(true);
  });

  it('searches workspace text through the HTTP API', async () => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'existing', glob: 'src/**/*.ts' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      matches: Array<{ path: string; line: number; text: string }>;
    };
    expect(body.matches.some((match) => match.path === 'src/existing.ts')).toBe(true);
  });

  it('runs an allowlisted shell command through the HTTP API', async () => {
    const response = await fetch(`${baseUrl}/api/terminal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ command: 'echo terminal-ok' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; output: string };
    expect(body.ok).toBe(true);
    expect(body.output).toContain('terminal-ok');
  });

  it('renames a workspace file and notifies hooks', async () => {
    const response = await fetch(`${baseUrl}/api/rename`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'src/existing.ts', to: 'src/renamed.ts' }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { from: string; to: string };
    expect(body.to).toBe('src/renamed.ts');
    expect((await fetch(`${baseUrl}/api/file?path=src/renamed.ts`)).status).toBe(200);
  });

  it('switches the active workspace and remembers the choice', async () => {
    const next = await tempDir('anneal-http-switch-');
    await writeFiles(next, { 'src/second.ts': 'export const second = true;\n' });
    const post = (folder: string) =>
      fetch(`${baseUrl}/api/workspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: folder }),
      });

    const before = (await (await fetch(`${baseUrl}/api/workspace`)).json()) as { root: string };
    expect(before.root).toBe(workspace);

    const switched = await post(next);
    expect(switched.status).toBe(200);
    const switchedBody = (await switched.json()) as { root: string; preference: string };
    expect(switchedBody.root).toBe(path.resolve(next));

    const health = (await (await fetch(`${baseUrl}/api/health`)).json()) as {
      config: { workspaceRoot: string };
    };
    expect(health.config.workspaceRoot).toBe(path.resolve(next));

    const tree = (await (await fetch(`${baseUrl}/api/files`)).json()) as {
      tree: Array<{ name: string }>;
    };
    expect(tree.tree.some((node) => node.name === 'second.ts')).toBe(false);
    const nested = (await (await fetch(`${baseUrl}/api/files?path=src`)).json()) as {
      tree: Array<{ name: string }>;
    };
    expect(nested.tree.some((node) => node.name === 'second.ts')).toBe(true);

    const preference = JSON.parse(
      await fs.readFile(path.join(home, '.anneal', 'workspace.json'), 'utf8'),
    ) as { workspaceRoot: string };
    expect(preference.workspaceRoot).toBe(path.resolve(next));

    await post(workspace);
  });
});
