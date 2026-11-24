import fs from 'node:fs/promises';
import path from 'node:path';
import type { ContextSection } from '../context/builder';

/**
 * Reusable instruction packs for the agent. A skill lives in its own folder
 * with a SKILL.md file, matching the OpenCode skill layout so packs can be
 * shared between the two tools.
 */
export interface SkillFile {
  id: string;
  name: string;
  description: string;
  content: string;
  auto: boolean;
  file: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = raw.replace(/^\uFEFF/, '');
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of text.slice(3, end).split('\n')) {
    const match = line.match(/^\s*([a-zA-Z_-]+)\s*:\s*(.*)$/);
    if (match) meta[match[1]!.toLowerCase()] = match[2]!.trim().replace(/^["']|["']$/g, '');
  }
  const bodyStart = text.indexOf('\n', end + 4);
  return { meta, body: bodyStart >= 0 ? text.slice(bodyStart + 1) : '' };
}

export function parseSkill(raw: string, id: string, file = ''): SkillFile {
  const { meta, body } = parseFrontmatter(raw);
  const autoRaw = (meta.auto ?? 'true').toLowerCase();
  return {
    id,
    name: meta.name ?? id,
    description: meta.description ?? '',
    content: body.trim(),
    auto: autoRaw !== 'false' && autoRaw !== 'manual',
    file,
  };
}

/** Read `.anneal/skills/<id>/SKILL.md` plus legacy flat `SKILL.md` files. */
export async function loadSkills(dir: string): Promise<SkillFile[]> {
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const skills: SkillFile[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = entry.isDirectory() ? path.join(dir, entry.name, 'SKILL.md') : path.join(dir, entry.name);
    if (entry.isFile() && !entry.name.toLowerCase().endsWith('.md')) continue;
    try {
      const raw = await fs.readFile(file, 'utf8');
      const id = entry.isDirectory() ? entry.name : entry.name.replace(/\.md$/i, '');
      const parsed = parseSkill(raw, id, file);
      if (parsed.content) skills.push(parsed);
    } catch {
      // Missing/unreadable skill files never break a run.
    }
  }
  return skills;
}

export function skillSections(skills: SkillFile[]): ContextSection[] {
  return skills
    .filter((skill) => skill.auto)
    .map((skill, index) => ({
      id: `skill:${skill.id}`,
      kind: 'skill' as const,
      title: `Skill: ${skill.name}${skill.description ? ` — ${skill.description}` : ''}`,
      content: skill.content,
      priority: 94 - index,
    }));
}

/** Sanitise a user-supplied id so it can never escape the skills directory. */
export function safeSkillId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'skill';
}
