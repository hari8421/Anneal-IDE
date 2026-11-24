import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface McpStatus {
  servers: string[];
  tools: string[];
}

interface ConnectResult {
  server: string;
  ok: boolean;
  tools?: number;
  error?: string;
}

export function McpTab() {
  const [status, setStatus] = useState<McpStatus>({ servers: [], tools: [] });
  const [results, setResults] = useState<ConnectResult[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.mcp();
      setStatus(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api.connectMcp();
      setResults(data.servers as ConnectResult[]);
      await refresh();
      const ok = (data.servers as ConnectResult[]).filter((s) => s.ok).length;
      const fail = (data.servers as ConnectResult[]).filter((s) => !s.ok).length;
      setNotice(
        ok === 0 && fail === 0
          ? 'No MCP servers configured in .anneal/mcp.json'
          : `Connected ${ok} server(s)${fail ? `, ${fail} failed` : ''}.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="panel-body">
      <div className="hint">
        MCP servers are configured in <code>.anneal/mcp.json</code>. Connected tools are available to the agent as{' '}
        <code>mcp__&lt;server&gt;__&lt;tool&gt;</code>.
      </div>

      <div className="row">
        <button className="btn primary small" onClick={() => void connect()} disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect servers'}
        </button>
        <button className="btn ghost small" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {notice && <div className="notice">{notice}</div>}

      {status.servers.length > 0 && (
        <div>
          <div className="list-title">Connected servers</div>
          <div className="list">
            {status.servers.map((server) => {
              const serverTools = status.tools.filter((t) => t.startsWith(`mcp__${server}__`));
              return (
                <div key={server} className="list-item">
                  <div className="list-title">
                    <span className="status-dot ok" style={{ display: 'inline-block', marginRight: 6 }} />
                    {server}
                  </div>
                  <div className="list-meta">{serverTools.length} tool(s)</div>
                  {serverTools.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {serverTools.map((tool) => (
                        <code key={tool} className="pill" style={{ fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>
                          {tool.replace(`mcp__${server}__`, '')}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {status.servers.length === 0 && !connecting && (
        <div className="empty">No servers connected. Add entries to <code>.anneal/mcp.json</code> then click Connect.</div>
      )}

      {results.length > 0 && (
        <div>
          <div className="list-title">Last connection attempt</div>
          <div className="list">
            {results.map((result) => (
              <div key={result.server} className={`list-item${result.ok ? '' : ' error-item'}`}>
                <div className="list-title">
                  <span
                    className={`status-dot ${result.ok ? 'ok' : 'bad'}`}
                    style={{ display: 'inline-block', marginRight: 6 }}
                  />
                  {result.server}
                </div>
                {result.ok ? (
                  <div className="list-meta">{result.tools ?? 0} tools registered</div>
                ) : (
                  <div className="list-meta error">{result.error ?? 'failed'}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="list-title">MCP config template</div>
      <pre className="doc-body" style={{ maxHeight: 180 }}>{MCP_TEMPLATE}</pre>

      {error && <div className="notice error">{error}</div>}
    </div>
  );
}

const MCP_TEMPLATE = `// .anneal/mcp.json
{
  "servers": [
    {
      "name": "my-server",
      "command": "uvx",
      "args": ["my-mcp-server@latest"],
      "env": {}
    }
  ]
}`;
