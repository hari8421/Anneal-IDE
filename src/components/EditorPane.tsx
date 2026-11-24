import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import type { OpenFile } from '../App';
import { WORKSPACE_URI, breakpointDecorations } from '../editor/intel';
import { Icon, type IconName } from './Icon';

export interface Breakpoint {
  path: string;
  line: number;
}

interface EditorPaneProps {
  files: OpenFile[];
  activePath: string | null;
  dirtyPaths: string[];
  breakpoints: Breakpoint[];
  reveal: { path: string; line: number } | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: () => void;
  onToggleBreakpoint: (path: string, line: number) => void;
  onAttachFile: (path: string) => void;
  onInlineEdit: () => void;
  onQuickOpen: () => void;
  onCursorChange?: (position: { line: number; column: number }) => void;
  onEditorMount?: (editor: EditorLike) => void;
}

type EditorLike = Parameters<OnMount>[0];
type MonacoLike = Parameters<OnMount>[1];

function fileIcon(path: string): IconName {
  const name = path.split('/').pop() ?? '';
  if (name.endsWith('.json')) return 'hash';
  if (name.endsWith('.md')) return 'book';
  if (name.endsWith('.css') || name.endsWith('.scss')) return 'layers';
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return 'check';
  return name.match(/\.(tsx?|jsx?)$/) ? 'code' : 'file';
}

export default function EditorPane({
  files,
  activePath,
  dirtyPaths,
  breakpoints,
  reveal,
  onSelect,
  onClose,
  onChange,
  onSave,
  onToggleBreakpoint,
  onAttachFile,
  onInlineEdit,
  onQuickOpen,
  onCursorChange,
  onEditorMount,
}: EditorPaneProps) {
  const active = files.find((file) => file.path === activePath) ?? files[0] ?? null;

  const editorRef = useRef<EditorLike | null>(null);
  const monacoRef = useRef<MonacoLike | null>(null);
  const collectionRef = useRef<ReturnType<EditorLike['createDecorationsCollection']> | null>(null);
  const activePathRef = useRef<string | null>(active?.path ?? null);
  const toggleRef = useRef(onToggleBreakpoint);
  const breakpointsRef = useRef(breakpoints);

  activePathRef.current = active?.path ?? null;
  toggleRef.current = onToggleBreakpoint;
  breakpointsRef.current = breakpoints;

  const paintBreakpoints = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const path = activePathRef.current;
    if (!editor || !monaco || !path) return;
    if (!collectionRef.current) collectionRef.current = editor.createDecorationsCollection([]);
    collectionRef.current.set(breakpointDecorations(breakpointsRef.current, path));
  }, []);

  useEffect(() => paintBreakpoints(), [breakpoints, active?.path, paintBreakpoints]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal || reveal.path !== active?.path) return;
    editor.revealLineInCenter(reveal.line);
    editor.setPosition({ lineNumber: reveal.line, column: 1 });
    editor.focus();
  }, [reveal, active?.path]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    collectionRef.current = null;
    paintBreakpoints();
    onEditorMount?.(editor);

    editor.onMouseDown((event) => {
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const line = event.target.position?.lineNumber;
      const path = activePathRef.current;
      if (line && path) toggleRef.current(path, line);
    });

    editor.onDidChangeCursorPosition((event) => {
      onCursorChange?.({ line: event.position.lineNumber, column: event.position.column });
    });

    editor.addAction({
      id: 'anneal.toggleBreakpoint',
      label: 'Toggle Breakpoint',
      keybindings: [monaco.KeyCode.F9],
      run: (instance) => {
        const line = instance.getPosition()?.lineNumber;
        const path = activePathRef.current;
        if (line && path) toggleRef.current(path, line);
      },
    });
  };

  const parts = active?.path.split('/') ?? [];

  return (
    <section className="ui-editor">
      <div className="ui-editor-tabs">
        <div className="ui-editor-tabs-scroll">
          {files.map((file) => (
            <div
              key={file.path}
              className={`ui-editor-tab${file.path === active?.path ? ' active' : ''}`}
              onClick={() => onSelect(file.path)}
              title={file.path}
            >
              <Icon name={fileIcon(file.path)} size={13} />
              <span>{file.path.split('/').pop()}</span>
              {dirtyPaths.includes(file.path) && <span className="ui-dirty-dot" title="Unsaved changes" />}
              <button
                type="button"
                className="ui-tab-close"
                aria-label={`Close ${file.path}`}
                onClick={(event) => { event.stopPropagation(); onClose(file.path); }}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="ui-editor-tab-actions">
          {active && (
            <>
              <button
                type="button"
                className="ui-icon-button"
                title={`Attach ${active.path} to chat`}
                aria-label="Attach active file to chat"
                onClick={() => onAttachFile(active.path)}
              >
                <Icon name="paperclip" size={14} />
              </button>
              <button type="button" className="ui-icon-button" title="Inline edit selection (Ctrl/Cmd+K)" onClick={onInlineEdit}>
                <Icon name="sparkles" size={14} />
              </button>
              <button
                type="button"
                className="ui-icon-button"
                title={breakpoints.some((bp) => bp.path === active.path) ? 'Breakpoints set' : 'Toggle breakpoint (F9)'}
                onClick={() => {
                  const line = editorRef.current?.getPosition()?.lineNumber ?? 1;
                  onToggleBreakpoint(active.path, line);
                }}
              >
                <Icon name="debug" size={14} />
              </button>
              <button type="button" className="ui-icon-button" title="Save (Ctrl/Cmd+S)" onClick={onSave}>
                <Icon name="save" size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {active && (
        <div className="ui-breadcrumbs">
          <Icon name="folder" size={12} />
          {parts.map((part, index) => (
            <span key={`${part}-${index}`} className={index === parts.length - 1 ? 'current' : ''}>
              {index > 0 && <Icon name="chevronRight" size={11} />} {part}
            </span>
          ))}
          <span className="ui-grow" />
          <span className="ui-muted tiny">{active.content.split('\n').length} lines</span>
        </div>
      )}

      <div className="ui-editor-body">
        {active ? (
          <Editor
            /* One Monaco model and view state per path: undo history, cursor and
               scroll survive tab switches. */
            path={`${WORKSPACE_URI}/${active.path}`}
            language={active.language}
            theme="anneal-dark"
            value={active.content}
            onChange={(value) => onChange(active.path, value ?? '')}
            onMount={onMount}
            options={{
              fontSize: 13,
              lineHeight: 21,
              fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
              fontLigatures: true,
              minimap: { enabled: true, scale: 0.7, renderCharacters: false },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              renderWhitespace: 'selection',
              automaticLayout: true,
              tabSize: 2,
              glyphMargin: true,
              padding: { top: 14, bottom: 14 },
              quickSuggestions: { other: true, comments: false, strings: false },
              suggestOnTriggerCharacters: true,
              peekWidgetDefaultFocus: 'tree',
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
            }}
          />
        ) : (
          <div className="ui-editor-empty">
            <div className="ui-empty-logo"><Icon name="logo" size={42} strokeWidth={1.2} /></div>
            <h2>Welcome to Anneal</h2>
            <p>A local-first, spec-driven agentic IDE that works with your own models.</p>
            <div className="ui-empty-actions">
              <button type="button" className="ui-btn primary" onClick={onQuickOpen}>
                <Icon name="search" size={14} /> Open a file
              </button>
              <button type="button" className="ui-btn" onClick={onInlineEdit}>
                <Icon name="sparkles" size={14} /> Inline edit
              </button>
            </div>
            <div className="ui-empty-grid">
              <div><Icon name="specs" size={15} /><strong>Specs</strong><span>Requirements → design → tasks</span></div>
              <div><Icon name="zap" size={15} /><strong>Agent</strong><span>Edits, tools and self-healing runs</span></div>
              <div><Icon name="undo" size={15} /><strong>Checkpoints</strong><span>Every write is reversible</span></div>
              <div><Icon name="debug" size={15} /><strong>Debugger</strong><span>Breakpoints and variable inspection</span></div>
            </div>
            <div className="ui-empty-keys">
              <span><kbd className="ui-kbd">⌘P</kbd> quick open</span>
              <span><kbd className="ui-kbd">⌘K</kbd> inline edit</span>
              <span><kbd className="ui-kbd">⌘⇧P</kbd> commands</span>
              <span><kbd className="ui-kbd">?</kbd> shortcuts</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
