import { useRef, useState } from "react";
import { createRestrictionReport } from "../assessment/evidence";
import { DEMAND_DOMAINS, type AthleteId, type DefinitionVersion, type DemandDomain, type RestrictionReportedEvent } from "../contracts";
import "./restrictionSafety.css";

export const restrictionMovementLabels: Record<DemandDomain, string> = {
  "hand-wrist-bearing": "Weight on hands / wrists",
  "forward-straight-arm-upper-limb": "Straight-arm leaning",
  "overhead-straight-arm-upper-limb": "Straight arms overhead",
  "horizontal-bent-arm-push": "Push-ups / horizontal pushing",
  "vertical-bent-arm-push": "Pike / overhead pressing",
  "inversion-technical": "Upside-down work",
  "compression-trunk": "Core / leg lifting",
};

/** A current safety report, not a performance rating or an invented session fact. */
export const RestrictionReportForm = ({ athleteId, catalogueVersion, initialReport, onSave, onClose }: Readonly<{
  athleteId: AthleteId;
  catalogueVersion: DefinitionVersion;
  initialReport?: RestrictionReportedEvent;
  onSave: (report: RestrictionReportedEvent) => Promise<void>;
  onClose: () => void;
}>) => {
  const [domains, setDomains] = useState<readonly DemandDomain[]>(initialReport?.demandDomains ?? []);
  const [region, setRegion] = useState(initialReport?.bodyRegions.join(", ") ?? "");
  const [pending, setPending] = useState(initialReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current || (!pending && (!domains.length || !region.trim()))) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const at = new Date().toISOString();
      const report = pending ?? createRestrictionReport({
        eventId: `restriction-${crypto.randomUUID()}`, athleteId, catalogueVersion,
        occurredAt: at, recordedAt: at, severity: "block", demandDomains: domains,
        bodyRegions: [region.trim()],
        notes: "Athlete requested avoiding these movements after stopping training. Workout timing and performance are recorded separately.",
      });
      setPending(report);
      await onSave(report);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The restriction could not be saved. Retry before continuing training.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-restriction-report-title">
    <section className="vnext-rc-modal vnext-restriction-report">
      <h1 id="vnext-restriction-report-title" tabIndex={-1}>Pause affected movements</h1>
      <p>Your completed work is kept. Choose what to avoid in future workouts; this does not provide medical clearance.</p>
      <fieldset disabled={busy || Boolean(pending)}>
        <legend>Which movements should be avoided?</legend>
        {DEMAND_DOMAINS.map((domain) => <label key={domain} className="vnext-restriction-choice">
          <input type="checkbox" checked={domains.includes(domain)} onChange={() => setDomains((current) => current.includes(domain) ? current.filter((value) => value !== domain) : [...current, domain])} />
          <span>{restrictionMovementLabels[domain]}</span>
        </label>)}
        <label className="vnext-restriction-area">Affected area
          <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="For example: left wrist" required />
        </label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {pending && <p>Your report is ready to save. Retry uses the same entry and will not duplicate it.</p>}
      <div className="vnext-actions">
        <button type="button" className="vnext-action" disabled={busy || (!pending && (!domains.length || !region.trim()))} onClick={() => { void submit(); }}>{busy ? "Saving…" : pending ? "Retry saving restriction" : "Save restriction & return to review"}</button>
        {!pending && <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={onClose}>Back to review</button>}
      </div>
    </section>
  </main>;
};
