import { describe, expect, it } from 'vitest';
import { catalogUrl, fetchOpenCodeModels } from '../server/providers/opencode';

function catalogResponse(data: unknown[]): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenCode model catalog', () => {
  it('derives the model list URL from an inference chat URL', () => {
    expect(catalogUrl('https://opencode.ai/inference/openai/v1')).toBe('https://opencode.ai/inference/v1/models');
    expect(catalogUrl('https://example.test/v1/')).toBe('https://example.test/v1/models');
  });

  it('normalises free and paid models and keeps real ids', async () => {
    const models = await fetchOpenCodeModels({
      url: 'https://example.test/v1/models',
      fetchImpl: async () =>
        catalogResponse([
          {
            id: 'paid-model',
            name: 'Paid Model',
            cost: { text: { input: { price: 0.000001 }, output: { price: 0.000002 } } },
            limit: { context: 128000 },
          },
          {
            id: 'free-model',
            name: 'Free Model',
            description: 'No cost',
            cost: { text: { input: { price: 0 }, output: { price: 0 } } },
            recommended_api: 'chat-completions',
          },
          { id: 'image-model', name: 'Image Model', type: 'image', cost: { text: { input: { price: 0 }, output: { price: 0 } } } },
          { id: 'systemone-model', name: 'System One', recommended_api: 'systemone' },
          { name: 'missing id' },
        ]),
    });

    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({ id: 'free-model', free: true, recommendedApi: 'chat-completions' });
    expect(models[1]).toMatchObject({ id: 'paid-model', free: false, context: 128000 });
  });

  it('reports a useful error when the catalog is unavailable', async () => {
    await expect(
      fetchOpenCodeModels({
        url: 'https://example.test/v1/models',
        fetchImpl: async () => new Response('nope', { status: 503 }),
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});
