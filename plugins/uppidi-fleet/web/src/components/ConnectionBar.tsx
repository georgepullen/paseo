import { useState } from "react";
import { DEFAULT_DAEMON_HOST } from "../config.js";
import type { ConnectionStatus } from "../daemon/connection.js";

interface ConnectionBarProps {
  status: ConnectionStatus;
  host: string;
  wsUrl: string;
  onConnect: (host: string) => void;
  onDisconnect: () => void;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  failed: "Unavailable",
};

export function ConnectionBar({ status, host, wsUrl, onConnect, onDisconnect }: ConnectionBarProps) {
  const [draft, setDraft] = useState(host);
  const connected = status === "connected";
  return (
    <header className="connbar">
      <div className="connbar-brand">
        <span className={`dot dot-${status}`} aria-hidden="true" />
        <strong>Uppidi Fleet</strong>
        <span className="muted">standalone dashboard</span>
        <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="connbar-controls">
        <label className="muted" htmlFor="daemon-host">
          Daemon
        </label>
        <input
          id="daemon-host"
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={DEFAULT_DAEMON_HOST}
          spellCheck={false}
          autoComplete="off"
        />
        {connected ? (
          <button type="button" className="btn" onClick={onDisconnect}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onConnect(draft.trim() || host)}>
            Connect
          </button>
        )}
      </div>
      <div className="muted small">{wsUrl}</div>
    </header>
  );
}
