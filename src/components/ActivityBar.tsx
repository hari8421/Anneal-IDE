import { Icon, type IconName } from './Icon';

export type ActivityKey =
  | 'files' | 'search' | 'specs' | 'steering' | 'hooks' | 'runs' | 'checkpoints'
  | 'models' | 'mcp' | 'debug' | 'settings';

const MAIN: Array<{ key: ActivityKey; icon: IconName; label: string }> = [
  { key: 'files', icon: 'files', label: 'Explorer' },
  { key: 'search', icon: 'search', label: 'Search' },
  { key: 'specs', icon: 'specs', label: 'Specs' },
  { key: 'steering', icon: 'steering', label: 'Steering rules' },
  { key: 'hooks', icon: 'hooks', label: 'Hooks' },
  { key: 'runs', icon: 'runs', label: 'Agent runs' },
  { key: 'checkpoints', icon: 'undo', label: 'Checkpoints' },
  { key: 'models', icon: 'models', label: 'Models & memory' },
  { key: 'mcp', icon: 'mcp', label: 'MCP servers' },
  { key: 'debug', icon: 'debug', label: 'Debugger' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

interface ActivityBarProps {
  active: ActivityKey;
  onSelect: (key: ActivityKey) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  bottomOpen: boolean;
  onToggleBottom: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  onOpenPalette: () => void;
}

export default function ActivityBar({
  active,
  onSelect,
  sidebarOpen,
  onToggleSidebar,
  bottomOpen,
  onToggleBottom,
  chatOpen,
  onToggleChat,
  onOpenPalette,
}: ActivityBarProps) {
  const item = (key: ActivityKey, icon: IconName, label: string) => (
    <button
      key={key}
      type="button"
      className={`ui-activity-item${active === key && sidebarOpen ? ' active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active === key && sidebarOpen}
      onClick={() => {
        if (active === key && sidebarOpen) onToggleSidebar();
        else {
          onSelect(key);
          if (!sidebarOpen) onToggleSidebar();
        }
      }}
    >
      <Icon name={icon} size={20} />
    </button>
  );

  return (
    <nav className="ui-activity-bar" aria-label="Activity bar">
      <div className="ui-activity-brand" title="Anneal — local-first agentic IDE">
        <Icon name="logo" size={22} strokeWidth={1.5} />
      </div>
      <div className="ui-activity-group">
        {MAIN.map((entry) => item(entry.key, entry.icon, entry.label))}
      </div>
      <div className="ui-activity-spacer" />
      <div className="ui-activity-group">
        <button
          type="button"
          className={`ui-activity-item${chatOpen ? ' active' : ''}`}
          title="Toggle agent chat"
          aria-label="Toggle agent chat"
          onClick={onToggleChat}
        >
          <Icon name="chat" size={20} />
        </button>
        <button
          type="button"
          className={`ui-activity-item${bottomOpen ? ' active' : ''}`}
          title="Toggle terminal / debug panel"
          aria-label="Toggle terminal panel"
          onClick={onToggleBottom}
        >
          <Icon name="terminal" size={20} />
        </button>
        <button type="button" className="ui-activity-item" title="Command palette (Ctrl/Cmd+Shift+P)" aria-label="Command palette" onClick={onOpenPalette}>
          <Icon name="command" size={20} />
        </button>
      </div>
    </nav>
  );
}
