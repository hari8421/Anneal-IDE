import fs from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentEvent } from '../server/agent/loop';
import { loadConfig } from '../server/config';
import { explainSections, isExplanationGoal } from '../server/context/explain';
import { AnnealService } from '../server/service';
import { fakeClient, tempDir, textResult, writeFiles } from './helpers';

let root: string | undefined;

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('codebase explanations', () => {
  it('routes read-only questions to the fast path and leaves change goals alone', () => {
    for (const goal of [
      'explain the codebase',
      'please describe this project',
      'how does the agent loop work?',
      'what does the context builder do?',
      'summarise the steering conventions',
      'walk me through the repo',
      'tell me about the provider switch',
      'give me a codebase overview',
      'overview of the architecture',
      'help me understand the retry policy',
    ]) {
      expect(isExplanationGoal(goal), goal).toBe(true);
    }
    for (const goal of [
      'add a test for the parser',
      'fix the bug in the agent loop',
      'explain the codebase and add tests',
      'describe this project, then fix the bug',
      'refactor the provider switch',
    ]) {
      expect(isExplanationGoal(goal), goal).toBe(false);
    }
  });

  it('gathers a workspace map, entry files, relevance matches and attachments', async () => {
    root = await tempDir('anneal-explain-');
    await writeFiles(root, {
      'README.md': '# Demo\nA demo project.',
      'package.json': '{"name":"demo"}',
      'src/auth.ts': 'export const login = () => true;',
      'src/notes.txt': 'plain notes',
    });

    const sections = await explainSections(root, 'explain the auth flow', ['src/notes.txt']);

    expect(sections[0]).toMatchObject({ id: 'workspace:map', kind: 'file' });
    expect(sections[0]!.content).toContain('README.md');
    expect(sections.some((section) => section.id === 'explain:README.md')).toBe(true);
    expect(sections.some((section) => section.id === 'explain:src/auth.ts')).toBe(true);
    expect(sections.some((section) => section.id === 'explain:src/notes.txt')).toBe(true);
  });

  it('caps individual file excerpts so an explanation stays bounded', async () => {
    root = await tempDir('anneal-explain-');
    await writeFiles(root, { 'src/huge.ts': `${'x'.repeat(20_000)}\n` });

    const sections = await explainSections(root, 'explain the project', ['src/huge.ts']);
    const huge = sections.find((section) => section.id === 'explain:src/huge.ts');

    expect(huge?.content).toContain('… (truncated)');
    expect(huge!.content.length).toBeLessThan(6100);
  });

  it('answers an explanatory run in one call without tools or a journal', async () => {
    root = await tempDir('anneal-explain-');
    await writeFiles(root, {
      'README.md': '# Demo\nA small demo project.',
      'src/index.ts': 'export const main = () => 1;\n',
    });
    const client = fakeClient(async (_request, onDelta) => {
      onDelta('Project overview.\n');
      return textResult('Project overview.\n');
    });
    const service = new AnnealService(loadConfig({ workspaceRoot: root, env: {} }), client);
    const events: AgentEvent[] = [];

    const result = await service.run({ goal: 'explain the codebase', onEvent: (event) => events.push(event) });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.tools).toBeUndefined();
    expect(client.calls[0]!.messages[0]!.content).toMatch(/read-only/i);
    expect(client.calls[0]!.messages[1]!.content).toContain('README.md');
    expect(result).toMatchObject({ status: 'completed', steps: 1, toolCalls: 0, resumable: false });
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(['context', 'assistant.delta', 'assistant.message']));
    expect(await service.runs()).toHaveLength(0);
  });

  it('adds workspace context to Ask without forcing the explanation format', async () => {
    root = await tempDir('anneal-explain-');
    await writeFiles(root, { 'README.md': '# Demo\nA small demo project.' });
    const client = fakeClient(async (_request, onDelta) => {
      onDelta('It is a small demo project.');
      return textResult('It is a small demo project.');
    });
    const service = new AnnealService(loadConfig({ workspaceRoot: root, env: {} }), client);
    const deltas: string[] = [];

    const answer = await service.chatStream({
      messages: [{ role: 'user', content: 'what does this project do?' }],
      contextual: true,
      onDelta: (chunk) => deltas.push(chunk),
    });

    expect(answer.content).toBe('It is a small demo project.');
    expect(deltas.join('')).toBe(answer.content);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.messages[0]!.content).toMatch(/answering a question inside a local IDE/i);
    expect(client.calls[0]!.messages[0]!.content).not.toMatch(/at most 500 words/i);
    expect(client.calls[0]!.messages[1]!.content).toContain('README.md');
    expect(client.calls[0]!.messages[1]!.content).toContain('what does this project do?');
  });
});
