import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

interface InlineEditProps {
  file: string;
  selection: string;
  selectionStart: number;
  selectionEnd: number;
  onAccept: (patched: string) => void;
  onClose: () => void;
}

type Phase = 'input' | 'loading' | 'review';

interface EditResult {
  original: string;
  patched: string;
  patch: string;
}

export default function InlineEdit({ file, selection, onAccept, onClose }: InlineEditProps) {
  const [instruction, setInstruction] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [result, setResult] = useState<EditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!instruction.trim()) return;
    setPhase('loading');
    setError(null);
    try {
      const data = await api.inlineEdit(file, selection, instruction.trim());
      setResult(data);
      setPhase('review');
    } catch (err) {
      setError((err as Error).message);
      setPhase('input');
    }
  };

  const accept = () => {
    if (result) onAccept(result.patched);
    onClose();
  };

  // Compute a human-readable diff for the preview
  const diffLines = computeDiff(result?.original ?? '', result?.patched ?? '');

  return (
    <div className="inline-edit-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="inline-edit">
        <div className="inline-edit-header">
          <span className="inline-edit-title">Cmd-K inline edit</span>
          <span className="muted small">{file}</span>
          <button className="inline-edit-close" onClick={onClose}>×</button>
        </div>

        {selection && (
          <div className="inline-edit-selection">
            <div className="muted tiny" style={{ marginBottom: 4 }}>Selected text</div>
            <pre className="inline-edit-code">{selection.slice(0, 400)}{selection.length > 400 ? '\n…' : ''}</pre>
          </div>
        )}

        {phase === 'input' && (
          <div className="inline-edit-compose">
            <input
              ref={inputRef}
              className="inline-edit-input"
              placeholder="Describe the change, e.g. add error handling, rename to camelCase…"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost small" onClick={onClose}>Cancel</button>
              <button className="btn primary small" onClick={() => void submit()} disabled={!instruction.trim()}>
                Generate edit
              </button>
            </div>
            {error && <div className="notice error">{error}</div>}
          </div>
        )}

        {phase === 'loading' && (
          <div className="inline-edit-compose">
            <div className="muted small" style={{ padding: '8px 0' }}>Generating edit…</div>
          </div>
        )}

        {phase === 'review' && result && (
          <div className="inline-edit-review">
            <div className="muted tiny" style={{ marginBottom: 6 }}>Preview — changes highlighted</div>
            <div className="diff" style={{ maxHeight: 320, overflow: 'auto', borderTop: 'none' }}>
              {diffLines.map((line, i) => (
                <div
                  key={i}
                  className={`diff-row ${line.type}`}
                  style={{ fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'pre-wrap' }}
                >
                  <span className="diff-tag">
                    {line.type === 'added' ? '+' : line.type === 'deleted' ? '-' : ' '}
                  </span>
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn ghost small" onClick={() => setPhase('input')}>Re-generate</button>
              <button className="btn ghost small" onClick={onClose}>Reject</button>
              <button className="btn primary small" onClick={accept}>Accept</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type DiffLine = { type: 'added' | 'deleted' | 'unchanged'; text: string };

function computeDiff(original: string, patched: string): DiffLine[] {
  if (!original && !patched) return [];
  if (original === patched) return original.split('\n').map((text) => ({ type: 'unchanged', text }));

  const origLines = original.split('\n');
  const patchLines = patched.split('\n');

  // Simple LCS-based diff — good enough for the edit sizes we expect
  const lcs = longestCommonSubsequence(origLines, patchLines);
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  for (const common of lcs) {
    while (i < origLines.length && origLines[i] !== common) {
      result.push({ type: 'deleted', text: origLines[i++]! });
    }
    while (j < patchLines.length && patchLines[j] !== common) {
      result.push({ type: 'added', text: patchLines[j++]! });
    }
    result.push({ type: 'unchanged', text: common });
    i++;
    j++;
  }
  while (i < origLines.length) result.push({ type: 'deleted', text: origLines[i++]! });
  while (j < patchLines.length) result.push({ type: 'added', text: patchLines[j++]! });
  return result;
}

function longestCommonSubsequence(a: string[], b: string[]): string[] {
  // Cap to avoid O(n²) on huge files
  const maxLines = 200;
  const as = a.slice(0, maxLines);
  const bs = b.slice(0, maxLines);
  const m = as.length;
  const n = bs.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (as[i - 1] === bs[j - 1]) dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (as[i - 1] === bs[j - 1]) { result.push(as[i - 1]!); i--; j--; }
    else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--;
    else j--;
  }
  return result.reverse();
}
