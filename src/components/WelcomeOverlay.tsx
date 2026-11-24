import { useEffect, useState } from 'react';
import { api, type Health, type ModelProvider } from '../lib/api';
import { Icon } from './Icon';

interface WelcomeOverlayProps {
  health: Health | null;
  onDone: () => void;
  onWorkspaceChanged: (root: string) => void | Promise<void>;
}

type Step = 'workspace' | 'welcome' | 'provider' | 'done';

export default function WelcomeOverlay({ health, onDone, onWorkspaceChanged }: WelcomeOverlayProps) {
  const [step, setStep] = useState<Step>('workspace');
  const [workspace, setWorkspace] = useState(health?.config.workspaceRoot ?? '');
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [provider, setProvider] = useState<ModelProvider>('lmstudio');
  const [lmStudioUrl, setLmStudioUrl] = useState('http://127.0.0.1:1234/v1');
  const [externalUrl, setExternalUrl] = useState('https://api.openai.com/v1');
  const [externalModel, setExternalModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (health?.config.workspaceRoot) setWorkspace(health.config.workspaceRoot);
  }, [health]);

  const chooseWorkspace = async () => {
    setWorkspaceBusy(true);
    setError(null);
    try {
      const result = await api.setWorkspace(workspace.trim());
      setWorkspace(result.root);
      await onWorkspaceChanged(result.root);
      setStep('welcome');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateConfig({
        provider,
        ...(provider === 'lmstudio'
          ? { lmStudioBaseUrl: lmStudioUrl.trim() }
          : {
              externalBaseUrl: externalUrl.trim(),
              externalModel: externalModel.trim(),
              ...(apiKey.trim() ? { externalApiKey: apiKey.trim() } : {}),
            }),
      });
      setStep('done');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-overlay welcome-overlay">
      <div className="ui-welcome-card">
        <div className="ui-welcome-brand">
          <span className="ui-welcome-mark"><Icon name="logo" size={26} strokeWidth={1.3} /></span>
          <div>
            <h1>Anneal</h1>
            <span className="ui-muted">Local-first agentic IDE</span>
          </div>
          <div className="ui-welcome-steps">
            <span className={step === 'workspace' ? 'active' : ''} />
            <span className={step === 'welcome' ? 'active' : ''} />
            <span className={step === 'provider' ? 'active' : ''} />
            <span className={step === 'done' ? 'active' : ''} />
          </div>
        </div>

        {step === 'workspace' && (
          <>
            <h2 className="ui-welcome-h2">Choose a project folder</h2>
            <p className="ui-muted small">
              Anneal works inside one folder at a time. The agent can only read, write and search here.
            </p>
            <div className="ui-form">
              <label htmlFor="w-workspace">Workspace folder</label>
              <input
                id="w-workspace"
                className="ui-input"
                value={workspace}
                placeholder="/absolute/path/to/project"
                onChange={(event) => setWorkspace(event.target.value)}
              />
              <div className="ui-hint">
                Use an absolute path, for example <code>~/Projects/my-app</code>. You can change this later in Settings.
              </div>
            </div>
            {error && <div className="ui-inline-error"><Icon name="warning" size={12} /> {error}</div>}
            <div className="ui-welcome-footer">
              <span className="ui-muted small">Your choice is remembered on this Mac.</span>
              <button
                type="button"
                className="ui-btn primary"
                disabled={workspaceBusy || !workspace.trim()}
                onClick={() => void chooseWorkspace()}
              >
                {workspaceBusy ? 'Opening…' : 'Use this folder'} <Icon name="arrowRight" size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'welcome' && (
          <>
            <p className="ui-welcome-lead">
              Specify what you want, then let the agent build it. Everything runs against your own model — no cloud, no telemetry.
            </p>
            <div className="ui-feature-grid">
              {[
                { icon: 'specs' as const, title: 'Spec-driven', text: 'Requirements → design → tasks, with traceability.' },
                { icon: 'zap' as const, title: 'Agentic', text: 'Reads, patches, runs commands and self-heals.' },
                { icon: 'undo' as const, title: 'Reversible', text: 'A checkpoint before every write, always restorable.' },
                { icon: 'history' as const, title: 'Resumable', text: 'Journaled steps survive crashes and interruptions.' },
                { icon: 'search' as const, title: 'Fast navigation', text: 'Quick open, workspace search and code intelligence.' },
                { icon: 'debug' as const, title: 'Full toolkit', text: 'Debugger, terminal, MCP tools and steering rules.' },
              ].map((feature) => (
                <div key={feature.title} className="ui-feature">
                  <Icon name={feature.icon} size={17} />
                  <strong>{feature.title}</strong>
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>
            <div className="ui-welcome-footer">
              <span className="ui-muted small">Works with LM Studio or any OpenAI-compatible API.</span>
              <button type="button" className="ui-btn primary" onClick={() => setStep('provider')}>
                Get started <Icon name="arrowRight" size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'provider' && (
          <>
            <h2 className="ui-welcome-h2">Connect a model</h2>
            <p className="ui-muted small">You can change this any time in Models or Settings.</p>
            <div className="ui-provider-grid">
              <button
                type="button"
                className={`ui-provider-card${provider === 'lmstudio' ? ' selected' : ''}`}
                onClick={() => setProvider('lmstudio')}
              >
                <Icon name="cpu" size={20} />
                <strong>LM Studio</strong>
                <span>Local model, full privacy</span>
                <small>Requires LM Studio running on this machine</small>
              </button>
              <button
                type="button"
                className={`ui-provider-card${provider === 'external' ? ' selected' : ''}`}
                onClick={() => setProvider('external')}
              >
                <Icon name="link" size={20} />
                <strong>OpenAI-compatible API</strong>
                <span>OpenAI, Groq, Ollama, Anthropic…</span>
                <small>Any endpoint that speaks the chat format</small>
              </button>
            </div>

            <div className="ui-form">
              {provider === 'lmstudio' ? (
                <>
                  <label htmlFor="w-lm-url">LM Studio base URL</label>
                  <input id="w-lm-url" className="ui-input" value={lmStudioUrl} onChange={(event) => setLmStudioUrl(event.target.value)} />
                  <div className="ui-hint">Start LM Studio, load a model, then click ▶ to start the local server.</div>
                </>
              ) : (
                <>
                  <label htmlFor="w-ext-url">Base URL</label>
                  <input id="w-ext-url" className="ui-input" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} />
                  <label htmlFor="w-ext-model">Model</label>
                  <input id="w-ext-model" className="ui-input" value={externalModel} onChange={(event) => setExternalModel(event.target.value)} />
                  <label htmlFor="w-ext-key">API key</label>
                  <input id="w-ext-key" className="ui-input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" />
                  <div className="ui-hint">Stored in <code>.anneal/config.json</code> on this machine only.</div>
                </>
              )}
            </div>

            {error && <div className="ui-inline-error"><Icon name="warning" size={12} /> {error}</div>}
            <div className="ui-welcome-footer">
              <button type="button" className="ui-btn ghost" onClick={() => setStep('welcome')}>Back</button>
              <button type="button" className="ui-btn primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save & continue'} <Icon name="arrowRight" size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="ui-done-mark"><Icon name="check" size={30} /></div>
            <h2 className="ui-welcome-h2">You're ready</h2>
            <p className="ui-muted small">
              {provider === 'lmstudio'
                ? 'Make sure LM Studio is running with a model loaded. The status indicator shows the connection.'
                : 'Your key is stored only in .anneal/config.json on this machine.'}
            </p>
            <div className="ui-tip-list">
              <div><kbd className="ui-kbd">⌘P</kbd><span>Open any file instantly</span></div>
              <div><kbd className="ui-kbd">⌘⇧P</kbd><span>Run any IDE command</span></div>
              <div><kbd className="ui-kbd">⌘K</kbd><span>Inline edit selected code</span></div>
              <div><kbd className="ui-kbd">⌘↵</kbd><span>Run the current agent goal</span></div>
            </div>
            <div className="ui-welcome-footer">
              <span />
              <button type="button" className="ui-btn primary" onClick={onDone}>Open IDE <Icon name="arrowRight" size={14} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
