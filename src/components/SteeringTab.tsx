import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface SteeringFile {
  name: string;
  inclusion: string;
  globs: string[];
  content: string;
  length: number;
}

export function SteeringTab() {
  const [files, setFiles] = useState<SteeringFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { steering } = await api.steering();
      setFiles(steering);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEdit = (file: SteeringFile) => {
    setActive(file.name);
    setEditing({ name: file.name, content: file.content });
    setCreating(false);
    setNotice(null);
  };

  const startCreate = () => {
    setCreating(true);
    setActive(null);
    setEditing({ name: newName || 'new-rule', content: TEMPLATE });
    setNotice(null);
  };

  const save = async () => {
    if (!editing) return;
    const name = creating ? (newName.trim() || 'new-rule') : editing.name;
    try {
      await api.writeSteering(name, editing.content);
      setNotice(`Saved "${name}".`);
      setCreating(false);
      setNewName('');
      await refresh();
      setActive(name);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (name: string) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete steering file "${name}"?`)) return;
    try {
      await api.deleteSteering(name);
      if (active === name) {
        setActive(null);
        setEditing(null);
      }
      await refresh();
      setNotice(`Deleted "${name}".`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="panel-body">
      <div className="hint">
        Steering files in <code>.anneal/steering/</code> inject context into every agent prompt.{' '}
        <code>always</code> files are pinned; <code>auto</code> activates on file glob match.
      </div>

      <div className="row">
        {creating ? (
          <>
            <input
              className="input"
              placeholder="file-name (no .md)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startCreate()}
              autoFocus
            />
            <button className="btn primary small" onClick={startCreate}>
              Continue
            </button>
            <button className="btn ghost small" onClick={() => { setCreating(false); setEditing(null); }}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn ghost small" onClick={() => { setCreating(true); setEditing({ name: '', content: TEMPLATE }); }}>
            + New steering file
          </button>
        )}
      </div>

      <div className="list">
        {files.map((file) => (
          <div key={file.name} className={`list-item${active === file.name ? ' active' : ''}`}>
            <button className="list-main" onClick={() => openEdit(file)}>
              <span className="list-title">{file.name}</span>
              <span className="list-meta">
                <span className={`pill ${file.inclusion === 'always' ? 'accent' : ''}`}>{file.inclusion}</span>
                {file.globs.length > 0 && <span style={{ marginLeft: 4 }}>{file.globs.join(', ')}</span>}
                <span style={{ marginLeft: 4 }}>{file.length} chars</span>
              </span>
            </button>
            <button className="btn ghost tiny" onClick={() => void remove(file.name)}>
              Delete
            </button>
          </div>
        ))}
        {!files.length && (
          <div className="empty">
            No steering files yet. Create one to give the agent permanent instructions about this project.
          </div>
        )}
      </div>

      {editing && (
        <div className="steering-editor">
          <div className="list-title" style={{ marginBottom: 6 }}>
            {creating ? 'New steering file' : `Editing: ${editing.name}`}
          </div>
          <div className="hint tiny">
            Start with YAML frontmatter to control inclusion:
            <code style={{ display: 'block', marginTop: 4, whiteSpace: 'pre' }}>{`---\ninclusion: always\n---`}</code>
          </div>
          <textarea
            className="textarea"
            rows={12}
            value={editing.content}
            onChange={(e) => setEditing((prev) => prev ? { ...prev, content: e.target.value } : null)}
            style={{ fontFamily: 'var(--mono)', fontSize: 11 }}
          />
          <div className="row">
            <button className="btn primary small" onClick={() => void save()}>
              Save
            </button>
            <button className="btn ghost small" onClick={() => { setEditing(null); setActive(null); setCreating(false); }}>
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
inclusion: always
---

# Project conventions

<!-- Add rules the agent must follow in every run. Examples: -->
<!-- - Always run \`npm test\` after making changes. -->
<!-- - Use TypeScript strict mode. -->
<!-- - Write tests for every new function. -->
`;
