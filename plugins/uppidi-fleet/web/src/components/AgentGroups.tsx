import type { FleetAgentsSnapshot } from "../types.js";

interface AgentGroupsProps {
  snapshot: FleetAgentsSnapshot | null;
}

function AgentRow({ agent }: { agent: FleetAgentsSnapshot["workers"][number] }) {
  return (
    <li className="agent-row">
      <span className={`state state-${agent.deterministicState.replace(/[:/]/g, "-")}`}>
        {agent.deterministicState}
      </span>
      <strong>{agent.name}</strong>
      <span className="muted small">{agent.id}</span>
      {agent.model ? <span className="muted small">{agent.model}</span> : null}
      {agent.branch ? <span className="muted small">{agent.branch}</span> : null}
      {agent.requiresAttention ? <span className="pill pill-reconnecting">attention</span> : null}
    </li>
  );
}

export function AgentGroups({ snapshot }: AgentGroupsProps) {
  if (!snapshot) {
    return (
      <section aria-label="Running agents">
        <h2>Running agents</h2>
        <p className="muted">Connect to a daemon to load workers, orchestrators, and frontdesk agents.</p>
      </section>
    );
  }
  const groups: Array<{ title: string; agents: FleetAgentsSnapshot["workers"] }> = [
    { title: `Frontdesk (${snapshot.frontdesk.length})`, agents: snapshot.frontdesk },
    { title: `Orchestrators (${snapshot.orchestrators.length})`, agents: snapshot.orchestrators },
    { title: `Workers (${snapshot.workers.length})`, agents: snapshot.workers },
  ];
  return (
    <section aria-label="Running agents">
      <h2>Running agents</h2>
      {groups.map((group) => (
        <div key={group.title}>
          <h3>{group.title}</h3>
          {group.agents.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ul className="agent-list">
              {group.agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
