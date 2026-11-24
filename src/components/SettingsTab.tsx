import { useEffect, useState } from 'react';
import { api, type Health } from '../lib/api';

interface SettingsTabProps {
  health: Health | null;
  onSaved: () => void | Promise<void>;
  onWorkspaceChanged: (root: string) => void | Promise<void>;
}

export function SettingsTab({ health, onSaved, onWorkspaceChanged }: SettingsTabProps) {
  const [contextBudget, setContextBudget] = useState(health?.config.contextBudgetTokens ?? 8192);
  const [maxSteps, setMaxSteps] = useState(health?.config.maxSteps ?? 24);
  const [allowCommands, setAllowCommands] = useState(health?.config.allowCommands ?? true);
  const [selfHeal, setSelfHeal] = useState(health?.config.selfHeal ?? true);
  const [workspaceRoot, setWorkspaceRoot] = useState(health?.config.workspaceRoot ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);

  useEffect(() => {
    if (!health) return;
    setContextBudget(health.config.contextBudgetTokens);
    setMaxSteps(health.config.maxSteps);
    setAllowCommands(health.config.allowCommands);
    setSelfHeal(health.config.selfHeal);
    setWorkspaceRoot(health.config.workspaceRoot);
  }, [health]);

  const switchWorkspace = async () => {
    setSwitchingWorkspace(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.setWorkspace(workspaceRoot.trim());
      setWorkspaceRoot(result.root);
      setNotice(`Workspace switched to ${result.root}`);
      await onWorkspaceChanged(result.root);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSwitchingWorkspace(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.updateConfig({
        contextBudgetTokens: contextBudget,
        maxAgentSteps: maxSteps,
        allowCommands,
        selfHeal,
      });
      setNotice('Settings saved.');
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-body">
      <div className="list-title">Workspace</div>
      <div className="hint tiny">
        Anneal only reads, writes and searches inside this folder. Switching folders stops active runs and loads that project's specs, runs and settings.
      </div>
      <div className="field">
        <input
          className="input"
          aria-label="Workspace folder"
          placeholder="/absolute/path/to/project"
          value={workspaceRoot}
          onChange={(event) => setWorkspaceRoot(event.target.value)}
        />
        <button
          className="btn small"
          onClick={() => void switchWorkspace()}
          disabled={switchingWorkspace || !workspaceRoot.trim()}
        >
          {switchingWorkspace ? 'Switching…' : 'Switch folder'}
        </button>
      </div>
      <div className="hint tiny">The choice is remembered on this Mac and reused on the next launch.</div>

      <div className="list-title" style={{ marginTop: 8 }}>Agent settings</div>

      <label className="muted tiny" htmlFor="ctx-budget">
        Context budget (tokens) — how much of the model's context window to use
      </label>
      <div className="field">
        <input
          id="ctx-budget"
          className="input"
          type="number"
          min={1024}
          max={131072}
          step={1024}
          value={contextBudget}
          onChange={(e) => setContextBudget(Number(e.target.value))}
        />
        <span className="muted small">{Math.round(contextBudget / 1000)}k</span>
      </div>

      <label className="muted tiny" htmlFor="max-steps">
        Max agent steps per run — the loop pauses and can be resumed when exhausted
      </label>
      <div className="field">
        <input
          id="max-steps"
          className="input"
          type="number"
          min={1}
          max={200}
          step={1}
          value={maxSteps}
          onChange={(e) => setMaxSteps(Number(e.target.value))}
        />
        <span className="muted small">steps</span>
      </div>

      <label className="muted tiny" htmlFor="self-heal">
        Self-healing — retry transport errors, shrink over-long prompts and repair failed tools
      </label>
      <div className="field" style={{ gap: 10 }}>
        <input
          id="self-heal"
          type="checkbox"
          checked={selfHeal}
          onChange={(e) => setSelfHeal(e.target.checked)}
          style={{ width: 'auto', flex: 'none' }}
        />
        <span className="muted small">
          {selfHeal ? 'Enabled — recoverable failures are retried automatically' : 'Disabled — a failed step stops immediately'}
        </span>
      </div>
      <div className="hint tiny">
        You can also toggle this in the chat composer, or use “Self heal” on a paused run to resume with a repair directive.
      </div>

      <label className="muted tiny" htmlFor="allow-cmds">
        Allow the agent to run shell commands
      </label>
      <div className="field" style={{ gap: 10 }}>
        <input
          id="allow-cmds"
          type="checkbox"
          checked={allowCommands}
          onChange={(e) => setAllowCommands(e.target.checked)}
          style={{ width: 'auto', flex: 'none' }}
        />
        <span className="muted small">
          {allowCommands ? 'Commands enabled — agent can run build/test/lint tools' : 'Commands disabled — read and write only'}
        </span>
      </div>

      <div className="hint tiny">
        Destructive shell patterns (rm -rf /, sudo, git push, curl|sh) are always blocked
        regardless of this setting.
      </div>

      <div className="row">
        <button className="btn primary small" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice error">{error}</div>}

      <div className="list-title" style={{ marginTop: 8 }}>About</div>
      <div className="hint tiny">
        <strong>Anneal</strong> — local-first agentic IDE · v0.1.0
        <br />
        Workspace: <code>{health?.config.workspaceRoot ?? '—'}</code>
        <br />
        Provider: <code>{health?.config.provider ?? '—'}</code> · Model: <code>{health?.config.model ?? '—'}</code>
        <br />
        Runs: {health?.runs ?? 0} · Hooks: {health?.hooks ?? 0} · MCP tools: {health?.mcp.tools ?? 0}
      </div>
    </div>
  );
}
