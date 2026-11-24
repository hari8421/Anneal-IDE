import type { ComponentProps } from 'react';
import DebugPanel from './DebugPanel';
import TerminalPanel from './TerminalPanel';
import { Icon, type IconName } from './Icon';
import type { SessionState } from '../lib/session';

export type BottomTab = 'terminal' | 'output' | 'debug';

const TABS: Array<{ key: BottomTab; label: string; icon: IconName }> = [
  { key: 'terminal', label: 'Terminal', icon: 'terminal' },
  { key: 'output', label: 'Agent log', icon: 'output' },
  { key: 'debug', label: 'Debug', icon: 'debug' },
];

interface BottomPanelProps {
  tab: BottomTab;
  onTab: (tab: BottomTab) => void;
  onClose: () => void;
  terminalEnabled: boolean;
  onEnableTerminal: () => void;
  session: SessionState;
  debugProps: ComponentProps<typeof DebugPanel>;
}

export default function BottomPanel({
  tab,
  onTab,
  onClose,
  terminalEnabled,
  onEnableTerminal,
  session,
  debugProps,
}: BottomPanelProps) {
  return (
    <section className="ui-bottom-panel">
      <div className="ui-bottom-tabs">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`ui-bottom-tab${tab === entry.key ? ' active' : ''}`}
            onClick={() => onTab(entry.key)}
          >
            <Icon name={entry.icon} size={13} /> {entry.label}
          </button>
        ))}
        {session.streaming && <span className="ui-bottom-live"><Icon name="loader" size={12} className="spin" /> agent running</span>}
        <span className="ui-grow" />
        <button type="button" className="ui-icon-button" title="Close panel" aria-label="Close panel" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="ui-bottom-body">
        {tab === 'terminal' && <TerminalPanel enabled={terminalEnabled} onEnable={onEnableTerminal} />}
        {tab === 'output' && (
          <div className="ui-agent-log">
            {session.entries.length === 0 && <div className="ui-empty">Agent events from the current conversation appear here.</div>}
            {session.entries.map((entry) => (
              <div key={entry.id} className={`ui-log-row ${entry.kind} ${entry.status ?? ''}`}>
                <span className="ui-log-kind">{entry.name ?? entry.kind}</span>
                <span className="ui-log-text">{entry.text || entry.args || ''}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'debug' && <DebugPanel {...debugProps} />}
      </div>
    </section>
  );
}
