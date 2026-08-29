import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Application root is unavailable");
const root = createRoot(rootElement);

const renderStartupError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  root.render(
    <StrictMode>
      <main role="alert" style={{ fontFamily: "system-ui", margin: "2rem" }}>
        <h1>Parallette25 could not start</h1>
        <p>{message}</p>
      </main>
    </StrictMode>,
  );
};

const mountLegacyApplication = async (): Promise<void> => {
  rootElement.dataset.p25BuildLane = "p25-build-lane:v1";
  const [{ default: App }] = await Promise.all([
    import("../app/page"),
    import("../app/globals.css"),
  ]);
  root.render(<StrictMode><App /></StrictMode>);
};

const mountReleaseCandidate = async (): Promise<void> => {
  rootElement.dataset.p25BuildLane = "p25-build-lane:vnext-rc3";
  const { selectApplicationAuthority } = await import("../app/vnext/releaseCandidate/entry");
  const authority = selectApplicationAuthority({
    enabled: true,
    configuredReleaseCandidateId: import.meta.env.VITE_VNEXT_RC_ID,
    baseUrl: import.meta.env.BASE_URL,
    pathname: window.location.pathname,
    search: window.location.search,
  });
  if (authority !== "vnext-rc") {
    // The isolated RC artifact must never fall through into legacy startup:
    // legacy hydration includes account/profile lifecycle hooks that do not
    // belong in this authority lane.
    root.render(
      <StrictMode>
        <main role="status" style={{ fontFamily: "system-ui", margin: "2rem", maxWidth: "38rem" }}>
          <p style={{ letterSpacing: ".08em", textTransform: "uppercase" }}>Parallette25 vNext RC.3</p>
          <h1>This isolated preview is unavailable</h1>
          <p>Open it from the exact staging invitation. Your ordinary Parallette25 training remains unchanged.</p>
        </main>
      </StrictMode>,
    );
    return;
  }

  if (new URLSearchParams(window.location.search).get("media-audit") === "phase10") {
    const [{ Phase10MediaAuditPage }] = await Promise.all([
      import("../app/vnext/media/Phase10MediaAuditPage"),
      import("../app/vnext/releaseCandidate/phase9.css"),
    ]);
    root.render(<StrictMode><Phase10MediaAuditPage /></StrictMode>);
    return;
  }

  const [{ VNextReleaseCandidateApp }] = await Promise.all([
    import("../app/vnext/releaseCandidate/VNextReleaseCandidateApp"),
    import("../app/vnext/ui/phase8.css"),
    import("../app/vnext/releaseCandidate/phase9.css"),
  ]);
  root.render(<StrictMode><VNextReleaseCandidateApp /></StrictMode>);
};

const mountProductionApplication = async (): Promise<void> => {
  rootElement.dataset.p25BuildLane = "p25-build-lane:vnext-production1";
  const { selectProductionApplicationAuthority } = await import("../app/vnext/production/entry");
  const authority = selectProductionApplicationAuthority({
    enabled: true,
    configuredReleaseId: import.meta.env.VITE_VNEXT_PRODUCTION_ID,
    baseUrl: import.meta.env.BASE_URL,
    pathname: window.location.pathname,
  });
  if (authority !== "vnext-production") {
    root.render(
      <StrictMode>
        <main role="alert" style={{ fontFamily: "system-ui", margin: "2rem", maxWidth: "38rem" }}>
          <p style={{ letterSpacing: ".08em", textTransform: "uppercase" }}>Parallette25</p>
          <h1>This release cannot start safely</h1>
          <p>The production identity does not match this application bundle. No training data was opened or changed.</p>
        </main>
      </StrictMode>,
    );
    return;
  }
  const [{ VNextProductionApp }] = await Promise.all([
    import("../app/vnext/production/VNextProductionApp"),
    import("../app/vnext/ui/phase8.css"),
    import("../app/vnext/releaseCandidate/phase9.css"),
  ]);
  root.render(<StrictMode><VNextProductionApp /></StrictMode>);
};

// Keep this as a direct build-time branch. Vite can then remove the opposite
// application import graph instead of merely declining to execute it at runtime.
if (import.meta.env.VITE_VNEXT_PRODUCTION_ENABLED === "true") {
  void mountProductionApplication().catch(renderStartupError);
} else if (import.meta.env.VITE_VNEXT_RC_ENABLED === "true") {
  void mountReleaseCandidate().catch(renderStartupError);
} else {
  void mountLegacyApplication().catch(renderStartupError);
}
