import { useCallback, useEffect, useRef, useState } from 'react';
import { api, stream, type SpecDetail, type SpecSummary } from '../lib/api';
import { Icon } from './Icon';

interface SpecsPanelProps {
  busy: boolean;
  focusId: string | null;
  autoRequest: string | null;
  skills: string[];
  onFocusHandled: () => void;
  onAutoRequestHandled: () => void;
  onRunTask: (specId: string, taskId: string) => void;
  onRunNext: (specId: string) => void;
}

type Artifact = 'requirements' | 'design' | 'tasks';

export default function SpecsPanel({
  busy,
  focusId,
  autoRequest,
  skills,
  onFocusHandled,
  onAutoRequestHandled,
  onRunTask,
  onRunNext,
}: SpecsPanelProps) {
  const [specs, setSpecs] = useState<SpecSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SpecDetail | null>(null);
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<Artifact, string>>>({});
  const [editing, setEditing] = useState<Artifact | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const { specs: next } = await api.specs();
    setSpecs(next);
    return next;
  }, []);

  useEffect(() => {
    void refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  const open = useCallback(async (id: string) => {
    setActiveId(id);
    setDrafts({});
    setEditing(null);
    setError(null);
    try {
      setDetail(await api.spec(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!focusId) return;
    void open(focusId);
    onFocusHandled();
  }, [focusId, open, onFocusHandled]);

  const generateRef = useRef<((id: string, text: string) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!focusId || !autoRequest) return;
    setRequest(autoRequest);
    void open(focusId).then(() => generateRef.current?.(focusId, autoRequest));
    onFocusHandled();
    onAutoRequestHandled();
  }, [focusId, autoRequest, open, onFocusHandled, onAutoRequestHandled]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const { spec } = await api.createSpec(name.trim());
      setName('');
      setNotice(`Created ${spec.id}. Describe the feature to generate its documents.`);
      await refresh();
      await open(spec.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const generate = async (id: string, text: string) => {
    if (!id || !text.trim()) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    setDrafts({});
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await stream(
        `/api/specs/${encodeURIComponent(id)}/generate`,
        { request: text, skills },
        (event, data) => {
          if (event === 'delta') {
            const artifact = String(data.stage ?? '') as Artifact;
            const text = String(data.text ?? '');
            if (artifact === 'requirements' || artifact === 'design' || artifact === 'tasks') {
              setDrafts((prev) => ({ ...prev, [artifact]: (prev[artifact] ?? '') + text }));
            }
          } else if (event === 'stage') {
            setStage(`${String(data.stage)}: ${String(data.status)}`);
          } else if (event === 'error') {
            setError(String(data.message ?? 'Generation failed'));
          }
        },
        controller.signal,
      );
      setNotice('Spec generated. Review or edit the documents, then run tasks.');
      setDetail(await api.spec(id));
      await refresh();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      abortRef.current = null;
      setGenerating(false);
      setStage(null);
    }
  };
  generateRef.current = generate;

  const saveArtifact = async (artifact: Artifact) => {
    if (!activeId) return;
    try {
      await api.saveSpec(activeId, artifact, editValue);
      setDetail(await api.spec(activeId));
      await refresh();
      setEditing(null);
      setNotice(`${artifact} saved.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startEditing = (artifact: Artifact) => {
    setEditing(artifact);
    setEditValue(drafts[artifact] ?? detail?.[artifact] ?? '');
  };

  const current = specs.find((spec) => spec.id === activeId);
  const progress = current?.progress ?? { done: 0, total: 0 };
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="ui-specs">
      <div className="ui-panel-intro">
        <div className="ui-panel-title"><Icon name="specs" size={16} /> Spec-driven development</div>
        <p>Requirements → design → tasks. Run each task through the agent with full context.</p>
      </div>

      <div className="ui-spec-create">
        <input
          className="ui-input"
          value={name}
          placeholder="New spec name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void create()}
        />
        <button type="button" className="ui-btn tiny" disabled={!name.trim()} onClick={() => void create()}>
          <Icon name="plus" size={13} /> Create
        </button>
      </div>

      {specs.length === 0 && <div className="ui-empty">No specs yet. Create one to start the workflow.</div>}
      <div className="ui-spec-list">
        {specs.map((spec) => {
          const done = spec.progress.total ? Math.round((spec.progress.done / spec.progress.total) * 100) : 0;
          return (
            <button
              key={spec.id}
              type="button"
              className={`ui-spec-card${activeId === spec.id ? ' active' : ''}`}
              onClick={() => void open(spec.id)}
            >
              <div className="ui-spec-card-top">
                <span className="ui-spec-title">{spec.title}</span>
                <span className="ui-count">{spec.progress.done}/{spec.progress.total}</span>
              </div>
              <div className="ui-spec-meta">{spec.id} · {new Date(spec.updatedAt).toLocaleDateString()}</div>
              <div className="ui-progress"><span style={{ width: `${done}%` }} /></div>
            </button>
          );
        })}
      </div>

      {activeId && detail && (
        <div className="ui-spec-detail">
          <div className="ui-spec-progress">
            <div className="ui-spec-progress-ring" style={{ background: `conic-gradient(var(--accent) ${percent}%, var(--border) 0)` }}>
              <span>{percent}%</span>
            </div>
            <div>
              <div className="ui-strong">{current?.title ?? activeId}</div>
              <div className="ui-muted small">{progress.done} of {progress.total} tasks complete</div>
            </div>
          </div>

          <textarea
            className="ui-textarea"
            rows={3}
            value={request}
            placeholder="Describe the feature in one or two sentences…"
            onChange={(event) => setRequest(event.target.value)}
          />
          <div className="ui-row">
            <button type="button" className="ui-btn primary small" disabled={generating || !request.trim()} onClick={() => activeId && void generate(activeId, request)}>
              <Icon name={generating ? 'loader' : 'sparkles'} size={13} className={generating ? 'spin' : ''} />
              {generating ? 'Generating…' : 'Generate spec'}
            </button>
            {generating && (
              <button type="button" className="ui-btn ghost small" onClick={() => abortRef.current?.abort()}>
                Stop
              </button>
            )}
          </div>
          {stage && <div className="ui-inline-note">{stage}</div>}

          {(['requirements', 'design', 'tasks'] as const).map((artifact) => {
            const text = drafts[artifact] ?? detail[artifact] ?? '';
            if (!text && editing !== artifact) return null;
            return (
              <div key={artifact} className="ui-doc">
                <div className="ui-doc-head">
                  <span className="ui-doc-label"><Icon name={artifact === 'tasks' ? 'listCheck' : 'book'} size={13} /> {artifact}</span>
                  <span className="ui-grow" />
                  {drafts[artifact] && <span className="ui-count">streaming</span>}
                  <button type="button" className="ui-icon-button" title={`Edit ${artifact}`} onClick={() => startEditing(artifact)}>
                    <Icon name="edit" size={13} />
                  </button>
                </div>
                {editing === artifact ? (
                  <div className="ui-doc-edit">
                    <textarea className="ui-textarea mono" rows={10} value={editValue} onChange={(event) => setEditValue(event.target.value)} />
                    <div className="ui-row">
                      <button type="button" className="ui-btn primary tiny" onClick={() => void saveArtifact(artifact)}>Save</button>
                      <button type="button" className="ui-btn ghost tiny" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <pre className="ui-doc-body">{text}</pre>
                )}
              </div>
            );
          })}

          {detail.tasksParsed.length > 0 && (
            <div className="ui-task-list">
              <div className="ui-section-label">Implementation tasks</div>
              {detail.tasksParsed.map((task) => (
                <div key={task.id} className={`ui-task${task.checked ? ' done' : ''}`}>
                  <span className={`ui-check${task.checked ? ' checked' : ''}`}><Icon name="check" size={10} /></span>
                  <span className="ui-task-id">{task.id}</span>
                  <span className="ui-task-title">{task.title}</span>
                  {!task.checked && (
                    <button
                      type="button"
                      className="ui-btn ghost tiny"
                      disabled={busy}
                      title="Implement this task with the agent"
                      onClick={() => onRunTask(activeId, task.id)}
                    >
                      <Icon name="play" size={11} /> Run
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="ui-btn small" disabled={busy} onClick={() => onRunNext(activeId)}>
                <Icon name="zap" size={13} /> Run next task
              </button>
            </div>
          )}
        </div>
      )}

      {notice && <div className="ui-inline-note good"><Icon name="check" size={12} /> {notice}</div>}
      {error && <div className="ui-inline-error"><Icon name="warning" size={12} /> {error}</div>}
    </div>
  );
}
