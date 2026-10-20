import { useRef, useState } from "react";
import { createRestrictionClearance, createRestrictionReport } from "../assessment/evidence";
import { DEMAND_DOMAINS, type AthleteId, type DefinitionVersion, type DemandDomain,
  type ObservationSourceRef, type RestrictionClearedEvent, type RestrictionReportedEvent } from "../contracts";
import { restrictionMovementLabels } from "./RestrictionReportForm";

export type RestrictionRecoveryContext = Readonly<{
  source: ObservationSourceRef;
  demandDomains: readonly DemandDomain[];
  report?: RestrictionReportedEvent;
}>;

/** A small explicit update; original workout/test facts are never edited. */
export const RestrictionRecoveryForm = ({ athleteId, catalogueVersion, context, onSave, onClose }: Readonly<{
  athleteId: AthleteId;
  catalogueVersion: DefinitionVersion;
  context: RestrictionRecoveryContext;
  onSave: (report: RestrictionReportedEvent, clearance?: RestrictionClearedEvent) => Promise<void>;
  onClose: () => void;
}>) => {
  const [domains, setDomains] = useState(context.demandDomains);
  const [region, setRegion] = useState(context.report?.bodyRegions.join(", ") ?? "Reported discomfort");
  const [comfortable, setComfortable] = useState<boolean>();
  const [pending, setPending] = useState<Readonly<{ report: RestrictionReportedEvent; clearance?: RestrictionClearedEvent }>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const save = async () => {
    if (submitting.current || (!pending && (!domains.length || comfortable === undefined))) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const at = new Date().toISOString();
      const report = pending?.report ?? context.report ?? createRestrictionReport({
        eventId: `symptom-clarification-${crypto.randomUUID()}`, athleteId, catalogueVersion,
        occurredAt: at, recordedAt: at, severity: "block", demandDomains: domains,
        bodyRegions: [region], symptomSource: context.source,
        notes: "Athlete clarified affected movements from earlier discomfort. Original workout or check is retained.",
      });
      const prepared = pending ?? { report, ...(comfortable ? { clearance: createRestrictionClearance({
        eventId: `comfort-update-${crypto.randomUUID()}`, athleteId, catalogueVersion,
        occurredAt: at, recordedAt: at, restrictionEventId: report.id,
        notes: "Athlete reports these movements comfortable again. This is not a skill check or medical clearance.",
      }) } : {}) };
      setPending(prepared);
      await onSave(prepared.report, prepared.clearance);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The update could not be saved. Retry to finish safely.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return <main className="vnext-experience vnext-rc-overlay" aria-labelledby="vnext-restriction-report-title">
    <section className="vnext-rc-modal vnext-restriction-report">
      <h1 id="vnext-restriction-report-title" tabIndex={-1}>Update comfort</h1>
      <p>Your original feedback and progress stay saved. This update helps choose suitable training; it does not provide medical clearance.</p>
      <fieldset disabled={busy || Boolean(pending)}>
        {!context.report && <>
          <legend>Which movements were affected?</legend>
          <p>These are the movements involved in your recorded exercise. Adjust them if needed.</p>
          {DEMAND_DOMAINS.map((domain) => <label key={domain} className="vnext-restriction-choice">
            <input type="checkbox" checked={domains.includes(domain)}
              onChange={() => setDomains((current) => current.includes(domain) ? current.filter((value) => value !== domain) : [...current, domain])} />
            <span>{restrictionMovementLabels[domain]}</span>
          </label>)}
          <label className="vnext-restriction-area">Area (optional)
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {["Reported discomfort", "Hand / wrist", "Elbow", "Shoulder", "Back / trunk", "Hip / leg", "Another area"].map((area) =>
                <option key={area}>{area}</option>)}
            </select>
          </label>
        </>}
        {context.report && <p>{context.report.demandDomains.map((domain) => restrictionMovementLabels[domain]).join(" · ")}</p>}
        <fieldset>
          <legend>Are these movements comfortable again?</legend>
          <label className="vnext-restriction-choice"><input type="radio" name="comfort" checked={comfortable === false}
            onChange={() => setComfortable(false)} /><span>Still affected — keep them paused</span></label>
          <label className="vnext-restriction-choice"><input type="radio" name="comfort" checked={comfortable === true}
            onChange={() => setComfortable(true)} /><span>Comfortable again</span></label>
        </fieldset>
      </fieldset>
      {comfortable && <p>Suitable easier practice can resume. Demanding work still needs fresh successful checks.</p>}
      {error && <p role="alert">{error}</p>}
      {pending && <p>Retry uses the same saved entries and will not duplicate your feedback.</p>}
      <div className="vnext-actions">
        <button type="button" className="vnext-action" disabled={busy || (!pending && (!domains.length || comfortable === undefined))}
          onClick={() => { void save(); }}>{busy ? "Saving…" : pending ? "Retry saving update" : "Save comfort update"}</button>
        {!pending && <button type="button" className="vnext-action" data-kind="secondary" disabled={busy} onClick={onClose}>Cancel</button>}
      </div>
    </section>
  </main>;
};
