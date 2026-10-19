import { useEffect, useRef, useState } from "react";
import { historyDuration, historyStatus, type VNextRecentSession } from "./sessionHistory";

const SessionDetails = ({ session }: { session: VNextRecentSession }) => <div className="vnext-session-details">
  {session.plannedDuration && <p>{session.plannedDuration}</p>}
  <p className="vnext-help">{session.durationNote ?? "Older workouts may have fewer details."}</p>
  {session.movements?.length ? <ol className="vnext-history-movements">
    {session.movements.map((movement) => <li key={movement.id}>
      <h4>{movement.performedName ?? movement.plannedName}</h4>
      <p className="vnext-history-outcome">{movement.outcome} · {movement.activity}</p>
      {movement.plannedPrescription && <p><strong>Planned:</strong> {movement.plannedName} · {movement.plannedPrescription}</p>}
      {movement.performedName && movement.performedTarget && <p><strong>Used:</strong> {movement.performedName} · target {movement.performedTarget}</p>}
      {movement.performedNote && <p>{movement.performedNote}</p>}
      {movement.feedback.map((line) => <p key={line}>{line}</p>)}
      {movement.change && <p><strong>Change recorded:</strong> {movement.change}</p>}
    </li>)}
  </ol> : <p>Exercise details are not available for this workout.</p>}
</div>;

export const SessionHistoryCard = ({ session, initiallyOpen = false }: { session: VNextRecentSession; initiallyOpen?: boolean }) => <details className="vnext-session-card" open={initiallyOpen || undefined}>
  <summary>
    <span className="vnext-history-title">{session.title}</span>
    <span className="vnext-history-date">{new Date(session.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
    <span className="vnext-history-meta"><span>{historyStatus(session.status)}</span><span>{session.durationLabel ?? `${historyDuration(session.participationSeconds)} recorded activity`}</span>{session.source === "migrated" && <span>Imported workout</span>}</span>
    <span className="vnext-history-detail-label">Exercise details</span>
  </summary>
  <SessionDetails session={session} />
</details>;

export const HistoryView = ({ sessions, selectedId }: { sessions: readonly VNextRecentSession[]; selectedId?: string }) => {
  const [visibleCount, setVisibleCount] = useState(12);
  const firstAdded = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (selectedId) { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: "start" }); } }, [selectedId]);
  const previousCount = useRef(visibleCount);
  const selectedIndex = selectedId ? sessions.findIndex((session) => session.id === selectedId) : -1;
  const count = Math.max(visibleCount, selectedIndex + 1);
  useEffect(() => {
    if (visibleCount > previousCount.current) firstAdded.current?.focus({ preventScroll: false });
    previousCount.current = visibleCount;
  }, [visibleCount]);
  return <section className="vnext-view" aria-labelledby="vnext-history-heading">
    <div className="vnext-section-heading"><p className="vnext-kicker">Your training</p><h2 id="vnext-history-heading" ref={heading} tabIndex={-1}>History</h2><p>Open a workout to see what was planned and what you recorded.</p></div>
    {!sessions.length ? <div className="vnext-empty">Your workouts will appear here after you save your first one.</div> : <>
      <p className="vnext-help" role="status">Showing {Math.min(count, sessions.length)} of {sessions.length} saved workouts</p>
      <div className="vnext-history-list">{sessions.slice(0, count).map((session, index) => <article key={session.id} tabIndex={-1} ref={index === previousCount.current ? firstAdded : undefined}><SessionHistoryCard session={session} initiallyOpen={session.id === selectedId} /></article>)}</div>
      {count < sessions.length && <button type="button" className="vnext-action" data-kind="secondary" onClick={() => setVisibleCount(count + 12)}>Load older workouts</button>}
    </>}
  </section>;
};

export const WorkoutSavedSummary = ({ session, nextFocus, syncMessage, onHistory, onDone, active = true }: {
  session: VNextRecentSession;
  active?: boolean;
  nextFocus: string;
  syncMessage: string;
  onHistory: () => void;
  onDone: () => void;
}) => {
  const heading = useRef<HTMLHeadingElement>(null);
  const focusedSession = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!active || focusedSession.current === session.id) return;
    focusedSession.current = session.id;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start" });
  }, [session.id, active]);
  return <section className="vnext-saved-summary" aria-labelledby="vnext-saved-heading">
    <p className="vnext-kicker">Saved on this device</p>
    <h2 id="vnext-saved-heading" ref={heading} tabIndex={-1}>Workout saved</h2>
    <p className="vnext-help" role="status">{syncMessage}</p>
    <p>{session.movements?.some((movement) => movement.performed) ? `You recorded work on: ${[...new Set(session.movements.filter((movement) => movement.performed).map((movement) => movement.performedName ?? movement.plannedName))].join(", ")}.` : "No activity was recorded."}</p>
    <SessionHistoryCard session={session} />
    <p><strong>Next workout:</strong> {nextFocus}</p>
    <div className="vnext-actions"><button type="button" className="vnext-submit" onClick={onDone}>Done</button><button type="button" className="vnext-action" data-kind="secondary" onClick={onHistory}>View in History</button></div>
  </section>;
};
