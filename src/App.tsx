import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ActivityBar, { type ActivityKey } from './components/ActivityBar';
import ApprovalDialog from './components/ApprovalDialog';
import BottomPanel, { type BottomTab } from './components/BottomPanel';
import ChatPanel from './components/ChatPanel';
import CommandPalette, { type Command } from './components/CommandPalette';
import DebugPanel from './components/DebugPanel';
import EditorPane from './components/EditorPane';
import FileTree from './components/FileTree';
import InlineEdit from './components/InlineEdit';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import { McpTab } from './components/McpTab';
import { CheckpointsTab, HooksTab, ModelsTab, RunsTab } from './components/Panels';
import SearchPanel from './components/SearchPanel';
import { SettingsTab } from './components/SettingsTab';
import { SkillsTab } from './components/SkillsTab';
import SpecsPanel from './components/SpecsPanel';
import { SteeringTab } from './components/SteeringTab';
import QuickOpen from './components/QuickOpen';
import WelcomeOverlay from './components/WelcomeOverlay';
import { Icon, type IconName } from './components/Icon';
import { loadWorkspaceIntel, updateIntelSource } from './editor/intel';
import {
  api,
  stream,
  type Autonomy,
  type FileNode,
  type Health,
  type RunSummary,
} from './lib/api';
import { chatTitle, loadChats, newChat, saveChats, type ChatMode, type ChatRecord } from './lib/chat';
import { applyEvent, emptySession } from './lib/session';

export interface OpenFile {
  path: string;
  content: string;
  saved: string;
  language: string;
}

interface ApprovalRequest {
  runId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

const PANEL_TITLES: Record<ActivityKey, { title: string; icon: IconName; hint?: string }> = {
  files: { title: 'Explorer', icon: 'files' },
  search: { title: 'Search', icon: 'search' },
  specs: { title: 'Specs', icon: 'specs', hint: 'Requirements → design → tasks' },
  steering: { title: 'Steering', icon: 'steering', hint: 'Rules injected into every run' },
  skills: { title: 'Skills', icon: 'sparkles', hint: 'Reusable agent workflows' },
  hooks: { title: 'Hooks', icon: 'hooks', hint: 'Event-driven automations' },
  runs: { title: 'Runs', icon: 'runs', hint: 'Journaled agent sessions' },
  checkpoints: { title: 'Checkpoints', icon: 'undo', hint: 'Restore any pre-write snapshot' },
  models: { title: 'Models & memory', icon: 'models' },
  mcp: { title: 'MCP servers', icon: 'mcp' },
  debug: { title: 'Debugger', icon: 'debug' },
  settings: { title: 'Settings', icon: 'settings' },
};

function flattenFiles(nodes: FileNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'file') into.push(node.path);
    else if (node.children?.length) flattenFiles(node.children, into);
  }
  return into;
}

/** Read attached files once and render them as a prompt block shared by Ask and Spec. */
async function attachmentPrompt(files: string[]): Promise<string> {
  const sections: string[] = [];
  let used = 0;
  for (const file of [...new Set(files)]) {
    const remaining = 120_000 - used;
    if (remaining <= 0) break;
    try {
      const { content } = await api.readFile(file);
      const limit = Math.min(48_000, remaining);
      const snippet = content.length > limit ? `${content.slice(0, limit)}\n… [truncated]` : content;
      sections.push(`<workspace-file path=${JSON.stringify(file)}>\n${snippet}\n</workspace-file>`);
      used += snippet.length;
    } catch (err) {
      sections.push(
        `<workspace-file path=${JSON.stringify(file)} error=${JSON.stringify((err as Error).message)} />`,
      );
    }
  }
  return sections.length ? `Workspace files:\n${sections.join('\n\n')}` : '';
}

function ResizeHandle({ axis, onDrag }: { axis: 'x' | 'y'; onDrag: (delta: number) => void }) {
  return (
    <div
      className={`ui-resize ${axis}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      onMouseDown={(event) => {
        event.preventDefault();
        let last = axis === 'x' ? event.clientX : event.clientY;
        const move = (next: MouseEvent) => {
          const current = axis === 'x' ? next.clientX : next.clientY;
          onDrag(current - last);
          last = current;
        };
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
      }}
    />
  );
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityKey>('files');
  const [autonomy, setAutonomy] = useState<Autonomy>('autopilot');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newFile, setNewFile] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [breakpoints, setBreakpoints] = useState<Array<{ path: string; line: number }>>(() => {
    try {
      const raw = localStorage.getItem('anneal.breakpoints');
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as Array<{ path: string; line: number }>) : [];
    } catch {
      return [];
    }
  });
  const [debugRefresh, setDebugRefresh] = useState(0);
  const [reveal, setReveal] = useState<{ path: string; line: number } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{
    file: string;
    selection: string;
    selectionStart: number;
    selectionEnd: number;
  } | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
  const [runSummary, setRunSummary] = useState<{ runId: string; text: string } | null>(null);

  const [chats, setChats] = useState<ChatRecord[]>(() => loadChats());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => loadChats()[0]?.id ?? null);
  const [chatMode, setChatMode] = useState<ChatMode>('agent');
  const [askStreaming, setAskStreaming] = useState(false);
  const [specFocusId, setSpecFocusId] = useState<string | null>(null);
  const [specAutoRequest, setSpecAutoRequest] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('terminal');
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [chatWidth, setChatWidth] = useState(400);
  const [bottomHeight, setBottomHeight] = useState(230);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  const abortRef = useRef<AbortController | null>(null);
  const autonomyTouched = useRef(false);
  const chatsRef = useRef(chats);
  const activeChatIdRef = useRef(activeChatId);
  const submitRef = useRef<(() => void) | null>(null);

  chatsRef.current = chats;
  activeChatIdRef.current = activeChatId;

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const session = activeChat?.session ?? emptySession();
  const askMessages = activeChat?.askMessages ?? [];

  const updateChat = useCallback((id: string, updater: (chat: ChatRecord) => ChatRecord) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? updater(chat) : chat)));
  }, []);

  const ensureChat = useCallback((mode: ChatMode): string => {
    const current = chatsRef.current.find((chat) => chat.id === activeChatIdRef.current);
    if (current && current.mode === mode) return current.id;
    const empty = current && current.session.entries.length === 0 && current.askMessages.length === 0;
    if (empty && current) {
      updateChat(current.id, (chat) => ({ ...chat, mode, updatedAt: Date.now() }));
      return current.id;
    }
    const created = newChat(mode);
    setChats((prev) => [created, ...prev].slice(0, 40));
    setActiveChatId(created.id);
    activeChatIdRef.current = created.id;
    return created.id;
  }, [updateChat]);

  const refreshHealth = useCallback(async () => {
    try {
      const next = await api.health();
      setHealth(next);
      if (!autonomyTouched.current) setAutonomy(next.config.autonomy);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const refreshTree = useCallback(async () => {
    try {
      const { tree: nodes } = await api.tree();
      setTree(nodes);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const refreshRuns = useCallback(async () => {
    try {
      const { runs: list } = await api.runs();
      setRuns(list);
    } catch {
      // run list is best-effort
    }
  }, []);

  const switchWorkspace = useCallback(async () => {
    setOpenFiles([]);
    setActivePath(null);
    setBreakpoints([]);
    setReveal(null);
    await Promise.all([refreshHealth(), refreshTree(), refreshRuns()]);
  }, [refreshHealth, refreshTree, refreshRuns]);

  useEffect(() => {
    const isFirstLaunch = !localStorage.getItem('anneal.welcomed');
    if (isFirstLaunch) setShowWelcome(true);
  }, []);

  useEffect(() => {
    void refreshHealth();
    void refreshTree();
    void refreshRuns();
    const timer = setInterval(() => void refreshHealth(), 15_000);
    return () => clearInterval(timer);
  }, [refreshHealth, refreshTree, refreshRuns]);

  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    try {
      localStorage.setItem('anneal.breakpoints', JSON.stringify(breakpoints));
    } catch {
      // personal storage can be unavailable; breakpoints still work this session
    }
  }, [breakpoints]);

  useEffect(() => {
    void loadWorkspaceIntel().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (session.streaming || askStreaming) return;
    void refreshRuns();
    void refreshTree();
  }, [session.streaming, askStreaming, refreshRuns, refreshTree]);

  useEffect(() => {
    const result = session.result;
    if (!result || result.status !== 'completed' || !result.runId) return;
    if (runSummary?.runId === result.runId) return;
    void api.runSummary(result.runId).then(({ summary }) => {
      if (summary) setRunSummary({ runId: result.runId, text: summary });
    }).catch(() => undefined);
  }, [session.result, runSummary]);

  useEffect(() => {
    const last = session.entries[session.entries.length - 1];
    if (!last || !last.awaitingApproval || !session.runId) return;
    if (approvalRequest?.runId === session.runId) return;
    setApprovalRequest({
      runId: session.runId,
      toolName: last.name ?? 'unknown',
      toolArgs: (() => {
        try { return JSON.parse(last.args ?? '{}') as Record<string, unknown>; } catch { return {}; }
      })(),
    });
  }, [session.entries, session.runId, approvalRequest]);

  const openFile = useCallback(
    async (path: string, line?: number) => {
      setActivePath(path);
      if (!openFiles.some((file) => file.path === path)) {
        try {
          const file = await api.readFile(path);
          setOpenFiles((prev) =>
            prev.some((entry) => entry.path === file.path)
              ? prev
              : [...prev, { path: file.path, content: file.content, saved: file.content, language: file.language }],
          );
        } catch (err) {
          setError((err as Error).message);
        }
      }
      if (line !== undefined) setReveal({ path, line });
    },
    [openFiles],
  );

  const saveActive = useCallback(async (path: string | null = activePath) => {
    const active = openFiles.find((file) => file.path === path);
    if (!active || active.content === active.saved) return;
    try {
      await api.saveFile(active.path, active.content);
      updateIntelSource(active.path, active.content);
      setOpenFiles((prev) => prev.map((file) => (file.path === active.path ? { ...file, saved: file.content } : file)));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [activePath, openFiles]);

  const triggerInlineEdit = useCallback(() => {
    const monacoEditor = (window as unknown as { __annealEditor?: {
      getSelection: () => { startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number } | null;
      getModel: () => { getValueInRange: (range: unknown) => string } | null;
    } }).__annealEditor;
    if (!activePath || !monacoEditor) return;
    const selection = monacoEditor.getSelection();
    const model = monacoEditor.getModel();
    if (!selection || !model) return;
    const text = model.getValueInRange(selection);
    if (!text.trim()) return;
    setInlineEdit({
      file: activePath,
      selection: text,
      selectionStart: selection.startLineNumber,
      selectionEnd: selection.endLineNumber,
    });
  }, [activePath]);

  const toggleBreakpoint = useCallback((path: string, line: number) => {
    setBreakpoints((prev) =>
      prev.some((bp) => bp.path === path && bp.line === line)
        ? prev.filter((bp) => !(bp.path === path && bp.line === line))
        : [...prev, { path, line }].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line),
    );
  }, []);

  const showDebugger = useCallback(() => {
    setBottomOpen(true);
    setBottomTab('debug');
  }, []);

  const startDebugFromCode = useCallback(async (path: string | null = activePath) => {
    if (!path) {
      setError('Open a file before starting a debug session.');
      showDebugger();
      return;
    }
    try {
      await saveActive(path);
      await api.debugStart(path, breakpoints);
      setError(null);
      setDebugRefresh((value) => value + 1);
      showDebugger();
    } catch (err) {
      setError((err as Error).message);
      showDebugger();
    }
  }, [activePath, breakpoints, saveActive, showDebugger]);

  const debugKeyAction = useCallback(async (key: string, shiftKey: boolean) => {
    try {
      const state = await api.debugState();
      if (key === 'F5') {
        if (state.status === 'paused') await api.debugAction('continue');
        else await startDebugFromCode();
      } else if (state.status === 'paused') {
        if (key === 'F10') await api.debugAction('stepOver');
        else if (key === 'F11') await api.debugAction(shiftKey ? 'stepOut' : 'stepInto');
      }
      setDebugRefresh((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [startDebugFromCode]);

  const broadcast = useCallback((event: string, data: Record<string, unknown>) => {
    const id = activeChatIdRef.current;
    if (!id) return;
    updateChat(id, (chat) => ({ ...chat, session: applyEvent(chat.session, event, data), updatedAt: Date.now() }));
  }, [updateChat]);

  const listen = useCallback(
    async (url: string, body: unknown, label: string, options?: { resumeOf?: string }) => {
      abortRef.current?.abort();
      const id = ensureChat('agent');
      const controller = new AbortController();
      abortRef.current = controller;
      const existing = chatsRef.current.find((chat) => chat.id === id);
      const continueTranscript = Boolean(
        options?.resumeOf &&
          existing &&
          existing.session.runId === options.resumeOf &&
          existing.session.entries.length > 0,
      );
      updateChat(id, (chat) => ({
        ...chat,
        title: chatTitle(label),
        updatedAt: Date.now(),
        session: continueTranscript
          ? { ...chat.session, streaming: true, error: null, result: null }
          : {
              ...emptySession(),
              streaming: true,
              entries: [{ id: Date.now(), kind: 'user', text: label }],
            },
      }));
      setChatMode('agent');
      setRunSummary(null);
      setError(null);
      try {
        await stream(url, body, broadcast, controller.signal);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const message = (err as Error).message;
          updateChat(id, (chat) => ({ ...chat, session: { ...chat.session, streaming: false, error: message } }));
          setError(message);
        }
      } finally {
        abortRef.current = null;
        await refreshTree();
        await refreshRuns();
      }
    },
    [broadcast, ensureChat, refreshRuns, refreshTree, updateChat],
  );

  const contextFiles = useCallback(() => {
    if (selected.length) return selected;
    return activePath ? [activePath] : [];
  }, [activePath, selected]);

  const attachFiles = useCallback((paths: string[]) => {
    setSelected((prev) => [...new Set([...prev, ...paths])]);
  }, []);

  const runGoal = useCallback(
    (goal: string, files: string[] = contextFiles()) => {
      void listen('/api/run', { goal, files, autonomy }, goal);
    },
    [autonomy, contextFiles, listen],
  );

  const resumeRun = useCallback(
    (runId: string, options: { selfHeal?: boolean } = {}) => {
      // Each resume extends the ceiling by another full budget, so a run that
      // paused at step N actually gets steps N..N+maxSteps to finish.
      const budget = Math.max(1, health?.config.maxSteps ?? 24);
      const label = options.selfHeal ? `Self-heal run ${runId}` : `Resume run ${runId}`;
      void listen(
        `/api/runs/${encodeURIComponent(runId)}/resume`,
        {
          files: contextFiles(),
          autonomy,
          resumeSteps: budget,
          ...(options.selfHeal ? { selfHeal: true } : {}),
        },
        label,
        { resumeOf: runId },
      );
    },
    [autonomy, contextFiles, health?.config.maxSteps, listen],
  );

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    if (session.runId) void api.cancelRun(session.runId).catch(() => undefined);
  }, [session.runId]);

  const runSpecTask = useCallback(
    (specId: string, taskId: string) => {
      void listen(`/api/specs/${encodeURIComponent(specId)}/tasks/${encodeURIComponent(taskId)}/run`, {}, `Implement task ${taskId} in ${specId}`);
    },
    [listen],
  );

  const runNextTask = useCallback(
    (specId: string) => {
      void listen(`/api/specs/${encodeURIComponent(specId)}/run-next`, {}, `Run the next task of ${specId}`);
    },
    [listen],
  );

  const askGoal = useCallback(
    async (text: string, files: string[]) => {
      const id = ensureChat('ask');
      const prior = chatsRef.current.find((chat) => chat.id === id)?.askMessages ?? [];
      const controller = new AbortController();
      abortRef.current = controller;
      setAskStreaming(true);
      setError(null);
      updateChat(id, (chat) => ({
        ...chat,
        title: chatTitle(text),
        updatedAt: Date.now(),
        askMessages: [...chat.askMessages, { role: 'user', text }, { role: 'assistant', text: '' }],
      }));

      // Ask has no tool loop. With attachments, read them here; otherwise let
      // the server add a compact workspace map so codebase questions get a
      // grounded answer in one call.
      const attachments = await attachmentPrompt(files);
      const contextual = !attachments;
      const prompt = attachments ? `${text}\n\n${attachments}` : text;
      updateChat(id, (chat) => ({
        ...chat,
        askMessages: chat.askMessages.map((message, index) =>
          index === chat.askMessages.length - 2 ? { ...message, content: prompt } : message,
        ),
      }));

      const messages = [
        ...prior.map((message) => ({ role: message.role, content: message.content ?? message.text })),
        { role: 'user' as const, content: prompt },
      ];
      let answer = '';
      void api.chatStream(messages, (chunk) => {
        answer += chunk;
        updateChat(id, (chat) => ({
          ...chat,
          updatedAt: Date.now(),
          askMessages: chat.askMessages.map((message, index) =>
            index === chat.askMessages.length - 1 ? { ...message, text: answer } : message,
          ),
        }));
      }, controller.signal, contextual).catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message);
      }).finally(() => {
        abortRef.current = null;
        setAskStreaming(false);
      });
    },
    [ensureChat, updateChat],
  );

  const specGoal = useCallback(
    async (text: string, files: string[] = []) => {
      ensureChat('spec');
      const words = text.replace(/^(build|add|create|implement|make)\s+/i, '').split(/[,.;\n]/)[0]?.trim() || text;
      const name = words.slice(0, 60);
      try {
        const { spec } = await api.createSpec(name);
        const attachments = await attachmentPrompt(files);
        setSpecFocusId(spec.id);
        setSpecAutoRequest(attachments ? `${text}\n\n${attachments}` : text);
        setActivity('specs');
        setSidebarOpen(true);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [ensureChat],
  );

  const createFile = useCallback(async () => {
    const name = newFile.trim();
    if (!name) return;
    try {
      const created = await api.createFile(name, 'file');
      setNewFile('');
      setShowNewFile(false);
      await refreshTree();
      await openFile(created.path);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [newFile, openFile, refreshTree]);

  const deleteFile = useCallback(async (path: string) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete ${path}? This cannot be undone unless a checkpoint covers it.`)) return;
    try {
      await api.deleteFile(path);
      setOpenFiles((prev) => prev.filter((file) => file.path !== path));
      setActivePath((current) => (current === path ? null : current));
      await refreshTree();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [refreshTree]);

  const renameFile = useCallback(async (path: string, name: string) => {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const to = parent ? `${parent}/${name}` : name;
    try {
      const result = await api.rename(path, to);
      setOpenFiles((prev) => prev.map((file) => file.path === path ? { ...file, path: result.to } : file));
      setActivePath((current) => (current === path ? result.to : current));
      setSelected((prev) => prev.map((entry) => (entry === path ? result.to : entry)));
      await refreshTree();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [refreshTree]);

  const closeFile = useCallback(
    (path: string) => {
      const file = openFiles.find((entry) => entry.path === path);
      if (file && file.content !== file.saved) {
        // eslint-disable-next-line no-alert
        if (!window.confirm(`Discard unsaved changes in ${path}?`)) return;
      }
      setOpenFiles((prev) => prev.filter((entry) => entry.path !== path));
      setActivePath((current) => (current === path ? null : current));
    },
    [openFiles],
  );

  const changeModel = useCallback(
    async (model: string) => {
      if (!model || model === health?.config.model) return;
      try {
        await api.updateConfig({ model });
        await refreshHealth();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [health?.config.model, refreshHealth],
  );

  const changeAutonomy = useCallback((next: Autonomy) => {
    autonomyTouched.current = true;
    setAutonomy(next);
    void api.updateConfig({ autonomy: next }).catch(() => undefined);
  }, []);

  const changeSelfHeal = useCallback(
    async (enabled: boolean) => {
      try {
        await api.updateConfig({ selfHeal: enabled });
        await refreshHealth();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refreshHealth],
  );

  const acceptInlineEdit = useCallback(
    (patched: string) => {
      if (!inlineEdit) return;
      const { file } = inlineEdit;
      setOpenFiles((prev) => prev.map((f) => (f.path === file ? { ...f, content: patched } : f)));
      void api.saveFile(file, patched).then(() => {
        updateIntelSource(file, patched);
        setOpenFiles((prev) => prev.map((f) => (f.path === file ? { ...f, saved: patched } : f)));
      }).catch(() => undefined);
    },
    [inlineEdit],
  );

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    setActiveChatId((current) => (current === id ? null : current));
  }, []);

  const changeMode = useCallback((mode: ChatMode) => {
    setChatMode(mode);
    ensureChat(mode);
  }, [ensureChat]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 's') {
        event.preventDefault();
        void saveActive();
      } else if (modifier && key === 'p' && !event.shiftKey) {
        event.preventDefault();
        setQuickOpen(true);
      } else if (modifier && event.shiftKey && key === 'p') {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (modifier && key === 'b') {
        event.preventDefault();
        setSidebarOpen((value) => !value);
      } else if (modifier && key === '`') {
        event.preventDefault();
        setBottomOpen((value) => !value);
      } else if (modifier && event.shiftKey && key === 'l') {
        event.preventDefault();
        setChatOpen((value) => !value);
      } else if (modifier && key === 'k') {
        event.preventDefault();
        triggerInlineEdit();
      } else if (modifier && event.key === 'Enter') {
        event.preventDefault();
        submitRef.current?.();
      } else if (!modifier && (event.key === 'F5' || event.key === 'F10' || event.key === 'F11')) {
        event.preventDefault();
        void debugKeyAction(event.key, event.shiftKey);
      } else if (!modifier && event.key === '?') {
        const tag = (event.target as HTMLElement).tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          event.preventDefault();
          setShowShortcuts(true);
        }
      } else if (event.key === 'Escape') {
        setQuickOpen(false);
        setPaletteOpen(false);
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [debugKeyAction, saveActive, triggerInlineEdit]);

  const commands = useMemo<Command[]>(() => {
    const show = (key: ActivityKey) => { setActivity(key); setSidebarOpen(true); };
    return [
      { id: 'quick-open', title: 'Quick open file…', category: 'File', keys: '⌘P', icon: 'search', run: () => setQuickOpen(true) },
      { id: 'new-file', title: 'New file…', category: 'File', icon: 'filePlus', run: () => { show('files'); setShowNewFile(true); } },
      { id: 'save', title: 'Save active file', category: 'File', keys: '⌘S', icon: 'save', run: () => void saveActive() },
      { id: 'close-file', title: 'Close active file', category: 'File', icon: 'close', run: () => activePath && closeFile(activePath) },
      { id: 'inline-edit', title: 'Inline edit selection', category: 'Editor', keys: '⌘K', icon: 'sparkles', run: triggerInlineEdit },
      { id: 'toggle-sidebar', title: 'Toggle sidebar', category: 'View', keys: '⌘B', icon: 'panelLeft', run: () => setSidebarOpen((v) => !v) },
      { id: 'toggle-chat', title: 'Toggle agent chat', category: 'View', keys: '⌘⇧L', icon: 'panelRight', run: () => setChatOpen((v) => !v) },
      { id: 'toggle-bottom', title: 'Toggle terminal / debug panel', category: 'View', keys: '⌘`', icon: 'panelBottom', run: () => setBottomOpen((v) => !v) },
      { id: 'terminal', title: 'Focus terminal', category: 'View', icon: 'terminal', run: () => { setBottomOpen(true); setBottomTab('terminal'); } },
      { id: 'output', title: 'Focus agent log', category: 'View', icon: 'output', run: () => { setBottomOpen(true); setBottomTab('output'); } },
      { id: 'debugger', title: 'Focus debugger', category: 'View', icon: 'debug', run: showDebugger },
      { id: 'debug-current-file', title: 'Debug current file', category: 'Debug', keys: 'F5', icon: 'play', run: () => void startDebugFromCode() },
      { id: 'shortcuts', title: 'Keyboard shortcuts', category: 'Help', keys: '?', icon: 'keyboard', run: () => setShowShortcuts(true) },
      { id: 'ask', title: 'Ask mode — answer without edits', category: 'Agent', icon: 'lightbulb', run: () => { setChatOpen(true); changeMode('ask'); } },
      { id: 'agent', title: 'Agent mode — plan and edit', category: 'Agent', icon: 'zap', run: () => { setChatOpen(true); changeMode('agent'); } },
      { id: 'spec', title: 'Spec mode — requirements, design, tasks', category: 'Agent', icon: 'specs', run: () => { setChatOpen(true); changeMode('spec'); } },
      { id: 'new-chat', title: 'New conversation', category: 'Agent', icon: 'plus', run: () => { setChatOpen(true); const created = newChat(chatMode); setChats((prev) => [created, ...prev].slice(0, 40)); setActiveChatId(created.id); } },
      { id: 'autonomy-autopilot', title: 'Set autonomy: autopilot', category: 'Agent', icon: 'zap', run: () => changeAutonomy('autopilot') },
      { id: 'autonomy-supervised', title: 'Set autonomy: supervised', category: 'Agent', icon: 'shield', run: () => changeAutonomy('supervised') },
      { id: 'self-heal', title: `Self-healing: ${health?.config.selfHeal === false ? 'off — turn on' : 'on — turn off'}`, category: 'Agent', icon: 'shield', run: () => void changeSelfHeal(!health?.config.selfHeal) },
      { id: 'stop', title: 'Stop running agent', category: 'Agent', icon: 'stop', run: cancelRun },
      ...(['files', 'search', 'specs', 'steering', 'skills', 'hooks', 'runs', 'checkpoints', 'models', 'mcp', 'debug', 'settings'] as ActivityKey[]).map((key) => ({
        id: `view-${key}`, title: `View: ${PANEL_TITLES[key].title}`, category: 'Panels', icon: PANEL_TITLES[key].icon, run: () => show(key),
      })),
    ];
  }, [activePath, cancelRun, changeAutonomy, changeMode, changeSelfHeal, chatMode, closeFile, health?.config.selfHeal, saveActive, showDebugger, startDebugFromCode, triggerInlineEdit]);

  const workspaceFiles = useMemo(() => flattenFiles(tree), [tree]);
  const dirtyPaths = openFiles.filter((file) => file.content !== file.saved).map((file) => file.path);
  const context = session.context;
  const models = health?.config.provider === 'external'
    ? [{ id: health.config.externalModel || health.config.model }]
    : health?.config.provider === 'opencode'
      ? [{ id: health.config.opencodeModel || health.config.model }]
      : health?.lmStudio.models ?? [];
  const offline = Boolean(health && health.lmStudio.ok === false && health.config.provider === 'lmstudio');
  const providerLabel = health?.config.provider === 'opencode'
    ? 'OpenCode'
    : health?.config.provider === 'external'
      ? 'external'
      : 'local';

  const layoutStyle = {
    '--sidebar-w': `${sidebarWidth}px`,
    '--chat-w': `${chatWidth}px`,
    '--bottom-h': `${bottomHeight}px`,
  } as CSSProperties;

  const debugProps = {
    activePath,
    breakpoints,
    refreshKey: debugRefresh,
    onToggleBreakpoint: toggleBreakpoint,
    onClearBreakpoints: () => setBreakpoints([]),
    onOpenFile: (path: string, line: number) => { void openFile(path); setReveal({ path, line }); },
  };

  const panel = PANEL_TITLES[activity];

  return (
    <div className={`ui-app${sidebarOpen ? '' : ' no-sidebar'}${chatOpen ? '' : ' no-chat'}${bottomOpen ? '' : ' no-bottom'}`} style={layoutStyle}>
      <header className="ui-titlebar">
        <div className="ui-title-left">
          <span className="ui-brand-mark"><Icon name="logo" size={17} strokeWidth={1.4} /></span>
          <span className="ui-brand-name">Anneal</span>
          <span className="ui-brand-tag">agentic IDE</span>
        </div>
        <button type="button" className="ui-command-trigger" onClick={() => setQuickOpen(true)}>
          <Icon name="search" size={13} />
          <span>Search files by name…</span>
          <span className="ui-kbd">⌘P</span>
        </button>
        <div className="ui-title-right">
          <span className={`ui-status-pill ${offline ? 'off' : health ? 'on' : ''}`} title={health?.config.baseUrl ?? 'Connecting…'}>
            <span className="ui-status-dot" />
            {offline ? 'model offline' : health ? `${providerLabel} · ${health.config.model}` : 'connecting…'}
          </span>
          <select
            className="ui-select small"
            value={health?.config.model ?? ''}
            disabled={!health}
            title="Active model"
            onChange={(event) => void changeModel(event.target.value)}
          >
            {(models.length ? models : [{ id: health?.config.model ?? 'local-model' }]).map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}{model.contextLength ? ` · ${Math.round(model.contextLength / 1024)}k` : ''}
              </option>
            ))}
          </select>
          <span className="ui-pill" title="Tool approval mode">{autonomy}</span>
          <button type="button" className="ui-icon-button" title="Command palette (⌘⇧P)" aria-label="Command palette" onClick={() => setPaletteOpen(true)}>
            <Icon name="command" size={15} />
          </button>
          <button type="button" className="ui-icon-button" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setShowShortcuts(true)}>
            <Icon name="keyboard" size={15} />
          </button>
        </div>
      </header>

      <div className="ui-workbench">
        <ActivityBar
          active={activity}
          onSelect={setActivity}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          bottomOpen={bottomOpen}
          onToggleBottom={() => setBottomOpen((v) => !v)}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((v) => !v)}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        {sidebarOpen && (
          <>
            <aside className="ui-sidebar">
              <div className="ui-sidebar-head">
                <Icon name={panel.icon} size={15} />
                <span>{panel.title}</span>
                {activity === 'runs' && runs.length > 0 && <span className="ui-count">{runs.length}</span>}
                <span className="ui-grow" />
                {activity === 'files' && (
                  <button type="button" className="ui-icon-button" title="New file" aria-label="New file" onClick={() => setShowNewFile((v) => !v)}>
                    <Icon name="filePlus" size={15} />
                  </button>
                )}
                <button type="button" className="ui-icon-button" title="Refresh" aria-label="Refresh panel" onClick={() => { void refreshTree(); void refreshRuns(); void refreshHealth(); }}>
                  <Icon name="refresh" size={14} />
                </button>
                <button type="button" className="ui-icon-button" title="Hide sidebar" aria-label="Hide sidebar" onClick={() => setSidebarOpen(false)}>
                  <Icon name="panelLeft" size={15} />
                </button>
              </div>
              {panel.hint && <div className="ui-sidebar-hint">{panel.hint}</div>}

              <div className="ui-sidebar-body">
                {activity === 'files' && (
                  <>
                    {showNewFile && (
                      <div className="ui-new-file">
                        <input
                          className="ui-input"
                          autoFocus
                          value={newFile}
                          placeholder="src/new-file.ts"
                          onChange={(event) => setNewFile(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void createFile();
                            if (event.key === 'Escape') { setShowNewFile(false); setNewFile(''); }
                          }}
                        />
                        <button type="button" className="ui-btn primary tiny" onClick={() => void createFile()}>Create</button>
                      </div>
                    )}
                    <FileTree
                      nodes={tree}
                      activePath={activePath}
                      selected={selected}
                      onOpen={(path) => void openFile(path)}
                      onToggleSelect={(path) => setSelected((prev) => prev.includes(path) ? prev.filter((entry) => entry !== path) : [...prev, path])}
                      onAttachFile={(path) => attachFiles([path])}
                      onRename={(path, name) => void renameFile(path, name)}
                      onDelete={(path) => void deleteFile(path)}
                    />
                    <div className="ui-panel-foot">
                      <span>{selected.length ? `${selected.length} in context` : 'Click a checkbox to attach a file'}</span>
                      <span className="ui-grow" />
                      <span>{openFiles.length} open</span>
                    </div>
                  </>
                )}
                {activity === 'search' && <SearchPanel onOpenFile={(path, line) => void openFile(path, line)} />}
                {activity === 'specs' && (
                  <SpecsPanel
                    busy={session.streaming}
                    focusId={specFocusId}
                    autoRequest={specAutoRequest}
                    onFocusHandled={() => setSpecFocusId(null)}
                    onAutoRequestHandled={() => setSpecAutoRequest(null)}
                    onRunTask={runSpecTask}
                    onRunNext={runNextTask}
                  />
                )}
                {activity === 'steering' && <SteeringTab />}
                {activity === 'skills' && <SkillsTab />}
                {activity === 'hooks' && <HooksTab running={session.streaming} />}
                {activity === 'runs' && (
                  <RunsTab
                    runs={runs}
                    onResume={(id) => resumeRun(id)}
                    onSelfHeal={(id) => resumeRun(id, { selfHeal: true })}
                    onCancel={(id) => { void api.cancelRun(id).catch(() => undefined); void refreshRuns(); }}
                    onRefresh={() => void refreshRuns()}
                  />
                )}
                {activity === 'checkpoints' && <CheckpointsTab onRestored={() => void refreshTree()} />}
                {activity === 'models' && <ModelsTab health={health} onSaved={refreshHealth} />}
                {activity === 'mcp' && <McpTab />}
                {activity === 'debug' && <DebugPanel {...debugProps} />}
                {activity === 'settings' && (
  <SettingsTab health={health} onSaved={refreshHealth} onWorkspaceChanged={switchWorkspace} />
)}
              </div>
            </aside>
            <ResizeHandle axis="x" onDrag={(delta) => setSidebarWidth((width) => Math.max(220, Math.min(480, width + delta)))} />
          </>
        )}

        <div className="ui-center">
          <EditorPane
            files={openFiles}
            activePath={activePath}
            dirtyPaths={dirtyPaths}
            breakpoints={breakpoints}
            reveal={reveal}
            onToggleBreakpoint={toggleBreakpoint}
            onStartDebug={(path) => void startDebugFromCode(path)}
            onAttachFile={(path) => attachFiles([path])}
            onSelect={setActivePath}
            onClose={closeFile}
            onChange={(path, content) => setOpenFiles((prev) => prev.map((file) => file.path === path ? { ...file, content } : file))}
            onSave={() => void saveActive()}
            onInlineEdit={triggerInlineEdit}
            onQuickOpen={() => setQuickOpen(true)}
            onCursorChange={setCursor}
            onEditorMount={(editor) => {
              (window as unknown as { __annealEditor?: unknown }).__annealEditor = editor;
            }}
          />

          {bottomOpen && (
            <>
              <ResizeHandle axis="y" onDrag={(delta) => setBottomHeight((height) => Math.max(150, Math.min(520, height - delta)))} />
              <BottomPanel
                tab={bottomTab}
                onTab={setBottomTab}
                onClose={() => setBottomOpen(false)}
                terminalEnabled={health?.config.allowCommands ?? false}
                onEnableTerminal={() => { setActivity('settings'); setSidebarOpen(true); }}
                session={session}
                debugProps={debugProps}
              />
            </>
          )}
        </div>

        {chatOpen && (
          <>
            <ResizeHandle axis="x" onDrag={(delta) => setChatWidth((width) => Math.max(320, Math.min(620, width - delta)))} />
            <ChatPanel
              mode={chatMode}
              onModeChange={changeMode}
              chats={chats}
              activeChatId={activeChatId}
              onSelectChat={(id) => {
                const chat = chats.find((entry) => entry.id === id);
                if (chat) setChatMode(chat.mode);
                setActiveChatId(id);
              }}
              onNewChat={() => {
                const created = newChat(chatMode);
                setChats((prev) => [created, ...prev].slice(0, 40));
                setActiveChatId(created.id);
              }}
              onDeleteChat={deleteChat}
              session={session}
              askMessages={askMessages}
              askStreaming={askStreaming}
              health={health}
              autonomy={autonomy}
              onAutonomyChange={changeAutonomy}
              selectedFiles={contextFiles()}
              onRemoveFile={(path) => setSelected((prev) => prev.filter((entry) => entry !== path))}
              workspaceFiles={workspaceFiles}
              runSummary={runSummary?.text ?? null}
              onRunGoal={runGoal}
              onAsk={askGoal}
              onSpec={(text, files) => void specGoal(text, files)}
              onCancel={cancelRun}
              onResume={() => session.runId && resumeRun(session.runId)}
              onSelfHeal={() => session.runId && resumeRun(session.runId, { selfHeal: true })}
              selfHeal={health?.config.selfHeal ?? true}
              onSelfHealChange={(enabled) => void changeSelfHeal(enabled)}
              onAttachFile={(path) => attachFiles([path])}
              onAttachFiles={attachFiles}
              onOpenFile={(path) => void openFile(path)}
              onClose={() => setChatOpen(false)}
              submitRef={submitRef}
              onRetryHealth={() => void refreshHealth()}
            />
          </>
        )}
      </div>

      <footer className="ui-statusbar">
        <span className="ui-status-item clickable" onClick={() => { setActivity('models'); setSidebarOpen(true); }} title="Provider settings">
          <Icon name="branch" size={12} /> {health?.config.provider ?? '…'}
        </span>
        <span className="ui-status-item" title="Workspace root">
          <Icon name="folder" size={12} /> {health?.config.workspaceRoot ?? '…'}
        </span>
        <span className="ui-status-item" title="Cursor position">
          <Icon name="hash" size={12} /> {cursor.line}:{cursor.column}
        </span>
        <span className="ui-status-item" title="Context window usage">
          <Icon name="database" size={12} /> {context ? `${context.tokens}/${context.budget}` : health?.config.contextBudgetTokens ?? 0} tokens
          {context && (context.dropped > 0 || context.truncated > 0) ? ` · ${context.dropped} dropped, ${context.truncated} truncated` : ''}
        </span>
        <span className="ui-grow" />
        {session.streaming || askStreaming ? (
          <span className="ui-status-item live"><Icon name="loader" size={12} className="spin" /> agent working…</span>
        ) : null}
        <span className="ui-status-item" title="Memories"><Icon name="database" size={12} /> {health?.memory.facts ?? 0}</span>
        <span className="ui-status-item clickable" onClick={() => { setBottomOpen(true); setBottomTab('debug'); }} title="Breakpoints">
          <Icon name="debug" size={12} /> {breakpoints.length}
        </span>
        <span className="ui-status-item clickable" onClick={() => { setActivity('hooks'); setSidebarOpen(true); }} title="Hooks">
          <Icon name="webhook" size={12} /> {health?.hooks ?? 0}
        </span>
        <span className="ui-status-item clickable" onClick={() => { setActivity('mcp'); setSidebarOpen(true); }} title="MCP tools">
          <Icon name="mcp" size={12} /> {health?.mcp.tools ?? 0}
        </span>
        <span className="ui-status-item clickable" onClick={() => setPaletteOpen(true)} title="Command palette">
          <Icon name="command" size={12} /> commands
        </span>
      </footer>

      {showWelcome && (
        <WelcomeOverlay
          health={health}
          onWorkspaceChanged={switchWorkspace}
          onDone={() => {
            localStorage.setItem('anneal.welcomed', '1');
            setShowWelcome(false);
            void refreshHealth();
          }}
        />
      )}
      {quickOpen && (
        <QuickOpen
          files={workspaceFiles}
          onClose={() => setQuickOpen(false)}
          onPick={(path) => { setQuickOpen(false); void openFile(path); }}
        />
      )}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}
      {inlineEdit && <InlineEdit {...inlineEdit} onAccept={acceptInlineEdit} onClose={() => setInlineEdit(null)} />}
      {approvalRequest && (
        <ApprovalDialog
          runId={approvalRequest.runId}
          toolName={approvalRequest.toolName}
          toolArgs={approvalRequest.toolArgs}
          onResolved={() => setApprovalRequest(null)}
        />
      )}
      {error && (
        <div className="ui-toast" role="alert">
          <Icon name="warning" size={15} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss"><Icon name="close" size={13} /></button>
        </div>
      )}
    </div>
  );
}
