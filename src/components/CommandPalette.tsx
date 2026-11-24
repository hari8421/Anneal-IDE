import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyScore } from './QuickOpen';
import { Icon, type IconName } from './Icon';

export interface Command {
  id: string;
  title: string;
  category: string;
  keys?: string;
  icon?: IconName;
  run: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export default function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('>');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const needle = query.startsWith('>') ? query.slice(1) : query;
  const results = useMemo(
    () =>
      commands
        .map((command) => ({ command, score: fuzzyScore(`${command.category} ${command.title}`, needle) }))
        .filter((entry): entry is { command: Command; score: number } => entry.score !== null)
        .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))
        .slice(0, 60)
        .map((entry) => entry.command),
    [commands, needle],
  );

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    const row = listRef.current?.children[index] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const grouped = useMemo(() => {
    const groups: Array<{ category: string; items: Command[] }> = [];
    for (const command of results) {
      const last = groups[groups.length - 1];
      if (last?.category === command.category) last.items.push(command);
      else groups.push({ category: command.category, items: [command] });
    }
    return groups;
  }, [results]);

  const execute = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div className="ui-overlay" onMouseDown={onClose}>
      <div className="ui-palette" role="dialog" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="ui-palette-search">
          <Icon name="command" size={18} />
          <input
            autoFocus
            value={query}
            aria-label="Type a command"
            placeholder="Type a command to run…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!results.length) return;
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                setIndex((current) => (current + delta + results.length) % results.length);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                execute(results[index]);
              }
            }}
          />
          <span className="ui-kbd">esc</span>
        </div>
        <div className="ui-palette-list" ref={listRef}>
          {grouped.map((group) => (
            <div key={group.category}>
              <div className="ui-palette-group">{group.category}</div>
              {group.items.map((command) => {
                const position = results.indexOf(command);
                return (
                  <button
                    key={command.id}
                    type="button"
                    className={`ui-palette-row${position === index ? ' active' : ''}`}
                    onMouseEnter={() => setIndex(position)}
                    onClick={() => execute(command)}
                  >
                    <Icon name={command.icon ?? 'chevronRight'} size={15} />
                    <span className="ui-palette-title">{command.title}</span>
                    {command.keys && <span className="ui-kbd">{command.keys}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {!results.length && <div className="ui-empty">No command matches “{needle}”.</div>}
        </div>
        <div className="ui-palette-foot">
          <span><span className="ui-kbd">↑↓</span> navigate</span>
          <span><span className="ui-kbd">↵</span> run</span>
          <span className="ui-grow" />
          <span>{commands.length} commands</span>
        </div>
      </div>
    </div>
  );
}
