import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(projectRoot, path), "utf8");
const sources = {
  experience: read("app/vnext/ui/VNextExperience.tsx"),
  experienceCss: read("app/vnext/ui/phase8.css"),
  rcApp: read("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx"),
  account: read("app/vnext/releaseCandidate/VNextAccountGate.tsx"),
  assessment: read("app/vnext/releaseCandidate/AssessmentRunner.tsx"),
  guided: read("app/vnext/releaseCandidate/GuidedTestRunner.tsx"),
  workout: read("app/vnext/releaseCandidate/WorkoutRunner.tsx"),
  rcCss: read("app/vnext/releaseCandidate/phase9.css"),
  motion: read("app/MotionGuide.tsx"),
  entry: read("src/main.tsx"),
  html: read("index.html"),
  sw: read("public/sw.js"),
  vite: read("vite.config.ts"),
};

const failures = [];
let assertions = 0;
const assert = (condition, message) => {
  assertions += 1;
  if (!condition) failures.push(message);
};
const includesAll = (source, fragments, label) => {
  for (const fragment of fragments) {
    assert(source.includes(fragment), `${label} is missing ${JSON.stringify(fragment)}`);
  }
};

// Document/PWA semantics.
includesAll(sources.html, [
  '<html lang="en">',
  'name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"',
  'name="theme-color"',
  'rel="manifest"',
  'rel="apple-touch-icon"',
  '<div id="root"></div>',
], "application document");
assert(!sources.html.includes("user-scalable=no"), "The viewport prevents user zoom");

// Final athlete surface semantics and trust copy.
includesAll(sources.experience, [
  '<main className="vnext-experience" aria-labelledby="vnext-app-title">',
  '<nav className="vnext-nav" aria-label="vNext training sections">',
  'role="status" aria-live="polite"',
  'Today’s focus',
  'Primary goal',
  'Secondary',
  'Maintenance',
  'Progress &amp; Goals',
  'Evidence, not claims',
  'Why not yet:',
  'Previously demonstrated in this family',
  'Choose one primary goal and up to two secondary goals',
  'Safe progression still comes from current evidence.',
  'Resume today’s workout',
  '<fieldset>',
  '<legend',
  'role="alert"',
], "vNext athlete experience");
assert(!/(?:global athlete level|readiness score|capacity score|fatigue score|manual(?:ly)? claim)/iu.test(sources.experience),
  "The final athlete surface exposes a forbidden global score or manual-claim affordance");
assert(!/<(?:div|span|article|section|li)\b[^>]*\bonClick=/u.test(sources.experience),
  "The final athlete surface uses a pointer-only non-interactive click target");

// Assessment, confirmation, execution and account paths remain operable and labelled.
for (const [label, source] of Object.entries({
  assessment: sources.assessment,
  guided: sources.guided,
  workout: sources.workout,
  account: sources.account,
})) {
  assert(source.includes("<main className=\"vnext-experience"), `${label} flow has no main landmark`);
  assert(source.includes("aria-labelledby="), `${label} flow has no labelled primary region`);
  assert(!/<(?:div|span|article|section|li)\b[^>]*\bonClick=/u.test(source),
    `${label} flow uses a pointer-only non-interactive click target`);
}
includesAll(sources.assessment, ["<fieldset", "<legend", "type=\"radio\"", "type=\"checkbox\"", "Save &amp; close"], "adaptive placement");
includesAll(sources.guided, ["Exact test conditions", "Observed outcome", "quality criteria", "safety criteria", "role=\"alert\""], "guided confirmation");
includesAll(sources.workout, ["aria-label=\"Workout timer\"", "Save &amp; close", "Finish early", "role=\"alert\""], "workout execution");
includesAll(sources.account, [
  "<form className=\"vnext-account-form\"",
  'autoComplete="username"',
  'autoComplete={mode === "create" || mode === "recover" ? "new-password" : "current-password"}',
  'aria-label="Account recovery code"',
  'role="alert"',
], "account boundary");

// Keyboard, target size, responsive layout and reduced-motion support.
includesAll(sources.experienceCss, [
  ".vnext-experience button:focus-visible",
  "outline: 3px solid",
  "min-height: 44px",
  "env(safe-area-inset-top)",
  "@media (max-width: 760px)",
  "grid-template-columns: minmax(0, 1fr)",
  "@media (max-width: 520px)",
  "@media (prefers-reduced-motion: reduce)",
], "vNext responsive styles");
includesAll(sources.rcCss, [
  ".vnext-rc-account-button {\n  min-height: 44px",
  ".vnext-rc-banner summary { min-height: 44px",
  ".vnext-rc-file { position: absolute; inset: 0; width: 100%; height: 100%",
  ":has(.vnext-rc-file:focus-visible)",
  ".phase10-media-audit nav a { min-height: 44px",
  ".phase10-media-audit nav a:focus-visible",
  "@media (max-width: 760px)",
  "@media (prefers-reduced-motion: reduce)",
], "release-candidate responsive styles");
includesAll(sources.motion, [
  'viewBox="0 0 640 520" role="img" aria-label={guide.label}',
  "const reduceMotion = useReducedMotion();",
  "const freeze = Boolean(selectedAuditFrame) || reduceMotion;",
], "owned movement renderer");

// Contrast for the actual normal-size text/background pairs used by the final UI.
const channel = (hex) => Number.parseInt(hex, 16) / 255;
const luminance = (hex) => {
  const values = hex.slice(1).match(/../gu).map(channel).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
};
const contrast = (foreground, background) => {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
};
for (const [foreground, background, label] of [
  ["#173b33", "#ffffff", "primary ink"],
  ["#64736e", "#ffffff", "muted copy"],
  ["#49655d", "#ffffff", "form copy"],
  ["#c2d4cf", "#0b211d", "Today explanation"],
  ["#b9d7ce", "#0d2923", "timer labels"],
  ["#ffffff", "#11796f", "selected controls"],
  ["#8f4938", "#fff1ed", "error message"],
  ["#557068", "#e8f0ec", "inactive navigation"],
]) {
  const ratio = contrast(foreground, background);
  assert(ratio >= 4.5, `${label} contrast is ${ratio.toFixed(2)}:1, below 4.5:1`);
}

// Feature isolation, lazy expensive media and PWA lane safety.
includesAll(sources.rcApp, [
  "No skill was manually unlocked.",
  "ordinary v1.2 authority is unchanged",
  "The exact prepared record is retained for retry.",
  "Session Record",
], "integrated RC authority path");
assert(sources.workout.includes("const VNextMotionGuide = lazy("), "Workout media is not lazy-loaded");
assert(sources.account.includes('const accountBoundary = () => import("../../profileStore")'),
  "The account/profile boundary is eagerly pulled into the initial athlete surface");
assert(sources.entry.includes('if (import.meta.env.VITE_VNEXT_RC_ENABLED === "true")'),
  "The entry does not use a direct build-time isolated RC branch");
assert(sources.vite.includes('base: process.env.P25_BUILD_BASE ?? "/parallettes/"'), "The build base cannot isolate the RC lane");
includesAll(sources.sw, [
  "const CACHE_CHANNEL = \"__PWA_CACHE_CHANNEL__\"",
  "const VNEXT_RC_PATH = \"/parallettes/vnext-rc/\"",
  'CACHE_CHANNEL === "v1" && requestUrl.pathname.startsWith(VNEXT_RC_PATH)',
  'event.request.mode === "navigate"',
  'new Request(url, { cache: "reload" })',
], "service worker");
assert(!/\bself\.skipWaiting\s*\(/u.test(sources.sw), "The service worker can replace an active workout without waiting");

if (failures.length > 0) {
  console.error(`vNext Phase 10 UI/accessibility/PWA validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`vNext Phase 10 UI/accessibility/PWA validation passed (${assertions} assertions).`);
  console.log("- athlete copy, semantics, keyboard focus, 44px targets, contrast, mobile/reduced-motion and safe-area contracts validated");
  console.log("- assessment, guided confirmation, workout, account and PWA isolation paths retain explicit authority and recovery boundaries");
}
