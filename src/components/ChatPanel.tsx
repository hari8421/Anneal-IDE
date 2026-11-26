import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import AttachmentPicker from './AttachmentPicker';
import type { Autonomy, Health, SkillInfo } from '../lib/api';
import type { AskMessage, ChatMode, ChatRecord } from '../lib/chat';
import type { LogEntry, SessionState } from '../lib/session';
import { fuzzyScore } from './QuickOpen';
import { Icon, type IconName } from './Icon';

interface ChatPanelProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  chats: ChatRecord[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  session: SessionState;
  askMessages: AskMessage[];
  askStreaming: boolean;
  health: Health | null;
  autonomy: Autonomy;
  onAutonomyChange: (autonomy: Autonomy) => void;
  selectedFiles: string[];
  onRemoveFile: (path: string) => void;
  skills: SkillInfo[];
  selectedSkills: string[];
  onToggleSkill: (id: string) => void;
  onRemoveSkill: (id: string) => void;
  workspaceFiles: string[];
  runSummary: string | null;
  onRunGoal: (goal: string, files: string[]) => void;
  onAsk: (goal: string, files: string[]) => void;
  onSpec: (goal: string, files: string[]) => void;
  onCancel: () => void;
  onResume: () => void;
  onSelfHeal: () => void;
  selfHeal: boolean;
  onSelfHealChange: (enabled: boolean) => void;
  onAttachFile: (path: string) => void;
  onAttachFiles: (paths: string[]) => void;
  onOpenFile: (path: string) => void;
  onClose: () => void;
  submitRef: MutableRefObject<(() => void) | null>;
  onRetryHealth: () => void;
}

const MODES: Array<{ key: ChatMode; label: string; icon: IconName; hint: string }> = [
  { key: 'ask', label: 'Ask', icon: 'lightbulb', hint: 'Answer codebase questions in one pass, without touching files.' },
  { key: 'agent', label: 'Agent', icon: 'zap', hint: 'Plan, edit files and run tools until the goal is done.' },
  { key: 'spec', label: 'Spec', icon: 'specs', hint: 'Turn a feature idea into requirements, design and tasks.' },
];

const TOOL_ICONS: Record<string, IconName> = {
  read_file: 'file',
  write_file: 'edit',
  apply_patch: 'edit',
  list_files: 'files',
  search: 'search',
  run_command: 'terminal',
  remember: 'database',
  list_skills: 'sparkles',
  invoke_skill: 'sparkles',
  create_skill: 'sparkles',
};

function AgentEntry({ entry, onOpenFile }: { entry: LogEntry; onOpenFile: (path: string) => void }) {
  if (entry.kind === 'tool') {
    const args = (() => {
      try {
        return JSON.parse(entry.args ?? '{}') as Record<string, unknown>;
      } catch {
        return null;
      }
    })();
    const path = typeof args?.path === 'string' ? args.path : typeof args?.file === 'string' ? args.file : null;
    return (
      <div className={`ui-message tool ${entry.status ?? ''}`}>
        <details>
          <summary>
            <span className="ui-msg-icon"><Icon name={TOOL_ICONS[entry.name ?? ''] ?? 'code'} size={13} /></span>
            <code className="ui-tool-name">{entry.name}</code>
            {path && (
              <button type="button" className="ui-link" onClick={(event) => { event.preventDefault(); onOpenFile(path); }}>
                {path}
              </button>
            )}
            <span className="ui-grow" />
            {entry.awaitingApproval && <span className="ui-badge warn">awaiting approval</span>}
            {!entry.awaitingApproval && entry.status === 'running' && <Icon name="loader" size={12} className="spin" />}
            {entry.status === 'ok' && <Icon name="check" size={13} className="ok-text" />}
            {entry.status === 'error' && <Icon name="warning" size={13} className="error-text" />}
            <Icon name="chevronDown" size={12} className="ui-detail-caret" />
          </summary>
          <div className="ui-message-detail">
            {entry.args && <pre>{entry.args}</pre>}
            {entry.text && <pre>{entry.text}</pre>}
          </div>
        </details>
      </div>
    );
  }
  if (entry.kind === 'user') {
    return (
      <div className="ui-message user">
        <div className="ui-avatar user"><Icon name="user" size={13} /></div>
        <div className="ui-bubble">{entry.text}</div>
      </div>
    );
  }
  if (entry.kind === 'notice' || entry.kind === 'stage') {
    return (
      <div className={`ui-message notice ${entry.status ?? ''}`}>
        <Icon name={entry.status === 'error' ? 'warning' : entry.status === 'running' ? 'loader' : 'check'} size={12} className={entry.status === 'running' ? 'spin' : ''} />
        <span>{entry.text}</span>
        {entry.step !== undefined && <span className="ui-count">step {entry.step + 1}</span>}
      </div>
    );
  }
  return (
    <div className="ui-message assistant">
      <div className="ui-avatar bot"><Icon name="bot" size={14} /></div>
      <div className="ui-bubble">
        {entry.text || (entry.status === 'running' ? <span className="ui-thinking">thinking…</span> : '')}
        {entry.status === 'running' && <span className="ui-caret" />}
      </div>
    </div>
  );
}

export default function ChatPanel({
  mode,
  onModeChange,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  session,
  askMessages,
  askStreaming,
  health,
  autonomy,
  onAutonomyChange,
  selectedFiles,
  onRemoveFile,
  skills,
  selectedSkills,
  onToggleSkill,
  onRemoveSkill,
  workspaceFiles,
  runSummary,
  onRunGoal,
  onAsk,
  onSpec,
  onCancel,
  onResume,
  onSelfHeal,
  selfHeal,
  onSelfHealChange,
  onAttachFile,
  onAttachFiles,
  onOpenFile,
  onClose,
  submitRef,
  onRetryHealth,
}: ChatPanelProps) {
  const [goal, setGoal] = useState('');
  const [historyAt, setHistoryAt] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const offline = Boolean(health && !health.lmStudio.ok);
  const busy = session.streaming || askStreaming;
  const activeChat = chats.find((chat) => chat.id === activeChatId);

  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [session.entries, askMessages, mode, session.result]);

  const mention = useMemo(() => {
    const match = goal.match(/(?:^|\s)@([\w./-]*)$/);
    if (!match) return null;
    return { query: match[1] ?? '', start: goal.lastIndexOf('@') };
  }, [goal]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    return workspaceFiles
      .map((path) => ({ path, score: fuzzyScore(path, mention.query) }))
      .filter((entry): entry is { path: string; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.path);
  }, [mention, workspaceFiles]);

  const mentionedFiles = useMemo(() => {
    const paths: string[] = [];
    const pattern = /(?:^|\s)@([^\s,;]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(goal)) !== null) {
      if (!paths.includes(match[1] ?? '')) paths.push(match[1] ?? '');
    }
    return paths.filter(Boolean);
  }, [goal]);

  const attachFile = (path: string) => {
    onAttachFile(path);
    if (mention) setGoal(`${goal.slice(0, mention.start)}@${path} `);
    else setGoal((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${path} `);
    textareaRef.current?.focus();
  };

  const submit = () => {
    const text = goal.trim();
    if (!text || busy) return;
    const files = [...new Set([...selectedFiles, ...mentionedFiles])];
    for (const path of mentionedFiles) onAttachFile(path);
    if (mode === 'ask') onAsk(text, files);
    else if (mode === 'spec') onSpec(text, files);
    else onRunGoal(text, files);
    setGoal('');
    setHistoryAt(-1);
  };
  submitRef.current = submit;

  const history = useMemo(
    () => chats.flatMap((chat) => chat.askMessages.filter((message) => message.role === 'user').map((message) => message.text)),
    [chats],
  );

  const resultStatus = session.result?.status ?? null;

  return (
    <section className="ui-chat">
      <header className="ui-chat-header">
        <div className="ui-chat-heading">
          <span className="ui-chat-title"><Icon name="sparkles" size={15} /> Anneal agent</span>
          <span className={`ui-connection ${offline ? 'off' : 'on'}`} title={health?.lmStudio.baseUrl ?? 'Connecting…'}>
            {offline ? 'offline' : 'ready'}
          </span>
        </div>
        <div className="ui-chat-actions">
          <div className="ui-history-wrap">
            <button
              type="button"
              className="ui-icon-button"
              title="Conversation history"
              aria-label="Conversation history"
              onClick={() => setShowHistory((value) => !value)}
            >
              <Icon name="history" size={15} />
            </button>
            {showHistory && (
              <div className="ui-history-menu">
                <div className="ui-menu-head">Conversations</div>
                {chats.map((chat) => (
                  <div key={chat.id} className={`ui-menu-row${chat.id === activeChatId ? ' active' : ''}`}>
                    <button type="button" onClick={() => { onSelectChat(chat.id); setShowHistory(false); }}>
                      <Icon name={chat.mode === 'ask' ? 'lightbulb' : chat.mode === 'spec' ? 'specs' : 'zap'} size={13} />
                      <span>{chat.title}</span>
                    </button>
                    <button type="button" className="ui-icon-button" title="Delete conversation" onClick={() => onDeleteChat(chat.id)}>
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                ))}
                {!chats.length && <div className="ui-empty small">No saved conversations.</div>}
                <button type="button" className="ui-menu-new" onClick={() => { onNewChat(); setShowHistory(false); }}>
                  <Icon name="plus" size={13} /> New conversation
                </button>
              </div>
            )}
          </div>
          <button type="button" className="ui-icon-button" title="New conversation" aria-label="New conversation" onClick={onNewChat}>
            <Icon name="plus" size={16} />
          </button>
          <button type="button" className="ui-icon-button" title="Hide chat" aria-label="Hide chat" onClick={onClose}>
            <Icon name="panelRight" size={15} />
          </button>
        </div>
      </header>

      <div className="ui-mode-bar">
        <div className="ui-segmented">
          {MODES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={mode === entry.key ? 'active' : ''}
              title={entry.hint}
              onClick={() => onModeChange(entry.key)}
            >
              <Icon name={entry.icon} size={13} /> {entry.label}
            </button>
          ))}
        </div>
        <select
          className="ui-select small"
          value={autonomy}
          disabled={mode !== 'agent'}
          title="Autopilot edits immediately; supervised asks before each tool call"
          onChange={(event) => onAutonomyChange(event.target.value as Autonomy)}
        >
          <option value="autopilot">Autopilot</option>
          <option value="supervised">Supervised</option>
        </select>
      </div>

      {offline && (
        <div className="ui-banner">
          <Icon name="warning" size={14} />
          <span>
            No model server is answering at {health?.lmStudio.baseUrl}. The agent still runs — start LM Studio
            (or pick another provider under Models) and it will connect on the next request.
          </span>
          <button type="button" className="ui-btn ghost small" onClick={onRetryHealth}>
            Check again
          </button>
        </div>
      )}

      <div className="ui-transcript" ref={transcriptRef}>
        {mode === 'ask' && askMessages.length === 0 && (
          <div className="ui-chat-welcome">
            <div className="ui-welcome-orb"><Icon name="lightbulb" size={22} /></div>
            <h3>Ask anything about your project</h3>
            <p>Answers stream from your model. Click <strong>Attach</strong> or type <kbd className="ui-kbd">@</kbd> to include workspace files — Ask never edits files.</p>
          </div>
        )}
        {mode === 'agent' && session.entries.length === 0 && (
          <div className="ui-chat-welcome">
            <div className="ui-welcome-orb"><Icon name="zap" size={22} /></div>
            <h3>What should we build?</h3>
            <p>Describe a goal. Anneal plans, edits files with patches, runs commands and verifies the result — every step is checkpointed and resumable.</p>
            <div className="ui-suggestions">
              {[
                'Add input validation with tests',
                'Refactor the auth module and update callers',
                'Find and fix flaky tests',
              ].map((text) => (
                <button key={text} type="button" onClick={() => setGoal(text)}>{text}</button>
              ))}
            </div>
          </div>
        )}
        {mode === 'spec' && (
          <div className="ui-chat-welcome">
            <div className="ui-welcome-orb"><Icon name="specs" size={22} /></div>
            <h3>Specify it first</h3>
            <p>Describe a feature. Anneal creates a spec with EARS requirements, a design and a task checklist. Execute tasks one at a time from the Specs view.</p>
          </div>
        )}

        {mode === 'ask' && askMessages.map((message, index) => (
          <div key={index} className={`ui-message ${message.role === 'user' ? 'user' : 'assistant'}`}>
            {message.role === 'assistant' ? (
              <><div className="ui-avatar bot"><Icon name="bot" size={14} /></div><div className="ui-bubble">{message.text}</div></>
            ) : (
              <><div className="ui-avatar user"><Icon name="user" size={13} /></div><div className="ui-bubble">{message.text}</div></>
            )}
          </div>
        ))}
        {mode !== 'ask' && session.entries.map((entry) => <AgentEntry key={entry.id} entry={entry} onOpenFile={onOpenFile} />)}

        {mode !== 'ask' && session.result && (
          <div className={`ui-result ${resultStatus ?? ''}`}>
            <div className="ui-result-head">
              <Icon name={resultStatus === 'completed' ? 'check' : resultStatus === 'failed' ? 'warning' : 'info'} size={14} />
              <strong>{resultStatus}</strong>
              <span className="ui-grow" />
              <span className="ui-muted">{session.result.steps} steps · {session.result.toolCalls} tools</span>
            </div>
            <div className="ui-muted small">
              {session.result.usage.promptTokens + session.result.usage.completionTokens} tokens
              {session.result.resumable ? ' · resumable' : ''}
            </div>
          </div>
        )}
        {runSummary && (
          <div className="ui-run-summary">
            <div className="ui-section-label"><Icon name="sparkles" size={12} /> Run summary</div>
            <pre>{runSummary}</pre>
          </div>
        )}
      </div>

      {(selectedFiles.length > 0 || selectedSkills.length > 0) && (
        <div className="ui-chips">
          {selectedFiles.map((file) => (
            <span key={`file:${file}`} className="ui-chip" title={file}>
              <Icon name="file" size={11} /> {file.split('/').pop()}
              <button type="button" aria-label={`Remove ${file}`} onClick={() => onRemoveFile(file)}><Icon name="close" size={11} /></button>
            </span>
          ))}
          {selectedSkills.map((id) => (
            <span key={`skill:${id}`} className="ui-chip" title={`Invoke skill ${id}`}>
              <Icon name="sparkles" size={11} /> {skills.find((skill) => skill.id === id)?.name ?? id}
              <button type="button" aria-label={`Remove skill ${id}`} onClick={() => onRemoveSkill(id)}><Icon name="close" size={11} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="ui-composer">
        {suggestions.length > 0 && (
          <div className="ui-mention-menu">
            <div className="ui-menu-head">Attach a file</div>
            {suggestions.map((path) => (
              <button key={path} type="button" onClick={() => attachFile(path)}>
                <Icon name="file" size={13} /> <span>{path}</span>
              </button>
            ))}
          </div>
        )}
        {skillPickerOpen && (
          <div className="ui-mention-menu">
            <div className="ui-menu-head">Invoke saved skills</div>
            {skills.map((skill) => (
              <button key={skill.id} type="button" onClick={() => onToggleSkill(skill.id)}>
                <Icon name={selectedSkills.includes(skill.id) ? 'check' : 'sparkles'} size={13} />
                <span className="ui-grow">
                  <strong>{skill.name}</strong>
                  <small>{skill.description || skill.id}{!skill.auto ? ' · manual' : ''}</small>
                </span>
              </button>
            ))}
            {!skills.length && <div className="ui-empty small">No skills yet. Ask the agent to create one or use the Skills panel.</div>}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={goal}
          rows={3}
          placeholder={
            mode === 'ask' ? 'Ask a question… use @ to attach files' : mode === 'spec' ? 'Describe the feature to specify…' : 'Describe the goal… use @ to attach files'
          }
          onChange={(event) => setGoal(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              submit();
            } else if (event.key === 'ArrowUp' && !goal.trim() && history.length) {
              event.preventDefault();
              const next = Math.min(history.length - 1, historyAt + 1);
              setHistoryAt(next);
              setGoal(history[next] ?? '');
            } else if (event.key === 'ArrowDown' && historyAt >= 0) {
              event.preventDefault();
              const next = historyAt - 1;
              setHistoryAt(next);
              setGoal(next >= 0 ? (history[next] ?? '') : '');
            }
          }}
        />
        <div className="ui-composer-actions">
          <button
            type="button"
            className="ui-btn ghost small"
            title="Browse and attach workspace files"
            onClick={() => { setPickerOpen(true); setSkillPickerOpen(false); }}
          >
            <Icon name="paperclip" size={12} /> Attach
          </button>
          <button
            type="button"
            className="ui-btn ghost small"
            aria-pressed={selectedSkills.length > 0}
            title="Invoke saved workspace skills for this request"
            onClick={() => { setSkillPickerOpen((value) => !value); setPickerOpen(false); }}
          >
            <Icon name="sparkles" size={12} /> Skills{selectedSkills.length ? ` (${selectedSkills.length})` : ''}
          </button>
          <span className="ui-composer-hint">
            {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}
            {selectedSkills.length ? ` · ${selectedSkills.length} skill${selectedSkills.length === 1 ? '' : 's'}` : ''}
          </span>
          <span className="ui-grow" />
          <button
            type="button"
            className="ui-btn ghost small"
            aria-pressed={selfHeal}
            disabled={busy}
            title={`Self-healing is ${selfHeal ? 'on' : 'off'} — retries, context shrinking and tool repair`}
            onClick={() => onSelfHealChange(!selfHeal)}
          >
            <Icon name="shield" size={12} /> Self-heal
          </button>
          {busy ? (
            <button type="button" className="ui-btn danger small" onClick={onCancel}>
              <Icon name="stop" size={12} /> Stop
            </button>
          ) : (
            <>
              {mode === 'agent' && session.result?.resumable && session.runId && (
                <>
                  <button type="button" className="ui-btn ghost small" onClick={onResume}>
                    <Icon name="history" size={13} /> Resume
                  </button>
                  <button type="button" className="ui-btn ghost small" onClick={onSelfHeal} title="Resume with a repair directive and a fresh step budget">
                    <Icon name="shield" size={12} /> Self heal
                  </button>
                </>
              )}
              <button type="button" className="ui-btn primary small" disabled={!goal.trim()} onClick={submit}>
                <Icon name={mode === 'agent' ? 'zap' : mode === 'spec' ? 'specs' : 'send'} size={13} />
                {mode === 'ask' ? 'Ask' : mode === 'spec' ? 'Create spec' : 'Run agent'}
              </button>
            </>
          )}
        </div>
        <div className="ui-composer-foot">
          <span>{MODES.find((entry) => entry.key === mode)?.hint}</span>
          <span className="ui-grow" />
          <span className="ui-muted">{health?.config.model ?? 'no model'}</span>
        </div>
      </div>
      {pickerOpen && (
        <AttachmentPicker
          files={workspaceFiles}
          selected={selectedFiles}
          onConfirm={(paths) => {
            onAttachFiles(paths);
            setPickerOpen(false);
            textareaRef.current?.focus();
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {activeChat && <div className="ui-chat-id" title={activeChat.id}>{activeChat.title}</div>}
    </section>
  );
}
