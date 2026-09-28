import { summarizeFleetHealth, type FleetAgent } from "../types.js";

interface FleetHealthProps {
  agents: FleetAgent[];
}

export function FleetHealth({ agents }: FleetHealthProps) {
  const health = summarizeFleetHealth(agents);
  const cards: Array<{ label: string; value: number; tone: string }> = [
    { label: "Total agents", value: health.total, tone: "" },
    { label: "Running", value: health.running, tone: "tone-ok" },
    { label: "Idle", value: health.idle, tone: "tone-idle" },
    { label: "Errored", value: health.errored, tone: "tone-bad" },
    { label: "Needs attention", value: health.attention, tone: "tone-warn" },
  ];
  return (
    <section aria-label="Fleet health">
      <h2>Fleet health</h2>
      <div className="grid">
        {cards.map((card) => (
          <div key={card.label} className={`card ${card.tone}`}>
            <div className="card-value">{card.value}</div>
            <div className="card-label">{card.label}</div>
          </div>
        ))}
        <div className="card">
          <div className="card-value">
            {health.byCategory.frontdesk}/{health.byCategory.orchestrator}/{health.byCategory.worker}
          </div>
          <div className="card-label">Frontdesk / Orchestrators / Workers</div>
        </div>
      </div>
    </section>
  );
}
