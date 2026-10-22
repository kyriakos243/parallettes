// Batch 3 performance contract: accepted B–F motion data is fetched per batch on
// first use, every deferred reference resolves to exactly one accepted batch, a
// failed fetch is refused (never substituted) and stays retryable, and the
// service worker reuses content-hashed assets while refreshing the shell.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { loadTypeScriptModule as load } from "./lib/load-typescript.mjs";

let checks = 0;
const pass = (name) => { checks++; console.log(`PASS ${name}`); };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// 1. Mapping integrity: the specs used to defer loading name exactly the keys of
//    the accepted literal files, so no guide can be routed to the wrong batch.
const { combinedProgressionBatches } = load("app/vnext/production/combinedProgressionRelease.ts");
const seen = new Map();
for (const batch of combinedProgressionBatches) {
  const accepted = JSON.parse(source(`app/vnext/production/acceptedBatch${batch.letter}Motion.json`));
  const specRefs = batch.specs.map((spec) => spec.exercise).sort();
  assert.deepEqual(specRefs, Object.keys(accepted).sort(), `Batch ${batch.letter} spec references differ from its accepted guides`);
  for (const reference of specRefs) {
    assert(!seen.has(reference), `${reference} is deferred by both ${seen.get(reference)} and ${batch.letter}`);
    seen.set(reference, batch.letter);
  }
}
pass(`all ${seen.size} deferred references map to exactly one accepted batch file`);

// 2. Source shape: no static JSON import remains anywhere in the production graph.
const mediaSource = source("app/vnext/production/combinedProgressionMedia.ts");
for (const letter of "BCDEF") {
  assert(mediaSource.includes(`await import("./acceptedBatch${letter}Motion.json")`), `Batch ${letter} is not lazily imported`);
  assert(!mediaSource.includes(`from "./acceptedBatch${letter}Motion.json"`), `Batch ${letter} is still statically imported`);
}
assert(mediaSource.includes("registerDeferredMotion(batch.specs.map((spec) => spec.exercise)"),
  "Accepted batches are not registered as deferred owned guides");
const productionSource = source("app/vnext/production/VNextProductionApp.tsx");
assert(productionSource.includes("preparePlanMedia: prepareCombinedProgressionPlanMedia"),
  "Production does not load lazily delivered guides before a player opens");
const appSource = source("app/vnext/releaseCandidate/VNextReleaseCandidateApp.tsx");
assert.equal((appSource.match(/await deployment\.preparePlanMedia\?\.\(planMediaReferences\(/gu) ?? []).length, 2,
  "Today and Custom starts do not both prepare guides before opening the player");
for (const path of ["app/vnext/ui/VNextExperience.tsx", "app/vnext/releaseCandidate/AssessmentRunner.tsx",
  "app/vnext/releaseCandidate/GuidedTestRunner.tsx", "app/vnext/releaseCandidate/QuickPlacementReview.tsx"]) {
  assert(source(path).includes('import { DeferredMotionGuide as VNextMotionGuide } from "../media/deferredMotion";'),
    `${path} renders a guide without waiting for its lazily delivered batch`);
}
for (const path of ["app/vnext/releaseCandidate/MixedWorkoutRunner.tsx", "app/vnext/releaseCandidate/ReliableWorkoutRunner.tsx"]) {
  assert(source(path).includes('(await import("../media/deferredMotion")).DeferredMotionGuide'),
    `${path} renders a guide without waiting for its lazily delivered batch`);
}
assert(source("app/vnext/media/deferredMotion.tsx").includes("return <VNextMotionGuide {...props} />"),
  "The deferred wrapper must render through the accepted renderer unchanged");
pass("accepted data is lazily imported, deferred, wrapped at every guide surface and prepared before players open");

// 3. Deferred registry behaviour with the real module logic and fake loaders.
const registered = new Set(["base-guide"]);
const ensureSource = source("app/vnext/media/deferredMotion.tsx");
const registryStart = ensureSource.indexOf("export type DeferredMotionLoader");
const registryEnd = ensureSource.indexOf("const placeholderStyle");
assert(registryStart > 0 && registryEnd > registryStart, "Deferred registry block not found");
const registryBody = ts.transpileModule(
  ensureSource.slice(registryStart, registryEnd).replace(/export const /gu, "const "),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
const context = { isMotionPreset: (reference) => registered.has(reference), Map, Promise, Error, exports: {}, result: {} };
vm.runInNewContext(`${registryBody}; result.api = { registerDeferredMotion, hasDeferredMotion, ensureMotion };`, context);
const { registerDeferredMotion, hasDeferredMotion, ensureMotion } = context.result.api;
let attempts = 0, online = false;
const loader = async () => {
  attempts++;
  if (!online) throw new Error("offline");
  registered.add("deferred-a"); registered.add("deferred-b");
};
registerDeferredMotion(["deferred-a", "deferred-b", "base-guide"], loader);
assert.equal(hasDeferredMotion("base-guide"), false, "An already registered guide must not be deferred");
assert.equal(await ensureMotion("base-guide"), true);
assert.equal(await ensureMotion("unknown-guide"), false);
await assert.rejects(ensureMotion("deferred-a"), /offline/u, "A failed batch fetch must reject, never substitute");
online = true;
const [a, b] = await Promise.all([ensureMotion("deferred-a"), ensureMotion("deferred-b")]);
assert.equal(a && b, true);
assert.equal(attempts, 2, "A failed fetch must be retried once and concurrent requests must share one load");
pass("deferred guides load once per batch, reject when unavailable and recover on retry");

// 4. Service worker: hashed assets reuse the HTTP cache; shell files stay fresh.
const requested = [];
const handlers = {};
const buildId = "c".repeat(20);
const scope = "https://qa.invalid/parallettes/";
const caches = {
  async keys() { return []; },
  async delete() { return true; },
  async open() {
    return {
      async addAll(requests) { requested.push(...requests); },
      async match(request) {
        const url = typeof request === "string" ? request : request.url;
        if (url.endsWith("asset-manifest.json")) return new Response(JSON.stringify({ buildId, channel: "vnext-production1" }));
        return new Response(`<meta name="p25-build-id" content="${buildId}" />`);
      },
    };
  },
};
vm.runInNewContext(source("public/sw.js").replace("__PWA_BUILD_ID__", buildId).replace("__PWA_CACHE_CHANNEL__", "vnext-production1"), {
  self: { registration: { scope }, addEventListener(type, handler) { handlers[type] = handler; }, clients: {} },
  caches,
  fetch: async () => new Response(JSON.stringify({ buildId, channel: "vnext-production1",
    assets: ["assets/VNextProductionApp-x.js", "assets/acceptedBatchEMotion-y.js", "assets/phase8-z.css"] })),
  URL, Request, Response,
});
let installWork;
handlers.install({ waitUntil(promise) { installWork = promise; } });
await installWork;
const modes = Object.fromEntries(requested.map((request) => [new URL(request.url).pathname.replace("/parallettes/", "") || "/", request.cache]));
for (const asset of ["assets/VNextProductionApp-x.js", "assets/acceptedBatchEMotion-y.js", "assets/phase8-z.css"]) {
  assert.equal(modes[asset], "default", `${asset} must reuse the HTTP-cached copy`);
}
for (const shell of ["/", "asset-manifest.json", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
  assert.equal(modes[shell], "reload", `${shell} must be fetched fresh`);
}
assert.equal(requested.length, 9, "Every shell file and every manifest asset, including lazy motion chunks, must be precached");
pass("precache refreshes unhashed shell files, reuses hashed assets and still covers every lazy chunk");

console.log(`Lazy motion delivery: ${checks} focused checks passed.`);
