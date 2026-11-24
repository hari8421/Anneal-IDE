import { useEffect } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icon';

interface ApprovalDialogProps {
  runId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  onResolved: () => void;
}

export default function ApprovalDialog({ runId, toolName, toolArgs, onResolved }: ApprovalDialogProps) {
  const resolve = async (approved: boolean) => {
    try {
      await api.approveToolCall(runId, approved);
    } catch {
      // best effort — the timeout will auto-reject if this fails
    }
    onResolved();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') void resolve(true);
      if (e.key === 'Escape') void resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ui-overlay welcome-overlay" style={{ zIndex: 100 }}>
      <div className="ui-welcome-card" style={{ maxWidth: 480 }}>
        <div className="ui-approval">
          <div className="ui-approval-head">
            <Icon name="shield" size={17} />
            <span>Approve tool call?</span>
            <span className="ui-pill" style={{ marginLeft: 'auto' }}>supervised</span>
          </div>
          <div className="ui-approval-body">
            The agent is waiting for permission to run <code>{toolName}</code>. Review the arguments before continuing.
          </div>
          <pre className="ui-approval-args">{JSON.stringify(toolArgs, null, 2)}</pre>
          <div className="ui-hint">
            Press <kbd className="ui-kbd">Enter</kbd> to approve, <kbd className="ui-kbd">Escape</kbd> to reject.
          </div>
          <div className="ui-approval-actions">
            <button type="button" className="ui-btn danger" onClick={() => void resolve(false)}>Reject</button>
            <button type="button" className="ui-btn primary" onClick={() => void resolve(true)}>Approve</button>
          </div>
        </div>
      </div>
    </div>
  );
}
