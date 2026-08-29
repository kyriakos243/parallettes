import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve("dist");
const sourceWorkerPath = resolve("public/sw.js");
const builtWorkerPath = join(root, "sw.js");
const assetManifestPath = join(root, "asset-manifest.json");
const applicationVariant = process.env.P25_PWA_VARIANT ?? "v1";
const cacheChannel = process.env.P25_PWA_CACHE_CHANNEL ?? "v1";
const deploymentBase = process.env.P25_PWA_BASE ?? "/parallettes/";
const releaseCandidateId = "parallette25-vnext-rc.3";
const productionReleaseId = "parallette25-vnext.1";
const productionProfileApiOrigin = "https://parallette25-profile-api.kyriakos243.workers.dev";
const variantConfiguration = applicationVariant === "v1"
  ? {
      cacheChannel: "v1",
      deploymentBase: "/parallettes/",
      buildLaneMarker: "p25-build-lane:v1",
      forbiddenBuildLaneMarker: "p25-build-lane:vnext-rc3",
      startUrl: "/parallettes/",
    }
  : applicationVariant === "vnext-rc"
    ? {
        cacheChannel: "vnext-rc3",
        deploymentBase: "/parallettes/vnext-rc/",
        buildLaneMarker: "p25-build-lane:vnext-rc3",
        forbiddenBuildLaneMarker: "p25-build-lane:v1",
        startUrl: `/parallettes/vnext-rc/?experience=${encodeURIComponent(releaseCandidateId)}`,
      }
    : applicationVariant === "vnext-production"
      ? {
          cacheChannel: "vnext-production1",
          deploymentBase: "/parallettes/",
          buildLaneMarker: "p25-build-lane:vnext-production1",
          forbiddenBuildLaneMarkers: ["p25-build-lane:v1", "p25-build-lane:vnext-rc3"],
          startUrl: "/parallettes/",
        }
    : undefined;
if (!variantConfiguration) throw new Error("PWA variant must be exactly v1, vnext-rc or vnext-production");
if (!variantConfiguration.forbiddenBuildLaneMarkers) {
  variantConfiguration.forbiddenBuildLaneMarkers = applicationVariant === "v1"
    ? ["p25-build-lane:vnext-rc3", "p25-build-lane:vnext-production1"]
    : ["p25-build-lane:v1", "p25-build-lane:vnext-production1"];
}
if (!/^[a-z0-9][a-z0-9-]{0,31}$/u.test(cacheChannel)) {
  throw new Error("PWA cache channel must be a short lowercase-safe identifier");
}
if (!/^\/[a-z0-9/-]+\/$/u.test(deploymentBase) || deploymentBase.includes("//")) {
  throw new Error("PWA deployment base must be a lowercase absolute directory path");
}
if (cacheChannel !== variantConfiguration.cacheChannel
  || deploymentBase !== variantConfiguration.deploymentBase) {
  throw new Error(`PWA ${applicationVariant} variant has a crossed cache channel or deployment base`);
}
const staticRequired = ["index.html", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
for (const file of staticRequired) if (!existsSync(join(root, file))) throw new Error(`Production PWA is missing ${file}`);

const manifestPath = join(root, "manifest.webmanifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const portablePath = (path) => relative(root, path).replaceAll("\\", "/");

const initialFiles = walk(root);
const viteAssets = initialFiles
  .filter((path) => /\.(?:js|css)$/u.test(path) && path !== builtWorkerPath)
  .sort((a, b) => portablePath(a).localeCompare(portablePath(b)));
if (!viteAssets.length) throw new Error("Production bundle has no Vite JavaScript or CSS assets");

const assetNames = viteAssets.map(portablePath);
const motionChunkPattern = applicationVariant !== "v1"
  ? /(?:^|\/)VNextMotionGuide-[^/]+\.js$/u
  : /(?:^|\/)MotionGuide-[^/]+\.js$/u;
if (!assetNames.some((path) => motionChunkPattern.test(path))) {
  throw new Error(`Production bundle is missing the lazy ${applicationVariant} motion-guide chunk`);
}

const indexPath = join(root, "index.html");
let html = readFileSync(indexPath, "utf8");
const linked = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)].map((match) => match[1]);
if (!linked.length) throw new Error("Production HTML has no local application links");
for (const source of linked) {
  if (!source.startsWith(deploymentBase)) {
    throw new Error(`Production HTML link ${source} does not use exact ${applicationVariant} base ${deploymentBase}`);
  }
  const pathWithQuery = source.slice(deploymentBase.length);
  const path = pathWithQuery.split(/[?#]/u)[0];
  if (path && !existsSync(join(root, path))) throw new Error(`Production HTML points to missing ${path}`);
}

const builtJavaScript = viteAssets
  .filter((path) => path.endsWith(".js"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
if (!builtJavaScript.includes(variantConfiguration.buildLaneMarker)
  || variantConfiguration.forbiddenBuildLaneMarkers.some((marker) => builtJavaScript.includes(marker))) {
  throw new Error(`Production bundle does not contain exactly the ${applicationVariant} application authority lane`);
}
if (applicationVariant === "vnext-production") {
  const workerOrigins = [...builtJavaScript.matchAll(/https:\/\/[a-z0-9.-]+\.workers\.dev/gu)]
    .map((match) => match[0]);
  if (!workerOrigins.includes(productionProfileApiOrigin)
    || workerOrigins.some((origin) => origin !== productionProfileApiOrigin)) {
    throw new Error(`vNext production must bind only ${productionProfileApiOrigin}`);
  }
}
const hasReleaseCandidateApp = assetNames.some((path) => /(?:^|\/)VNextReleaseCandidateApp-[^/]+\.js$/u.test(path));
const hasProductionApp = assetNames.some((path) => /(?:^|\/)VNextProductionApp-[^/]+\.js$/u.test(path));
const hasReleaseCandidateCss = assetNames.some((path) => /(?:^|\/)phase(?:8|9)-[^/]+\.css$/u.test(path));
const hasLegacyApp = assetNames.some((path) => /(?:^|\/)page-[^/]+\.js$/u.test(path));
const hasLegacyCss = assetNames.some((path) => /(?:^|\/)globals-[^/]+\.css$/u.test(path));
if (applicationVariant === "v1"
  ? hasReleaseCandidateApp || hasProductionApp || hasReleaseCandidateCss || !hasLegacyApp || !hasLegacyCss
  : applicationVariant === "vnext-rc"
    ? !hasReleaseCandidateApp || hasProductionApp || !hasReleaseCandidateCss || hasLegacyApp || hasLegacyCss
    : !hasProductionApp || hasReleaseCandidateApp || !hasReleaseCandidateCss || hasLegacyApp || hasLegacyCss) {
  throw new Error(`Production bundle mixes ${applicationVariant} with the opposite application asset graph`);
}

const replaceRequired = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) throw new Error(`Production HTML is missing ${label}`);
  return source.replace(pattern, replacement);
};
if (applicationVariant === "vnext-rc") {
  html = replaceRequired(
    html,
    /<meta name="description" content="[^"]*" \/>/u,
    '<meta name="description" content="Isolated vNext release candidate for adaptive placement, Progress & Goals and evidence-led 25-minute sessions." />',
    "the application description",
  );
  html = replaceRequired(
    html,
    /<meta name="apple-mobile-web-app-title" content="[^"]*" \/>/u,
    '<meta name="apple-mobile-web-app-title" content="P25 vNext RC" />',
    "the installed application title",
  );
  html = replaceRequired(
    html,
    /<meta property="og:title" content="[^"]*" \/>/u,
    '<meta property="og:title" content="Parallette25 vNext RC.3" />',
    "the sharing title",
  );
  html = replaceRequired(
    html,
    /<meta property="og:description" content="[^"]*" \/>/u,
    '<meta property="og:description" content="Isolated evidence-led training preview; ordinary v1.2 authority is unchanged." />',
    "the sharing description",
  );
  html = replaceRequired(
    html,
    /<title>[^<]*<\/title>/u,
    "<title>Parallette25 vNext RC.3 — Isolated Preview</title>",
    "the document title",
  );
  writeFileSync(indexPath, html);
} else if (applicationVariant === "vnext-production") {
  html = replaceRequired(
    html,
    /<meta name="description" content="[^"]*" \/>/u,
    '<meta name="description" content="Evidence-led, goal-directed 25-minute parallette training with adaptive progression." />',
    "the application description",
  );
  html = replaceRequired(
    html,
    /<meta property="og:description" content="[^"]*" \/>/u,
    '<meta property="og:description" content="Evidence-led parallette training that adapts each session to demonstrated progress." />',
    "the sharing description",
  );
  html = replaceRequired(
    html,
    /<title>[^<]*<\/title>/u,
    "<title>Parallette25 — Evidence-led 25-minute training</title>",
    "the document title",
  );
  writeFileSync(indexPath, html);
}

manifest.id = deploymentBase;
manifest.start_url = variantConfiguration.startUrl;
manifest.scope = deploymentBase;
if (applicationVariant === "vnext-rc") {
  manifest.name = "Parallette25 vNext RC.3 — Isolated Preview";
  manifest.short_name = "P25 vNext RC";
  manifest.description = "Isolated evidence-led Parallette25 release candidate for adaptive 25-minute training.";
} else if (applicationVariant === "vnext-production") {
  manifest.name = "Parallette25 — Evidence-led 25-minute training";
  manifest.short_name = "Parallette25";
  manifest.description = "Goal-directed parallette sessions that adapt to demonstrated progress, current trainability and equipment.";
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Fingerprint every eager/lazy Vite chunk and the complete offline shell. The
// injected ID changes the service-worker bytes whenever a deploy needs a new
// cache, while remaining deterministic for identical build output.
const fingerprintPaths = [
  ...viteAssets,
  ...["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]
    .map((file) => join(root, file)),
].sort((a, b) => portablePath(a).localeCompare(portablePath(b)));
const fingerprint = createHash("sha256");
fingerprint.update(`channel:${cacheChannel}\0`);
for (const path of fingerprintPaths) {
  fingerprint.update(portablePath(path));
  fingerprint.update("\0");
  fingerprint.update(readFileSync(path));
  fingerprint.update("\0");
}
const buildId = fingerprint.digest("hex").slice(0, 20);

const assetManifest = { buildId, channel: cacheChannel, assets: assetNames };
writeFileSync(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`);

const sourceWorker = readFileSync(sourceWorkerPath, "utf8");
if (!sourceWorker.includes('const BUILD_ID = "__PWA_BUILD_ID__";')) {
  throw new Error("Source service worker is missing its deterministic build token");
}
if (!sourceWorker.includes('const CACHE_CHANNEL = "__PWA_CACHE_CHANNEL__";')) {
  throw new Error("Source service worker is missing its deployment-lane token");
}
if (!sourceWorker.includes('const VNEXT_RC_PATH = "/parallettes/vnext-rc/";')
  || !sourceWorker.includes('CACHE_CHANNEL === "v1" && requestUrl.pathname.startsWith(VNEXT_RC_PATH)')) {
  throw new Error("Source service worker does not exclude the nested RC lane from parent v1 interception");
}
let builtWorker = readFileSync(builtWorkerPath, "utf8");
const buildDeclarations = [...builtWorker.matchAll(/const BUILD_ID = "([^"]+)";/gu)];
if (buildDeclarations.length !== 1 ||
  (buildDeclarations[0][1] !== "__PWA_BUILD_ID__" && !/^[a-f0-9]{20}$/u.test(buildDeclarations[0][1]))) {
  throw new Error("Built service worker has an invalid build token");
}
builtWorker = builtWorker.replace(
  /const BUILD_ID = "[^"]+";/u,
  `const BUILD_ID = "${buildId}";`,
);
builtWorker = builtWorker.replace(
  /const CACHE_CHANNEL = "[^"]+";/u,
  `const CACHE_CHANNEL = "${cacheChannel}";`,
);
writeFileSync(builtWorkerPath, builtWorker);

const required = [...staticRequired, "asset-manifest.json"];
for (const file of required) if (!existsSync(join(root, file))) throw new Error(`Production PWA is missing ${file}`);

if (manifest.id !== deploymentBase || manifest.start_url !== variantConfiguration.startUrl
  || manifest.scope !== deploymentBase ||
  manifest.display !== "standalone" || manifest.orientation !== "any") {
  throw new Error("Production manifest has an invalid identity, launch URL, scope, display mode or orientation");
}
if (applicationVariant === "vnext-rc"
  && (manifest.name !== "Parallette25 vNext RC.3 — Isolated Preview"
    || manifest.short_name !== "P25 vNext RC"
    || !manifest.description.includes("release candidate"))) {
  throw new Error("Release-candidate manifest metadata does not truthfully identify the isolated preview");
}
if (applicationVariant === "vnext-production"
  && (manifest.name !== "Parallette25 — Evidence-led 25-minute training"
    || manifest.short_name !== "Parallette25"
    || !manifest.description.includes("Goal-directed"))) {
  throw new Error("vNext production manifest metadata does not identify the released product");
}

const generatedAssetManifest = JSON.parse(readFileSync(assetManifestPath, "utf8"));
if (generatedAssetManifest.buildId !== buildId || generatedAssetManifest.channel !== cacheChannel ||
  JSON.stringify(generatedAssetManifest.assets) !== JSON.stringify(assetNames)) {
  throw new Error("Production asset manifest does not exactly cover the built Vite chunks");
}
for (const source of generatedAssetManifest.assets) {
  if (!/\.(?:js|css)$/u.test(source) || !existsSync(join(root, source))) {
    throw new Error(`Production asset manifest points to invalid ${source}`);
  }
}

const files = walk(root);
if (files.some((path) => path.toLowerCase().endsWith(".gif"))) throw new Error("Legacy GIFs are present in the production bundle");
const textBundle = files
  .filter((path) => /\.(?:html|js|css|json|webmanifest)$/u.test(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
if (/gho_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|GITHUB_TOKEN/gu.test(textBundle)) {
  throw new Error("A repository credential appears in the production bundle");
}

const appVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const expectedProductCopy = applicationVariant === "v1"
  ? [appVersion, "Set my starting level", "Reassess my starting point"]
  : applicationVariant === "vnext-rc"
    ? [releaseCandidateId, "Progress & Goals opened", "Building your evidence view"]
    : [productionReleaseId, "Progress & Goals opened", "Building your evidence view"];
if (expectedProductCopy.some((copy) => !textBundle.includes(copy))) {
  throw new Error(`Production bundle is missing canonical ${applicationVariant} identity or product copy`);
}

if (!builtWorker.includes(`const BUILD_ID = "${buildId}";`)
  || !builtWorker.includes(`const CACHE_CHANNEL = "${cacheChannel}";`)
  || builtWorker.includes("__PWA_BUILD_ID__") || builtWorker.includes("__PWA_CACHE_CHANNEL__") ||
  !builtWorker.includes("asset-manifest.json") || !builtWorker.includes("key.startsWith(CACHE_PREFIX)") ||
  !builtWorker.includes('CACHE_CHANNEL === "v1" && requestUrl.pathname.startsWith(VNEXT_RC_PATH)') ||
  builtWorker.includes("self.skipWaiting(")) {
  throw new Error("Service worker lacks deterministic assets, namespaced cleanup or safe update behavior");
}
const demoSource = readFileSync("app/ExerciseDemo.tsx", "utf8");
if (!demoSource.includes("deferOffscreen") || !demoSource.includes("IntersectionObserver") ||
  !demoSource.includes('rootMargin: "240px 0px"')) {
  throw new Error("Exercise demos are missing deterministic offscreen suspension");
}
const workflow = readFileSync(".github/workflows/deploy-pages.yml", "utf8");
if (!workflow.includes("pnpm/action-setup@v6") || !workflow.includes("pnpm validate:dist")) {
  throw new Error("Pages workflow is missing the supported pnpm action or production PWA validation");
}

console.log(
  `Production bundle: ${files.length} files, ${applicationVariant}, v${appVersion}, channel ${cacheChannel}, build ${buildId}, ` +
  `${assetNames.length} eager/lazy Vite assets pre-cached, adaptive assessment, scoped PWA caches and no repository credential passed.`,
);
