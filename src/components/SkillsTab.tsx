import { useCallback, useEffect, useState } from 'react';
import { api, type SkillInfo } from '../lib/api';

/**
 * Create reusable instruction packs stored in `.anneal/skills/<id>/SKILL.md`.
 * The format matches OpenCode skills so the same folder can be used there.
 */
export function SkillsTab({ onInvoke }: { onInvoke?: (id: string) => void }) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [newName, setNewName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { skills: loaded } = await api.skills();
      setSkills(loaded);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const beginCreate = () => {
    setCreating(true);
    setNameConfirmed(false);
    setActive(null);
    setEditing({ id: newName || 'new-skill', content: TEMPLATE });
    setNotice(null);
  };

  const openEdit = (skill: SkillInfo) => {
    setCreating(false);
    setActive(skill.id);
    setEditing({ id: skill.id, content: skill.content });
    setNotice(null);
  };

  const save = async () => {
    if (!editing) return;
    const name = creating ? newName.trim() || 'new-skill' : editing.id;
    try {
      const { id } = await api.writeSkill(name, editing.content);
      setNotice(`Saved skill "${id}". It is now included in agent context.`);
      setCreating(false);
      setNameConfirmed(false);
      setNewName('');
      await refresh();
      setActive(id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete skill "${id}"?`)) return;
    try {
      await api.deleteSkill(id);
      if (active === id) {
        setActive(null);
        setEditing(null);
      }
      await refresh();
      setNotice(`Deleted "${id}".`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="panel-body">
      <div className="hint">
        Skills are reusable workflows in <code>.anneal/skills/&lt;id&gt;/SKILL.md</code>. They use the same{' '}
        <code>SKILL.md</code> layout as OpenCode. <code>auto: true</code> pins them into every run; manual
        skills are included when you click <strong>Invoke</strong> or select them in chat. You can also ask
        the agent to create a skill for you.
      </div>

      <div className="row">
        {creating && !nameConfirmed ? (
          <>
            <input
              className="input"
              placeholder="skill-id"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && setNameConfirmed(true)}
              autoFocus
            />
            <button className="btn primary small" onClick={() => setNameConfirmed(true)}>Continue</button>
            <button className="btn ghost small" onClick={() => { setCreating(false); setNameConfirmed(false); setEditing(null); }}>
              Cancel
            </button>
          </>
        ) : creating ? null : (
          <button className="btn ghost small" onClick={beginCreate}>+ New skill</button>
        )}
      </div>

      <div className="list">
        {skills.map((skill) => (
          <div key={skill.id} className={`list-item${active === skill.id ? ' active' : ''}`}>
            <button className="list-main" onClick={() => openEdit(skill)}>
              <span className="list-title">{skill.name || skill.id}</span>
              <span className="list-meta">
                <span className={`pill ${skill.auto ? 'accent' : ''}`}>{skill.auto ? 'auto' : 'manual'}</span>
                {skill.description ? <span style={{ marginLeft: 4 }}>{skill.description}</span> : null}
                <span style={{ marginLeft: 4 }}>{skill.length} chars</span>
              </span>
            </button>
            {onInvoke && (
              <button className="btn ghost tiny" title="Use this skill in the next chat request" onClick={() => onInvoke(skill.id)}>
                Invoke
              </button>
            )}
            <button className="btn ghost tiny" onClick={() => void remove(skill.id)}>Delete</button>
          </div>
        ))}
        {!skills.length && (
          <div className="empty">No skills yet. Create one to give the agent a repeatable task playbook.</div>
        )}
      </div>

      {editing && (
        <div className="steering-editor">
          <div className="list-title" style={{ marginBottom: 6 }}>
            {creating ? `New skill: ${newName || 'new-skill'}` : `Editing: ${editing.id}`}
          </div>
          <div className="hint tiny">
            Frontmatter controls how the skill is loaded:
            <code style={{ display: 'block', marginTop: 4, whiteSpace: 'pre' }}>{`---\nname: My skill\ndescription: What it is for\nauto: true\n---`}</code>
          </div>
          <textarea
            className="textarea"
            rows={14}
            value={editing.content}
            onChange={(event) => setEditing((prev) => prev ? { ...prev, content: event.target.value } : null)}
            style={{ fontFamily: 'var(--mono)', fontSize: 11 }}
          />
          <div className="row">
            <button className="btn primary small" onClick={() => void save()}>Save</button>
            <button className="btn ghost small" onClick={() => { setEditing(null); setActive(null); setCreating(false); setNameConfirmed(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}

const TEMPLATE = `---
name: New skill
description: When to use this workflow
auto: true
---

# Workflow

1. Read the relevant files before changing anything.
2. Make the smallest change that satisfies the request.
3. Verify with the project's tests or build command.
`;
