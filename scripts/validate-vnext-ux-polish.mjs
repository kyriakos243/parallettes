import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

// UX polish batch (review findings C11 note, C14, C15, C19). Presentation and
// interaction only: no plan, dose, evidence or schema behaviour is checked here.
let checks = 0;
const check = (label, callback) => { callback(); checks++; console.log(`PASS ${label}`); };
const read = (path) => readFileSync(path, "utf8");

const cssFiles = ["app/vnext/ui", "app/vnext/releaseCandidate"]
  .flatMap((directory) => readdirSync(directory).filter((name) => name.endsWith(".css")).map((name) => join(directory, name)));

// phase8.css and phase9.css are byte-pinned with the owner-reviewed player
// (progression/batch*ReviewManifest.ts). They keep their exact bytes; every
// sub-12px label in them must instead be overridden in uxPolish.css.
const pinnedCss = new Set(["app/vnext/ui/phase8.css", "app/vnext/releaseCandidate/phase9.css"]);
const polishCss = read("app/vnext/releaseCandidate/uxPolish.css");
const smallDeclarations = (path) => read(path).split("\n").flatMap((line, index) => {
  const sizes = [...line.matchAll(/font-size:\s*([0-9.]+)px/gu), ...line.matchAll(/font:\s*(?:[0-9]{3}\s+)?([0-9.]+)px/gu)]
    .map((match) => Number(match[1]));
  return sizes.filter((size) => size < 12).map((size) => ({ path, line: index + 1, size, selector: line.split("{")[0].trim() }));
});

check("no vNext stylesheet ships text smaller than 12px, and pinned player styles keep their exact bytes", () => {
  const unpinned = cssFiles.filter((path) => !pinnedCss.has(path)).flatMap(smallDeclarations);
  assert.deepEqual(unpinned.map((entry) => `${entry.path}:${entry.line} ${entry.size}px`), [], "Editable stylesheets must not ship sub-12px text");
  const manifest = read("app/vnext/progression/batchAReviewManifest.ts");
  for (const path of pinnedCss) {
    const pinned = manifest.match(new RegExp(`"${path.replaceAll(".", "\\.")}": "([0-9a-f]{64})"`, "u"))?.[1];
    assert(pinned, `${path} must stay pinned with the reviewed player`);
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    assert.equal(actual, pinned, `${path} must keep the exact reviewed-player bytes; override it in uxPolish.css instead`);
  }
  const missing = [...pinnedCss].flatMap(smallDeclarations)
    .filter((entry) => !new RegExp(`html ${entry.selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\s*[,{]`, "u").test(polishCss));
  assert.deepEqual(missing.map((entry) => `${entry.path}:${entry.line} ${entry.selector} ${entry.size}px`), [],
    "Every sub-12px label in a pinned stylesheet needs a 12px override in uxPolish.css");
  const overrideSizes = [...polishCss.matchAll(/font-size:\s*([0-9.]+)px/gu)].map((match) => Number(match[1]));
  assert(overrideSizes.length > 0 && overrideSizes.every((size) => size >= 12), "Overrides must be at least 12px");
});

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

check("keyboard focus ring is opaque teal with at least 3:1 contrast on page and card backgrounds", () => {
  const start = polishCss.indexOf("html .vnext-experience button:focus-visible");
  assert(start >= 0, "uxPolish.css must override the pinned translucent focus ring");
  const focusRule = polishCss.slice(start, polishCss.indexOf("}", start));
  assert(focusRule.includes("outline: 3px solid var(--vnext-teal)"), "Focus outline must use the opaque teal token");
  assert(!/rgba\([^)]*,\s*\.?[0-9.]+\)/u.test(focusRule), "Focus outline must not be translucent");
  for (const element of ["input", "textarea", "summary"]) {
    assert(focusRule.includes(`html .vnext-experience ${element}:focus-visible`), `Focus override must cover ${element}`);
  }
  const teal = read("app/vnext/ui/phase8.css").match(/--vnext-teal:\s*(#[0-9a-f]{6})/iu)?.[1];
  assert(teal, "Teal token must be defined");
  for (const background of ["#fffdf9", "#ffffff", "#f7f5ef"]) {
    assert(contrast(teal, background) >= 3, `Focus ring contrast on ${background} is ${contrast(teal, background).toFixed(2)}`);
  }
});

check("page margin is reset and controls opt out of double-tap zoom", () => {
  assert(/body\s*\{\s*margin:\s*0;\s*\}/u.test(polishCss), "vNext screens must reset the default body margin");
  assert(polishCss.includes("touch-action: manipulation"), "Controls must use touch-action: manipulation");
  assert(read("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx").includes('import "./uxPolish.css";'),
    "The vNext shell must load the polish stylesheet");
});

check("Check later is visible beside Start checks, not hidden inside the disclosure", () => {
  const source = read("app/vnext/releaseCandidate/QuickPlacementReview.tsx");
  const later = source.indexOf("Check later — see my workout");
  const disclosure = source.indexOf("<details className=\"vnext-quick-review-details vnext-quick-other-checks\"");
  assert(later > 0 && disclosure > 0, "Both the action and the disclosure must exist");
  assert(later < disclosure, "Check later must render before (outside) the Other checks disclosure");
  assert.equal(source.split("Check later — see my workout").length - 1, 1, "Exactly one Check later action");
});

check("periodic background sync does not change the announced sync state", () => {
  const { trainingSyncAnnouncement, trainingSyncMessage } = load("app/vnext/ui/syncStatus.ts");
  const base = { account: true, online: true, fingerprint: "f1" };
  const first = trainingSyncAnnouncement({ ...base, status: { phase: "synced", fingerprint: "f1", confirmedAt: "2026-10-22T08:00:00.000Z" } });
  assert.equal(first, "Synced.");
  const during = trainingSyncAnnouncement({ ...base, status: { phase: "syncing" }, previous: first });
  assert.equal(during, first, "A background Syncing… pass must not be announced");
  const later = trainingSyncAnnouncement({ ...base, status: { phase: "synced", fingerprint: "f1", confirmedAt: "2026-10-22T08:05:00.000Z" }, previous: during });
  assert.equal(later, first, "A new Last checked time must not be announced");
  const visibleBefore = trainingSyncMessage({ ...base, status: { phase: "synced", fingerprint: "f1", confirmedAt: "2026-10-22T08:00:00.000Z" } });
  const visibleDuring = trainingSyncMessage({ ...base, status: { phase: "syncing" } });
  assert.notEqual(visibleBefore, visibleDuring, "The visible line still shows background activity");
  assert.notEqual(trainingSyncAnnouncement({ ...base, status: { phase: "error" }, previous: first }), first, "A real problem is announced");
  assert.equal(trainingSyncAnnouncement({ ...base, online: false, status: { phase: "synced" }, previous: first }), "Saved on this device. Offline.");
  const app = read("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx");
  assert(app.includes('<p className="vnext-sync-status" data-state={syncStatus.phase}>{syncMessage}</p>'), "The visible sync line is not a live region");
  assert(app.includes('<p className="vnext-visually-hidden" role="status">{syncAnnouncement}</p>'), "A quiet live region announces state changes");
});

check("demand note says plainly when Challenge or Easier leaves today's sets unchanged", () => {
  const { demandChangeMessage } = load("app/vnext/releaseCandidate/demandChange.ts");
  const bundle = load("app/vnext/production/trainingQuality.ts").trainingQualityCatalogue.bundle;
  const exercise = bundle.exercises.find((entry) => entry.id === "long-lever-hollow-hold");
  assert(exercise, "Fixture exercise must exist in the production catalogue");
  const variant = exercise.prescriptionVariants[0];
  const planWith = (plannedSeconds) => ({ id: `ux-plan-${plannedSeconds}`, athleteId: "ux-test", catalogueVersion: bundle.catalogueVersion,
    generatorPolicyId: "vnext-mixed-workout-generator", generatorPolicyVersion: 6, intendedDurationSeconds: plannedSeconds,
    items: [{ id: "item-hollow", exerciseId: exercise.id, exerciseDefinitionVersion: exercise.definitionVersion,
      prescriptionVariantId: variant.id, purpose: "primary-development", plannedSeconds, demand: variant.demand }] });
  const bundleFor = () => bundle;
  // 420 s and 480 s both become four 120 s cycles: the athlete sees the same sets.
  assert.match(demandChangeMessage({ demand: "challenge", before: planWith(420), after: planWith(480), bundleFor }), /sets stay the same/u);
  assert.match(demandChangeMessage({ demand: "technique", before: planWith(420), after: planWith(420), bundleFor }), /sets stay the same/u);
  assert.equal(demandChangeMessage({ demand: "challenge", before: planWith(240), after: planWith(480), bundleFor }), "Challenge selected for today’s workout.");
  assert.equal(demandChangeMessage({ demand: "standard", before: planWith(480), after: planWith(480), bundleFor }), "Standard selected for today’s workout.");
  assert.equal(demandChangeMessage({ demand: "challenge", before: undefined, after: planWith(480), bundleFor }), "Challenge selected for today’s workout.");
});

check("a shorter plan with one development movement does not claim other useful work", () => {
  const { honestDurationMessage } = load("app/vnext/presentation/today.ts");
  const useful = "This workout is shorter because Pike Elevation practice is limited to three controlled sets. Other useful work keeps its planned dose; extra sets are not added to fill time.";
  const practice = "This workout is shorter because wall-line practice is limited to three controlled sets. Other useful work keeps its planned dose; no extra sets are added to fill time.";
  const plan = (...purposes) => ({ items: purposes.map((purpose) => ({ purpose })) });
  const single = plan("preparation", "primary-development", "recovery");
  for (const message of [useful, practice]) {
    const shown = honestDurationMessage(message, single);
    assert(!shown.includes("Other useful work"), "No other useful work exists to keep its dose");
    assert(shown.endsWith("Extra sets are not added to fill time."));
    assert.equal(honestDurationMessage(message, plan("preparation", "primary-development", "support-capacity", "recovery")), message,
      "With other development work the stored wording is shown unchanged");
  }
  const other = "This workout is shorter because the selected movements have reached their useful practice dose.";
  assert.equal(honestDurationMessage(other, single), other, "Unrelated messages are never rewritten");
});

check("one tap from Today auto-starts only a never-started preview", () => {
  const app = read("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx");
  assert(app.includes('const autoStart = workoutAutoStart && workoutRecovery?.stage === "preview";'));
  assert.equal(app.split("autoStart={autoStart}").length - 1, 2, "Both production players receive the one-tap request");
  assert(/stage === "active"\) \{\s*\/\/ An interrupted workout always waits for an explicit Resume in the player\.\s*setWorkoutAutoStart\(false\);/u.test(app),
    "A recovered active workout must never auto-start");
  assert(app.includes("const preview = workoutRecoveryRef.current;"), "beginWorkout reads the just-saved preview");
  const experience = read("app/vnext/ui/VNextExperience.tsx");
  assert(experience.includes("? `Start ${workoutOrigin === \"custom\" ? \"Custom Session\" : \"today’s workout\"}`"), "A saved preview offers Start, not Review");
});

const userFacingFiles = [
  ...["VNextReleaseCandidateApp.tsx", "MixedWorkoutRunner.tsx", "ReliableWorkoutRunner.tsx", "VNextAccountGate.tsx",
    "QuickPlacementReview.tsx", "GuidedTestRunner.tsx", "AssessmentRunner.tsx", "CustomSessionBuilder.tsx",
    "QuickSetupContext.tsx", "RestrictionReportForm.tsx", "RestrictionRecoveryForm.tsx"].map((name) => `app/vnext/releaseCandidate/${name}`),
  ...readdirSync("app/vnext/ui").filter((name) => name.endsWith(".tsx")).map((name) => `app/vnext/ui/${name}`),
  "app/vnext/production/VNextProductionApp.tsx",
  ...readdirSync("app/vnext/presentation").filter((name) => name.endsWith(".ts")).map((name) => `app/vnext/presentation/${name}`),
];
// The isolated release-candidate lane keeps its frozen historical copy; it is never shown in production.
const releaseCandidateOnly = new Set(["DEFAULT_PRESENTATION", "RELEASE_CANDIDATE_DEPLOYMENT"]);
const internalTerms = /\bobservations?\b|\bprotocols?\b|Session Plan|Session Record|timer facts|evidence-led|\bowned\b|\bimmutable\b|\bprovenance\b|\bprojection\b|\bauthority\b/iu;

check("production-visible copy uses plain words, not internal terminology", () => {
  const findings = userFacingFiles.flatMap((path) => {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const found = [];
    const visit = (node, skip) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && releaseCandidateOnly.has(node.name.text)) skip = true;
      // Programmer invariants (TypeError) are not user copy.
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "TypeError") skip = true;
      const text = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
        || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.text : ts.isJsxText(node) ? node.getText() : undefined;
      const sentence = text?.trim();
      if (!skip && sentence && /\s/u.test(sentence) && sentence.length > 12 && internalTerms.test(sentence)) {
        found.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${sentence.slice(0, 100)}`);
      }
      ts.forEachChild(node, (child) => visit(child, skip));
    };
    visit(source, false);
    return found;
  });
  assert.deepEqual(findings, [], `Internal terms in user copy:\n${findings.join("\n")}`);
});

check("workout timer cues reuse one gesture-unlocked audio context", () => {
  const audio = read("app/vnext/releaseCandidate/guidedTimerAudio.ts");
  assert(audio.includes("const tone = (frequency: number, seconds: number): boolean =>"));
  assert(/tone = [\s\S]*?if \(!context \|\| context\.state !== "running"/u.test(audio), "A cue never creates or resumes audio on its own");
  for (const path of ["app/vnext/releaseCandidate/MixedWorkoutRunner.tsx", "app/vnext/releaseCandidate/ReliableWorkoutRunner.tsx"]) {
    const runner = read(path);
    assert(!runner.includes("new AudioContextConstructor"), `${path} must not create an AudioContext per cue`);
    assert(runner.includes("if (soundOn) workoutCueAudio.prepare();"), `${path} unlocks audio inside the Start/Resume tap`);
    assert(runner.includes("if (!soundOn) workoutCueAudio.prepare();"), `${path} unlocks audio when sound is switched on`);
  }
  assert(read("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx").includes("prepareWorkoutCues();"), "The Today Start tap unlocks audio");
});

console.log(`UX polish: ${checks} focused checks passed.`);
