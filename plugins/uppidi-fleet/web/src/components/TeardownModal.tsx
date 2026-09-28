import { useState } from "react";
import type { FleetTeardownTarget } from "../daemon/connection.js";

interface TeardownModalProps {
  open: boolean;
  busy: boolean;
  result: string | null;
  onClose: () => void;
  onConfirm: (targets: FleetTeardownTarget[]) => void;
}

const TARGETS: Array<{ value: FleetTeardownTarget; label: string }> = [
  { value: "workers", label: "Workers" },
  { value: "orchestrators", label: "Orchestrators" },
  { value: "frontdesk", label: "Frontdesk" },
];

export function TeardownModal({ open, busy, result, onClose, onConfirm }: TeardownModalProps) {
  const [targets, setTargets] = useState<FleetTeardownTarget[]>(["workers"]);
  const [armed, setArmed] = useState(false);
  if (!open) return null;

  const toggle = (target: FleetTeardownTarget) => {
    setTargets((prev) => (prev.includes(target) ? prev.filter((entry) => entry !== target) : [...prev, target]));
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teardown-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="teardown-title">Teardown fleet</h2>
        <p className="muted">
          Archives fleet agents by category via <code>uppidi-fleet.fleet-teardown</code>. This is destructive and
          cannot be undone from here.
        </p>
        <fieldset>
          <legend>Targets</legend>
          {TARGETS.map((target) => (
            <label key={target.value} className="check">
              <input
                type="checkbox"
                checked={targets.includes(target.value)}
                onChange={() => toggle(target.value)}
              />
              {target.label}
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={armed} onChange={(event) => setArmed(event.target.checked)} />I understand
          this archives the selected agents
        </label>
        {result ? (
          <p className="result" role="status">
            {result}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy || !armed || targets.length === 0}
            onClick={() => onConfirm(targets)}
          >
            {busy ? "Tearing down…" : "Teardown"}
          </button>
        </div>
      </div>
    </div>
  );
}
