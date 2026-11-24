/**
 * OpenCode's public inference catalog.
 *
 * This is only used by the optional, manually selected OpenCode provider. The
 * default provider stays local. The catalog lets the UI offer real model ids
 * and flag which ones are free, without hardcoding a list that will drift.
 */

export interface OpenCodeModel {
  id: string;
  name: string;
  description?: string;
  free: boolean;
  context?: number;
  recommendedApi?: string;
  type?: string;
}

export const OPENCODE_INFERENCE_BASE_URL = 'https://opencode.ai/inference/openai/v1';
export const OPENCODE_DEFAULT_MODEL = 'mimo-v2.6-flash-free';
export const OPENCODE_FREE_HINT =
  'Free OpenCode models are limited to the OpenCode app. From other clients add an OpenCode API key (Console/Go), or choose another endpoint.';

/** Turn an inference chat base URL into its model-list URL. */
export function catalogUrl(baseUrl: string): string {
  const trimmed = (baseUrl || OPENCODE_INFERENCE_BASE_URL).trim().replace(/\/+$/, '');
  let root = trimmed.replace(/\/v\d+$/, '');
  root = root.replace(/\/openai$/, '');
  return `${root}/v1/models`;
}

interface CatalogEntry {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  recommended_api?: unknown;
  type?: unknown;
  limit?: { context?: unknown };
  cost?: {
    text?: {
      input?: { price?: unknown };
      output?: { price?: unknown };
    };
  };
}

/** Fetch and normalise the public model list. Never throws on malformed entries. */
export async function fetchOpenCodeModels(
  options: { baseUrl?: string; url?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<OpenCodeModel[]> {
  const url = options.url ?? process.env.ANNEAL_OPENCODE_MODELS_URL ?? catalogUrl(options.baseUrl ?? OPENCODE_INFERENCE_BASE_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Model catalog returned HTTP ${response.status}`);
    const json = (await response.json()) as { data?: CatalogEntry[] };
    const entries = Array.isArray(json?.data) ? json.data : [];
    return entries
      .map((entry): OpenCodeModel | null => {
        const id = String(entry.id ?? '').trim();
        // Anneal speaks chat completions only; image/video/embedding/decision
        // entries would fail at runtime, so they never reach the picker.
        if (!id || (typeof entry.type === 'string' && entry.type !== 'chat')) return null;
        if (typeof entry.recommended_api === 'string' && entry.recommended_api !== 'chat-completions') return null;
        const input = Number(entry.cost?.text?.input?.price ?? 0);
        const output = Number(entry.cost?.text?.output?.price ?? 0);
        const free = input === 0 && output === 0 || id.endsWith('-free');
        return {
          id,
          name: String(entry.name ?? id),
          ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
          free,
          ...(Number(entry.limit?.context) > 0 ? { context: Number(entry.limit?.context) } : {}),
          ...(typeof entry.recommended_api === 'string' ? { recommendedApi: entry.recommended_api } : {}),
          ...(typeof entry.type === 'string' ? { type: entry.type } : {}),
        };
      })
      .filter((model): model is OpenCodeModel => Boolean(model))
      .sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
