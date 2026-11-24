import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { fuzzyScore } from './QuickOpen';

interface AttachmentPickerProps {
  files: string[];
  selected: string[];
  onConfirm: (paths: string[]) => void;
  onClose: () => void;
}

/** A single, searchable file picker shared by Ask, Agent and Spec modes. */
export default function AttachmentPicker({ files, selected, onConfirm, onClose }: AttachmentPickerProps) {
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selected));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const visible = useMemo(() => {
    if (!query.trim()) return files;
    return files
      .map((path) => ({ path, score: fuzzyScore(path, query) }))
      .filter((entry): entry is { path: string; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.path);
  }, [files, query]);

  const toggle = (path: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const attached = files.filter((path) => checked.has(path));

  return (
    <div className="ui-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ui-palette" role="dialog" aria-label="Attach workspace files">
        <div className="ui-modal-head">
          <Icon name="paperclip" size={14} />
          <span>Attach workspace files</span>
          <button type="button" className="ui-icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={13} />
          </button>
        </div>
        <div className="ui-palette-search">
          <Icon name="search" size={14} />
          <input
            autoFocus
            value={query}
            placeholder="Filter files by name…"
            aria-label="Filter files"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && visible.length === 1) toggle(visible[0]!);
            }}
          />
          <span className="muted tiny">{checked.size} selected</span>
        </div>
        <div className="ui-palette-list">
          {visible.length === 0 && <div className="ui-empty small">No files match that filter.</div>}
          {visible.map((path) => (
            <button
              key={path}
              type="button"
              className="ui-palette-row"
              aria-pressed={checked.has(path)}
              onClick={() => toggle(path)}
            >
              <span className={`ui-check${checked.has(path) ? ' checked' : ''}`}>
                {checked.has(path) && <Icon name="check" size={9} />}
              </span>
              <Icon name="file" size={12} />
              <span className="ui-palette-title">{path}</span>
            </button>
          ))}
        </div>
        <div className="ui-palette-foot">
          <span>Files are read from this workspace and sent with your next request.</span>
          <span className="ui-grow" />
          <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary small" onClick={() => onConfirm(attached)}>
            Attach {attached.length ? `(${attached.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
