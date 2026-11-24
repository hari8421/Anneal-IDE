import { useEffect, useState } from 'react';
import { api, type SearchMatch } from '../lib/api';
import { Icon } from './Icon';

interface SearchPanelProps {
  onOpenFile: (path: string, line?: number) => void;
}

export default function SearchPanel({ onOpenFile }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [glob, setGlob] = useState('');
  const [regex, setRegex] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setMatches([]);
      setTruncated(false);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      setBusy(true);
      void api
        .search(term, { ...(glob.trim() ? { glob: glob.trim() } : {}), regex })
        .then((result) => {
          setMatches(result.matches);
          setTruncated(result.truncated);
          setError(null);
        })
        .catch((err: Error) => {
          setMatches([]);
          setError(err.message);
        })
        .finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [query, glob, regex]);

  const groups = matches.reduce<Record<string, SearchMatch[]>>((acc, match) => {
    (acc[match.path] ??= []).push(match);
    return acc;
  }, {});

  return (
    <div className="ui-search-panel">
      <div className="ui-panel-intro">
        <div className="ui-panel-title"><Icon name="search" size={16} /> Search workspace</div>
        <p>Find text or a regex across source files. Ignored folders are skipped.</p>
      </div>
      <div className="ui-search-fields">
        <div className="ui-input-wrap">
          <Icon name="search" size={14} />
          <input
            autoFocus
            className="ui-input"
            value={query}
            placeholder="Search…"
            onChange={(event) => setQuery(event.target.value)}
          />
          {busy && <Icon name="loader" size={13} className="spin" />}
        </div>
        <div className="ui-input-wrap">
          <Icon name="filter" size={14} />
          <input
            className="ui-input"
            value={glob}
            placeholder="Filter glob, e.g. src/**/*.ts"
            onChange={(event) => setGlob(event.target.value)}
          />
          <button
            type="button"
            className={`ui-toggle${regex ? ' active' : ''}`}
            title="Use regular expression"
            onClick={() => setRegex((value) => !value)}
          >
            .*
          </button>
        </div>
      </div>

      {error && <div className="ui-inline-error"><Icon name="warning" size={13} /> {error}</div>}

      <div className="ui-search-results">
        {!query.trim() && <div className="ui-empty">Type above to search the whole workspace.</div>}
        {query.trim() && !matches.length && !busy && !error && <div className="ui-empty">No matches found.</div>}
        {Object.entries(groups).map(([path, items]) => (
          <div key={path} className="ui-search-group">
            <button type="button" className="ui-search-file" onClick={() => onOpenFile(path)}>
              <Icon name="file" size={13} /> {path}
              <span className="ui-count">{items.length}</span>
            </button>
            {items.map((match) => (
              <button
                key={`${match.line}-${match.text}`}
                type="button"
                className="ui-search-hit"
                onClick={() => onOpenFile(path, match.line)}
                title={`${path}:${match.line}`}
              >
                <span className="ui-hit-line">{match.line}</span>
                <code>{match.text}</code>
              </button>
            ))}
          </div>
        ))}
        {truncated && <div className="ui-inline-note">Results truncated — narrow the query or glob.</div>}
      </div>
    </div>
  );
}
