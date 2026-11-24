import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icon';

interface TerminalPanelProps {
  enabled: boolean;
  onEnable: () => void;
}

interface Line {
  id: number;
  kind: 'command' | 'stdout' | 'stderr' | 'error';
  text: string;
}

let lineId = 1;

export default function TerminalPanel({ enabled, onEnable }: TerminalPanelProps) {
  const [command, setCommand] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { id: lineId++, kind: 'stdout', text: 'Anneal shell · workspace root · type a command and press Enter' },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyAt, setHistoryAt] = useState(-1);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [lines]);

  const append = (kind: Line['kind'], text: string) =>
    setLines((prev) => [...prev, { id: lineId++, kind, text }].slice(-600));

  const run = async () => {
    const value = command.trim();
    if (!value || busy || !enabled) return;
    setCommand('');
    setHistory((prev) => [value, ...prev].slice(0, 50));
    setHistoryAt(-1);
    append('command', value);
    setBusy(true);
    try {
      const result = await api.terminal(value);
      for (const line of result.output.split('\n')) {
        if (line.trim()) append(result.ok ? 'stdout' : 'stderr', line);
      }
      if (!result.ok) append('error', 'Command exited with a non-zero status.');
    } catch (err) {
      append('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-terminal">
      <div className="ui-terminal-bar">
        <span className="ui-terminal-label"><Icon name="terminal" size={13} /> bash</span>
        <span className="ui-grow" />
        {!enabled && <button type="button" className="ui-btn tiny" onClick={onEnable}>Enable commands</button>}
        <button type="button" className="ui-btn ghost tiny" onClick={() => setLines([])} title="Clear terminal">
          <Icon name="trash" size={13} /> Clear
        </button>
        {busy && <span className="ui-terminal-busy"><Icon name="loader" size={12} className="spin" /> running</span>}
      </div>
      <div className="ui-terminal-output">
        {lines.map((line) => (
          <div key={line.id} className={`ui-terminal-line ${line.kind}`}>
            {line.kind === 'command' && <span className="ui-terminal-prompt">$</span>}
            <span>{line.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="ui-terminal-input">
        <span className="ui-terminal-prompt">$</span>
        <input
          value={command}
          disabled={!enabled || busy}
          placeholder={enabled ? 'Command…' : 'Shell commands are disabled in Settings'}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void run();
            else if (event.key === 'ArrowUp') {
              event.preventDefault();
              const next = Math.min(history.length - 1, historyAt + 1);
              if (next >= 0) {
                setHistoryAt(next);
                setCommand(history[next] ?? '');
              }
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              const next = historyAt - 1;
              setHistoryAt(next);
              setCommand(next >= 0 ? (history[next] ?? '') : '');
            }
          }}
        />
        <button type="button" className="ui-btn primary tiny" disabled={!enabled || busy || !command.trim()} onClick={() => void run()}>
          Run
        </button>
      </div>
    </div>
  );
}
