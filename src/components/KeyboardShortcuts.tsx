import { useEffect } from 'react';
import { Icon } from './Icon';

interface KeyboardShortcutsProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { section: 'Workspace' },
  { key: 'Ctrl/Cmd + P', desc: 'Quick open — fuzzy search any file' },
  { key: 'Ctrl/Cmd + Shift + P', desc: 'Command palette — run any IDE command' },
  { key: 'Ctrl/Cmd + B', desc: 'Toggle the sidebar' },
  { key: 'Ctrl/Cmd + `', desc: 'Toggle terminal / debug panel' },
  { key: 'Ctrl/Cmd + Shift + L', desc: 'Toggle the agent chat' },
  { key: '?', desc: 'Show this shortcuts overlay' },
  { key: 'Escape', desc: 'Close an overlay or cancel' },

  { section: 'Editor' },
  { key: 'Ctrl/Cmd + S', desc: 'Save active file' },
  { key: 'Ctrl/Cmd + K', desc: 'Inline edit — AI edit of selected code' },
  { key: 'F9', desc: 'Toggle breakpoint at cursor line' },
  { key: 'F12', desc: 'Go to definition' },
  { key: 'Alt + F12', desc: 'Peek definition' },
  { key: 'Shift + F12', desc: 'Find all references' },
  { key: 'Ctrl/Cmd + Space', desc: 'Trigger autocomplete' },
  { key: 'Ctrl/Cmd + /', desc: 'Toggle line comment' },

  { section: 'Agent' },
  { key: 'Ctrl/Cmd + Enter', desc: 'Run the goal in the chat composer' },
  { key: 'Enter', desc: 'Send message (Shift + Enter adds a newline)' },
  { key: '@', desc: 'Attach a workspace file in the composer' },
  { key: 'Escape', desc: 'Stop a running agent' },

  { section: 'Debugger' },
  { key: 'F5', desc: 'Continue / start debugging' },
  { key: 'F10', desc: 'Step over' },
  { key: 'F11', desc: 'Step into' },
  { key: 'Shift + F11', desc: 'Step out' },
];

export default function KeyboardShortcuts({ onClose }: KeyboardShortcutsProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === '?') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ui-overlay" onMouseDown={onClose}>
      <div className="ui-shortcuts" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()}>
        <div className="ui-modal-head">
          <span><Icon name="keyboard" size={16} /> Keyboard shortcuts</span>
          <button type="button" className="ui-icon-button" aria-label="Close" onClick={onClose}><Icon name="close" size={15} /></button>
        </div>
        <div className="ui-shortcuts-body">
          {SHORTCUTS.map((item, index) =>
            'section' in item ? (
              <div key={index} className="ui-section-label">{item.section}</div>
            ) : (
              <div key={index} className="ui-shortcut-row">
                <kbd className="ui-kbd wide">{item.key}</kbd>
                <span>{item.desc}</span>
              </div>
            ),
          )}
        </div>
        <div className="ui-modal-foot">Press <kbd className="ui-kbd">?</kbd> or <kbd className="ui-kbd">Esc</kbd> to close</div>
      </div>
    </div>
  );
}
