import { useMemo, useState } from 'react';
import type { FileNode } from '../lib/api';
import { Icon, type IconName } from './Icon';

interface FileTreeProps {
  nodes: FileNode[];
  activePath: string | null;
  selected: string[];
  onOpen: (path: string) => void;
  onToggleSelect: (path: string) => void;
  onRename: (path: string, name: string) => void;
  onDelete: (path: string) => void;
}

function iconFor(node: FileNode, open: boolean): IconName {
  if (node.type === 'dir') return open ? 'folderOpen' : 'folder';
  const name = node.name.toLowerCase();
  if (name.endsWith('.md')) return 'book';
  if (name.endsWith('.json')) return 'hash';
  if (name.endsWith('.css') || name.endsWith('.scss')) return 'layers';
  if (name.includes('.test.') || name.includes('.spec.')) return 'check';
  if (name.endsWith('.rs') || name.endsWith('.go') || name.endsWith('.py') || /\.(t|j)sx?$/.test(name)) return 'code';
  return 'file';
}

function filterNodes(nodes: FileNode[], query: string): FileNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  return nodes.flatMap((node) => {
    if (node.type === 'file') return node.path.toLowerCase().includes(needle) ? [node] : [];
    const children = filterNodes(node.children ?? [], needle);
    return children.length ? [{ ...node, children }] : [];
  });
}

interface NodeProps extends Omit<FileTreeProps, 'nodes'> {
  node: FileNode;
  depth: number;
  renaming: string | null;
  setRenaming: (path: string | null) => void;
}

function TreeNode({
  node,
  depth,
  activePath,
  selected,
  onOpen,
  onToggleSelect,
  onRename,
  onDelete,
  renaming,
  setRenaming,
}: NodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const [draft, setDraft] = useState(node.name);
  const isDir = node.type === 'dir';
  const isActive = activePath === node.path;
  const isSelected = selected.includes(node.path);
  const isRenaming = renaming === node.path;

  const commit = () => {
    const next = draft.trim();
    if (next && next !== node.name) onRename(node.path, next);
    setRenaming(null);
  };

  return (
    <div className="ui-tree-node">
      <div
        className={`ui-tree-row${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 13 }}
        title={node.path}
        onClick={() => (isDir ? setOpen((value) => !value) : onOpen(node.path))}
        onDoubleClick={(event) => { event.stopPropagation(); setDraft(node.name); setRenaming(node.path); }}
      >
        {isDir ? (
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} className="ui-tree-caret" />
        ) : (
          <button
            type="button"
            className={`ui-check${isSelected ? ' checked' : ''}`}
            title="Include in agent context"
            aria-label={`Toggle context for ${node.path}`}
            onClick={(event) => { event.stopPropagation(); onToggleSelect(node.path); }}
          >
            {isSelected && <Icon name="check" size={10} />}
          </button>
        )}
        <Icon name={iconFor(node, open)} size={14} className={isDir ? 'folder-icon' : 'file-icon'} />
        {isRenaming ? (
          <input
            className="ui-tree-rename"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={commit}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <span className="ui-tree-name">{node.name}</span>
        )}
        {!isRenaming && !isDir && (
          <span className="ui-tree-actions">
            <button type="button" title="Rename" aria-label={`Rename ${node.path}`} onClick={(event) => { event.stopPropagation(); setDraft(node.name); setRenaming(node.path); }}>
              <Icon name="edit" size={11} />
            </button>
            <button type="button" title="Delete" aria-label={`Delete ${node.path}`} onClick={(event) => { event.stopPropagation(); onDelete(node.path); }}>
              <Icon name="trash" size={11} />
            </button>
          </span>
        )}
      </div>
      {isDir && open && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          {...{
            node: child,
            depth: depth + 1,
            activePath,
            selected,
            onOpen,
            onToggleSelect,
            onRename,
            onDelete,
            renaming,
            setRenaming,
          }}
        />
      ))}
    </div>
  );
}

export default function FileTree({ nodes, activePath, selected, onOpen, onToggleSelect, onRename, onDelete }: FileTreeProps) {
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const visible = useMemo(() => filterNodes(nodes, filter), [nodes, filter]);

  return (
    <div className="ui-file-tree">
      <div className="ui-input-wrap compact">
        <Icon name="filter" size={13} />
        <input className="ui-input" value={filter} placeholder="Filter files…" onChange={(event) => setFilter(event.target.value)} />
        {filter && <button type="button" className="ui-icon-button" onClick={() => setFilter('')}><Icon name="close" size={12} /></button>}
      </div>
      <div className="ui-tree-scroll">
        {visible.length === 0 && <div className="ui-empty small">{nodes.length ? 'No files match the filter.' : 'No files in the workspace yet.'}</div>}
        {visible.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            selected={selected}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
            onRename={onRename}
            onDelete={onDelete}
            renaming={renaming}
            setRenaming={setRenaming}
          />
        ))}
      </div>
    </div>
  );
}
