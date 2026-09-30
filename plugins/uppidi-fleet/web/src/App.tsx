import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveDaemonHost, resolveDaemonToken } from "./config.js";
import { DaemonConnection, type ConnectionStatus, type FleetTeardownTarget } from "./daemon/connection.js";
import { flattenAgents, type CandidateIssue, type FleetAgentsSnapshot } from "./types.js";
import { ConnectionBar } from "./components/ConnectionBar.js";
import { FleetHealth } from "./components/FleetHealth.js";
import { AgentGroups } from "./components/AgentGroups.js";
import { CandidateIssues } from "./components/CandidateIssues.js";
import { TeardownModal } from "./components/TeardownModal.js";

export function App() {
  const [host, setHost] = useState(resolveDaemonHost());
  const [token, setToken] = useState(resolveDaemonToken() ?? "");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [snapshot, setSnapshot] = useState<FleetAgentsSnapshot | null>(null);
  const [candidates, setCandidates] = useState<CandidateIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [teardownOpen, setTeardownOpen] = useState(false);
  const [teardownBusy, setTeardownBusy] = useState(false);
  const [teardownResult, setTeardownResult] = useState<string | null>(null);
  const connectionRef = useRef<DaemonConnection | null>(null);

  const connection = useMemo(() => {
    const next = new DaemonConnection({
      host,
      token: token || undefined,
      onStatus: (nextStatus) => setStatus(nextStatus),
      onError: (message) => setError(message),
      onEvent: () => {
        void refresh();
      },
    });
    connectionRef.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => void connectionRef.current?.disconnect(), []);

  const refresh = useCallback(async () => {
    const active = connectionRef.current;
    if (!active || active.getStatus() !== "connected") return;
    try {
      const [agents, issues] = await Promise.all([active.fetchAgents(), active.fetchCandidates()]);
      setSnapshot(agents);
      setCandidates(issues);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (status !== "connected") return;
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  const handleConnect = useCallback(
    async (nextHost: string, nextToken: string) => {
      const active = connectionRef.current;
      if (!active) return;
      setError(null);
      setHost(nextHost);
      setToken(nextToken);
      try {
        await active.connect(nextHost, nextToken);
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [refresh],
  );

  const handleDisconnect = useCallback(() => {
    void connectionRef.current?.disconnect();
    setSnapshot(null);
    setCandidates([]);
  }, []);

  const handleTeardown = useCallback(async (targets: FleetTeardownTarget[]) => {
    const active = connectionRef.current;
    if (!active) return;
    setTeardownBusy(true);
    setTeardownResult(null);
    try {
      const result = await active.teardownFleet(targets);
      const torn = result.tornDown;
      setTeardownResult(
        result.ok
          ? `Archived workers=${torn.workers} orchestrators=${torn.orchestrators} frontdesk=${torn.frontdesk}. ${result.message ?? ""}`.trim()
          : (result.error ?? result.errors.join("; ") ?? "Teardown failed."),
      );
      await refresh();
    } catch (cause) {
      setTeardownResult(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTeardownBusy(false);
    }
  }, [refresh]);

  const agents = useMemo(() => flattenAgents(snapshot), [snapshot]);

  return (
    <div className="page">
      <ConnectionBar
        status={status}
        host={host}
        token={token}
        wsUrl={connection.getWsUrl()}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <main>
        <div className="toolbar">
          <button
            type="button"
            className="btn"
            onClick={() => void refresh()}
            disabled={status !== "connected"}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setTeardownResult(null);
              setTeardownOpen(true);
            }}
            disabled={status !== "connected"}
          >
            Teardown fleet…
          </button>
        </div>
        <FleetHealth agents={agents} />
        <AgentGroups snapshot={snapshot} />
        <CandidateIssues issues={candidates} />
      </main>
      <TeardownModal
        open={teardownOpen}
        busy={teardownBusy}
        result={teardownResult}
        onClose={() => setTeardownOpen(false)}
        onConfirm={handleTeardown}
      />
    </div>
  );
}
