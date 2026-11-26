import { describe, expect, it } from 'vitest';
import { applyEvent, emptySession, type SessionState } from '../src/lib/session';

/**
 * The transcript reducer is the only place that knows the wire format of an SSE
 * event. The server wraps agent events as `{ type, step, data }`, while `result`
 * and `error` carry their fields at the top level; reading the wrong level used
 * to render empty tool names and no assistant text at all.
 */
const fold = (events: Array<[string, Record<string, unknown>]>): SessionState =>
  events.reduce((state, [event, data]) => applyEvent(state, event, data), emptySession());

describe('session reducer', () => {
  it('pairs a wrapped tool call with its result by name', () => {
    const state = fold([
      ['tool.call', { type: 'tool.call', step: 0, data: { name: 'search', args: { query: 'budget' } } }],
      ['tool.result', { type: 'tool.result', step: 0, data: { name: 'search', content: 'server/config.ts:51' } }],
    ]);

    expect(state.entries).toHaveLength(1);
    const entry = state.entries[0]!;
    expect(entry.kind).toBe('tool');
    expect(entry.name).toBe('search');
    expect(entry.status).toBe('ok');
    expect(entry.args).toContain('budget');
    expect(entry.text).toContain('server/config.ts:51');
  });

  it('streams assistant deltas into one entry and settles it on the final message', () => {
    const state = fold([
      ['assistant.delta', { type: 'assistant.delta', step: 0, data: { text: 'Context is ' } }],
      ['assistant.delta', { type: 'assistant.delta', step: 0, data: { text: 'budgeted.' } }],
      ['assistant.message', { type: 'assistant.message', step: 0, data: { content: 'Context is budgeted.', final: true } }],
    ]);

    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]!.kind).toBe('assistant');
    expect(state.entries[0]!.text).toBe('Context is budgeted.');
    expect(state.entries[0]!.status).toBe('ok');
  });

  it('settles step entries when step.complete arrives', () => {
    const state = fold([
      ['step.start', { type: 'step.start', step: 0, data: { total: 3 } }],
      ['step.start', { type: 'step.start', step: 1, data: { total: 3 } }],
      ['step.complete', { type: 'step.complete', step: 0, data: { toolCalls: 1 } }],
      ['step.complete', { type: 'step.complete', step: 1, data: { final: true } }],
    ]);

    const steps = state.entries.filter((entry) => entry.kind === 'notice' && /^Step /.test(entry.text));
    expect(steps.map((entry) => entry.status)).toEqual(['ok', 'ok']);
  });

  it('settles any still-running entries when the result arrives', () => {
    const state = fold([
      ['step.start', { type: 'step.start', step: 0, data: { total: 3 } }],
      [
        'result',
        {
          status: 'completed',
          runId: 'run-2',
          steps: 1,
          message: 'done',
          resumable: false,
          toolCalls: 0,
          usage: { promptTokens: 1, completionTokens: 1 },
        },
      ],
    ]);

    const step = state.entries.find((entry) => entry.kind === 'notice' && /^Step /.test(entry.text));
    expect(step?.status).toBe('ok');
  });

  it('settles running steps on run.end and keeps terminal notices out of the spinner state', () => {
    const state = fold([
      ['step.start', { type: 'step.start', step: 0, data: { total: 4 } }],
      ['step.start', { type: 'step.start', step: 1, data: { total: 4 } }],
      ['run.end', { type: 'run.end', data: { status: 'paused', message: 'Step budget exhausted' } }],
    ]);

    expect(state.entries.filter((entry) => /^Step /.test(entry.text)).map((entry) => entry.status)).toEqual(['ok', 'ok']);
    expect(state.entries.every((entry) => entry.status !== 'running')).toBe(true);
    expect(state.streaming).toBe(false);
  });

  it('settles the transcript when the user stops a run', () => {
    const state = fold([
      ['step.start', { type: 'step.start', step: 0, data: { total: 4 } }],
      ['cancelled', {}],
    ]);

    expect(state.streaming).toBe(false);
    expect(state.entries.every((entry) => entry.status !== 'running')).toBe(true);
    expect(state.entries.some((entry) => entry.text === 'Run stopped by the user.')).toBe(true);
  });

  it('reads the context meter from the wrapped payload', () => {
    const state = fold([
      [
        'context',
        {
          type: 'context',
          step: 0,
          data: { totalTokens: 512, budgetTokens: 8192, dropped: [], truncated: [{ id: 'spec' }] },
        },
      ],
    ]);

    expect(state.context).toEqual({ tokens: 512, budget: 8192, dropped: 0, truncated: 1 });
  });

  it('keeps reading result and error events, which are not wrapped', () => {
    const state = fold([
      [
        'result',
        {
          status: 'completed',
          runId: 'run-1',
          steps: 3,
          message: 'done',
          resumable: false,
          toolCalls: 2,
          usage: { promptTokens: 10, completionTokens: 5 },
        },
      ],
      ['error', { message: 'boom' }],
    ]);

    expect(state.streaming).toBe(false);
    expect(state.runId).toBe('run-1');
    expect(state.result?.status).toBe('completed');
    expect(state.error).toBe('boom');
    expect(state.entries.some((entry) => entry.text === 'boom')).toBe(true);
  });

  it('labels explain results as one pass instead of a step-count summary', () => {
    const state = fold([
      [
        'result',
        {
          kind: 'explain',
          status: 'completed',
          runId: 'explain-1',
          steps: 1,
          message: 'Explained from workspace context in one pass.',
          resumable: false,
          toolCalls: 0,
          usage: { promptTokens: 10, completionTokens: 5 },
        },
      ],
    ]);

    const notice = state.entries.find((entry) => entry.kind === 'notice');
    expect(notice?.text).toBe('Explained from workspace context in one pass (0 tools).');
  });

  it('turns tool-emitted progress events into notices instead of fake tools', () => {
    const state = fold([['tool.result', { type: 'tool.result', step: 1, data: { type: 'file.written', path: 'src/a.ts' } }]]);

    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]!.kind).toBe('notice');
    expect(state.entries[0]!.text).toBe('file.written src/a.ts');
  });
});
