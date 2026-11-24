import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSkills, parseSkill, safeSkillId, skillSections } from '../server/skills/skills';

let root: string | undefined;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('workspace skills', () => {
  it('parses SKILL.md frontmatter and body', () => {
    const skill = parseSkill(
      ['---', 'name: Release check', 'description: Prepare releases', 'auto: true', '---', '', '# Steps', 'Run tests.'].join('\n'),
      'release-check',
    );

    expect(skill).toMatchObject({
      id: 'release-check',
      name: 'Release check',
      description: 'Prepare releases',
      auto: true,
    });
    expect(skill.content).toContain('Run tests.');
  });

  it('loads nested SKILL.md files and skips non-skill files', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'anneal-skills-'));
    await mkdir(path.join(root, 'release'), { recursive: true });
    await writeFile(
      path.join(root, 'release', 'SKILL.md'),
      '---\nname: Release\n---\n\n# Steps\nBump version.\n',
      'utf8',
    );
    await writeFile(path.join(root, 'ignored.txt'), 'not a skill', 'utf8');

    const skills = await loadSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.id).toBe('release');
    expect(skills[0]!.name).toBe('Release');
  });

  it('only injects auto skills into context', () => {
    const auto = parseSkill('---\nname: Auto\n---\n\nAlways on.', 'auto');
    const manual = parseSkill('---\nname: Manual\nauto: false\n---\n\nOnly on demand.', 'manual');
    const sections = skillSections([auto, manual]);

    expect(sections).toHaveLength(1);
    expect(sections[0]!.id).toBe('skill:auto');
    expect(sections[0]!.kind).toBe('skill');
    expect(sections[0]!.content).toContain('Always on.');
  });

  it('sanitises skill ids so paths stay inside the skills directory', () => {
    expect(safeSkillId('../secret')).toBe('secret');
    expect(safeSkillId('my skill!')).toBe('my-skill');
    expect(safeSkillId('')).toBe('skill');
  });
});
