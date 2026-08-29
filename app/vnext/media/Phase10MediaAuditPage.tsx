import { phase10OwnedMotionReferences } from "./phase10OwnedMotion";
import { VNextMotionGuide } from "./VNextMotionGuide";
import { VNEXT_RELEASE_CANDIDATE_ID } from "../releaseCandidate/entry";

type ReviewMode = "motion" | "start" | "middle" | "end";

export const Phase10MediaAuditPage = () => {
  const params = new URLSearchParams(window.location.search);
  const pageSize = 4;
  const pages = Math.ceil(phase10OwnedMotionReferences.length / pageSize);
  const requestedPage = Number(params.get("media-page") ?? 0);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(0, Math.min(pages - 1, requestedPage))
    : 0;
  const requestedMode = params.get("media-frame");
  const mode: ReviewMode = requestedMode === "start"
    || requestedMode === "middle"
    || requestedMode === "end"
    ? requestedMode
    : "motion";
  const visible = phase10OwnedMotionReferences.slice(page * pageSize, (page + 1) * pageSize);
  const href = (nextPage: number, nextMode = mode) => {
    const next = new URLSearchParams(params);
    next.set("media-audit", "phase10");
    next.set("media-page", String(nextPage));
    next.set("media-frame", nextMode);
    return `${window.location.pathname}?${next}`;
  };

  return (
    <main className="phase10-media-audit">
      <header>
        <div>
          <p>PARALLETTE25 · PHASE 10 OWNED-MOTION REVIEW</p>
          <h1>{mode === "motion" ? "Final-product animation review" : "Technical frame audit"} · {page + 1}/{pages}</h1>
          <span>{VNEXT_RELEASE_CANDIDATE_ID} · 28 owned guides · 30 movements · owner approval pending</span>
        </div>
        <nav aria-label="Motion review mode">
          {(["motion", "start", "middle", "end"] as const).map((item) => (
            <a key={item} href={href(page, item)} aria-current={mode === item ? "page" : undefined}>{item}</a>
          ))}
        </nav>
      </header>
      <p className="phase10-media-review-note">
        {mode === "motion"
          ? "Exact final-product speed and playback are shown. Directional movements reset at the end; they never play backwards."
          : `Frozen ${mode} keyframe for close technical inspection.`}
        {" "}A system Reduce Motion preference intentionally shows a still image.
      </p>
      <section className="phase10-media-grid" aria-label={`Motion briefs ${page * pageSize + 1} to ${page * pageSize + visible.length}`}>
        {visible.map((reference, index) => (
          <article key={reference}>
            <VNextMotionGuide preset={reference} auditFrame={mode} />
            <h2>{page * pageSize + index + 1}. {reference.replaceAll("-", " ")}</h2>
            <p>{mode === "motion" ? "Exact final-product playback" : `${mode} review frame`}</p>
          </article>
        ))}
      </section>
      <nav className="phase10-media-pagination" aria-label="Motion review pages">
        {page === 0
          ? <span className="is-disabled" aria-disabled="true">Previous</span>
          : <a href={href(page - 1)}>Previous</a>}
        <span>Page {page + 1} of {pages}</span>
        {page === pages - 1
          ? <span className="is-disabled" aria-disabled="true">Next</span>
          : <a href={href(page + 1)}>Next</a>}
      </nav>
    </main>
  );
};
