import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve("dist");
const sourceWorkerPath = resolve("public/sw.js");
const builtWorkerPath = join(root, "sw.js");
const assetManifestPath = join(root, "asset-manifest.json");
const staticRequired = ["index.html", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
for (const file of staticRequired) if (!existsSync(join(root, file))) throw new Error(`Production PWA is missing ${file}`);

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
if (!assetNames.some((path) => /(?:^|\/)MotionGuide-[^/]+\.js$/u.test(path))) {
  throw new Error("Production bundle is missing the lazy MotionGuide chunk");
}

// Fingerprint every eager/lazy Vite chunk and the complete offline shell. The
// injected ID changes the service-worker bytes whenever a deploy needs a new
// cache, while remaining deterministic for identical build output.
const fingerprintPaths = [
  ...viteAssets,
  ...["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]
    .map((file) => join(root, file)),
].sort((a, b) => portablePath(a).localeCompare(portablePath(b)));
const fingerprint = createHash("sha256");
for (const path of fingerprintPaths) {
  fingerprint.update(portablePath(path));
  fingerprint.update("\0");
  fingerprint.update(readFileSync(path));
  fingerprint.update("\0");
}
const buildId = fingerprint.digest("hex").slice(0, 20);

const assetManifest = { buildId, assets: assetNames };
writeFileSync(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`);

const sourceWorker = readFileSync(sourceWorkerPath, "utf8");
if (!sourceWorker.includes('const BUILD_ID = "__PWA_BUILD_ID__";')) {
  throw new Error("Source service worker is missing its deterministic build token");
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
writeFileSync(builtWorkerPath, builtWorker);

const required = [...staticRequired, "asset-manifest.json"];
for (const file of required) if (!existsSync(join(root, file))) throw new Error(`Production PWA is missing ${file}`);

const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
if (manifest.start_url !== "/parallettes/" || manifest.scope !== "/parallettes/" ||
  manifest.display !== "standalone" || manifest.orientation !== "any") {
  throw new Error("Production manifest has an invalid GitHub Pages scope, display mode or orientation");
}

const generatedAssetManifest = JSON.parse(readFileSync(assetManifestPath, "utf8"));
if (generatedAssetManifest.buildId !== buildId ||
  JSON.stringify(generatedAssetManifest.assets) !== JSON.stringify(assetNames)) {
  throw new Error("Production asset manifest does not exactly cover the built Vite chunks");
}
for (const source of generatedAssetManifest.assets) {
  if (!/\.(?:js|css)$/u.test(source) || !existsSync(join(root, source))) {
    throw new Error(`Production asset manifest points to invalid ${source}`);
  }
}

const html = readFileSync(join(root, "index.html"), "utf8");
const linked = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)].map((match) => match[1]);
for (const source of linked.filter((item) => item.startsWith("/parallettes/"))) {
  const pathWithQuery = source.slice("/parallettes/".length);
  const path = pathWithQuery.split(/[?#]/u)[0];
  if (path && !existsSync(join(root, path))) throw new Error(`Production HTML points to missing ${path}`);
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
if (!textBundle.includes(appVersion) || !textBundle.includes("Set my starting level") || !textBundle.includes("Reassess my starting point")) {
  throw new Error("Production bundle is missing the visible version or adaptive starting assessment");
}

if (!builtWorker.includes(`const BUILD_ID = "${buildId}";`) || builtWorker.includes("__PWA_BUILD_ID__") ||
  !builtWorker.includes("asset-manifest.json") || !builtWorker.includes("key.startsWith(CACHE_PREFIX)") ||
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
  `Production bundle: ${files.length} files, v${appVersion}, build ${buildId}, ` +
  `${assetNames.length} eager/lazy Vite assets pre-cached, adaptive assessment, scoped PWA caches and no repository credential passed.`,
);
