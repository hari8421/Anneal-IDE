import fs from 'node:fs/promises';
import path from 'node:path';
import type { ContextSection } from './builder';
import { retrieveFiles } from './retrieval';
import { isIgnoredPath, resolveInWorkspace } from '../util/paths';

/**
 * Fast, read-only codebase explanations.
 *
 * The general agent loop spends one step per tool call, which is the wrong shape
 * for "explain this project": dozens of steps and no answer until the budget
 * runs out. Instead we gather a small workspace map plus a handful of relevant
 * files in one pass and let the model answer from that context in one call.
 */

const EXPLAIN_PREFIX =
  /^\s*(?:(?:can|could|would|will)\s+you\s+|please\s+)?(?:explain|describe|summarise|summarize|walk\s+me\s+through|help\s+me\s+understand|give\s+me\s+(?:an?\s+)?(?:[a-z][a-z-]*\s+){0,3}(?:overview|introduction|explanation|answer|summary)(?:\s+(?:of|to|for))?|overview\s+of|tell\s+me\s+about|how\s+(?:does|do|is|are)|what\s+(?:does|do|is|are|is\s+(?:this|the)\s+(?:project|codebase|code|workspace|repo))|where\s+(?:is|are)|why\s+(?:does|do|is|are))\b/i;
const FOLLOWUP_ACTION =
  /(?:\band|,?\s*then)\s+(?:add|build|change|create|delete|edit|fix|generate|implement|install|modify|refactor|remove|rename|replace|run|test|update|write)\b/i;

/** Common typos people actually type when asking for an explanation. */
const EXPLAIN_TYPOS: Array<[RegExp, string]> = [
  [/\bexplian\b/gi, 'explain'],
  [/\bexpliane\b/gi, 'explain'],
  [/\bexlpain\b/gi, 'explain'],
  [/\bexplin\b/gi, 'explain'],
  [/\bexplane\b/gi, 'explain'],
  [/\bexplaine\b/gi, 'explain'],
  [/\bsummrise\b/gi, 'summarise'],
  [/\bsumarize\b/gi, 'summarize'],
];

function normalizeExplanationGoal(text: string): string {
  return EXPLAIN_TYPOS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

/** Only clearly explanatory, read-only goals take the one-call path. */
export function isExplanationGoal(goal: string): boolean {
  const text = normalizeExplanationGoal(goal.trim());
  if (!text || text.length > 500) return false;
  if (FOLLOWUP_ACTION.test(text)) return false;
  return EXPLAIN_PREFIX.test(text);
}

const MAX_MAP_LINES = 240;
const MAX_FILE_CHARS = 6000;
const MAX_CANDIDATES = 12;

const ANCHOR_FILE = /(^|\/)(readme(\.[a-z0-9]+)*|license(\.[a-z0-9]+)*|package\.json|tsconfig(\.[a-z0-9]+)*\.json|vite\.config\.[a-z0-9]+|cargo\.toml|pyproject\.toml|go\.mod|settings\.gradle\.kts|build\.gradle\.kts|makefile|dockerfile|main\.(ts|tsx|js|jsx|py|go|rs|kt|java)|mainactivity\.kt|index\.(ts|tsx|js|jsx)|app\.(ts|tsx|js|jsx|py|kt|java)|program\.cs)$/i;

interface WorkspaceEntry {
  path: string;
  directory: boolean;
  depth: number;
}

async function scanWorkspace(root: string): Promise<WorkspaceEntry[]> {
  const entries: WorkspaceEntry[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 10 || entries.length >= 600) return;
    let children: import('node:fs').Dirent[];
    try {
      children = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (entries.length >= 600) return;
      const absolute = path.join(dir, child.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (isIgnoredPath(relative)) continue;
      if (child.isDirectory()) {
        entries.push({ path: relative, directory: true, depth });
        await walk(absolute, depth + 1);
      } else if (child.isFile()) {
        entries.push({ path: relative, directory: false, depth });
      }
    }
  };
  await walk(root, 0);
  return entries;
}

function renderMap(entries: WorkspaceEntry[]): string {
  const shown = entries.slice(0, MAX_MAP_LINES);
  const lines = shown.map((entry) => `${entry.directory ? '📁' : '  '} ${entry.path}${entry.directory ? '/' : ''}`);
  if (entries.length > shown.length) lines.push(`… ${entries.length - shown.length} more entries omitted`);
  return lines.join('\n');
}

async function readExcerpt(root: string, relative: string): Promise<string | null> {
  try {
    const absolute = resolveInWorkspace(root, relative);
    const content = await fs.readFile(absolute, 'utf8');
    if (content.includes('\u0000')) return null;
    return content.length > MAX_FILE_CHARS ? `${content.slice(0, MAX_FILE_CHARS)}\n… (truncated)` : content;
  } catch {
    return null;
  }
}

/**
 * Build a compact context: workspace tree, conventional entry points, files
 * matching the question, and any files the user explicitly attached.
 */
export async function explainSections(
  root: string,
  question: string,
  files: string[] = [],
): Promise<ContextSection[]> {
  const entries = await scanWorkspace(root);
  const sections: ContextSection[] = [
    {
      id: 'workspace:map',
      kind: 'file',
      title: 'Workspace map (paths are relative to the workspace root)',
      content: renderMap(entries),
      priority: 90,
    },
  ];

  const candidates: string[] = [];
  const add = (candidate: string): void => {
    const clean = candidate.replace(/^\.\//, '').trim();
    if (clean && !candidates.includes(clean)) candidates.push(clean);
  };
  for (const file of files.slice(0, 8)) add(file);
  for (const entry of entries) {
    if (!entry.directory && ANCHOR_FILE.test(entry.path)) add(entry.path);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  if (candidates.length < MAX_CANDIDATES && question.trim()) {
    const retrieved = await retrieveFiles(root, question, {
      limit: MAX_CANDIDATES - candidates.length,
      maxFiles: 800,
    });
    for (const file of retrieved) add(file.path);
  }

  for (const [index, relative] of candidates.slice(0, MAX_CANDIDATES).entries()) {
    const excerpt = await readExcerpt(root, relative);
    if (!excerpt) continue;
    sections.push({
      id: `explain:${relative}`,
      kind: 'file',
      title: relative,
      content: `# ${relative}\n${excerpt}`,
      priority: 80 - index,
    });
  }
  return sections;
}
