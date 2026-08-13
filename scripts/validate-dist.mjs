import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve("dist");
const required = ["index.html", "manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
for (const file of required) if (!existsSync(join(root, file))) throw new Error(`Production PWA is missing ${file}`);

const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
if (manifest.start_url !== "/parallettes/" || manifest.scope !== "/parallettes/" || manifest.display !== "standalone") {
  throw new Error("Production manifest has an invalid GitHub Pages scope or display mode");
}
const html = readFileSync(join(root, "index.html"), "utf8");
const linked = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)].map((match) => match[1]);
for (const source of linked.filter((item) => item.startsWith("/parallettes/"))) {
  const relative = source.slice("/parallettes/".length);
  if (relative && !existsSync(join(root, relative))) throw new Error(`Production HTML points to missing ${relative}`);
}

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = walk(root);
if (files.some((path) => path.toLowerCase().endsWith(".gif"))) throw new Error("Legacy GIFs are present in the production bundle");
const textBundle = files.filter((path) => /\.(?:html|js|css|json|webmanifest)$/u.test(path)).map((path) => readFileSync(path, "utf8")).join("\n");
if (/gho_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|GITHUB_TOKEN/gu.test(textBundle)) throw new Error("A repository credential appears in the production bundle");
const appVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!textBundle.includes(appVersion) || !textBundle.includes("Set my starting level") || !textBundle.includes("Reassess my starting point")) {
  throw new Error("Production bundle is missing the visible version or adaptive starting assessment");
}
if (!readFileSync(join(root, "sw.js"), "utf8").includes("cache.addAll([...new Set(assets)])")) throw new Error("Service worker does not pre-cache hashed app assets");

console.log(`Production bundle: ${files.length} files, v${appVersion}, adaptive assessment, scoped PWA shell, no legacy GIFs and no repository credential passed.`);
