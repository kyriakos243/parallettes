import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(projectRoot, "dist", "phase10-motion-review");
mkdirSync(outputRoot, { recursive: true });

await build({
  configFile: false,
  root: projectRoot,
  publicDir: false,
  base: "./",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify("1.2.0"),
  },
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    target: "es2022",
    cssCodeSplit: false,
    lib: {
      entry: join(projectRoot, "scripts", "phase10-motion-review-entry.tsx"),
      name: "Parallette25Phase10MotionReview",
      formats: ["iife"],
      fileName: () => "review.js",
      cssFileName: "review",
    },
  },
});

const files = readdirSync(outputRoot);
const script = files.find((file) => file === "review.js");
const stylesheet = files.find((file) => file.endsWith(".css"));
if (!script || !stylesheet) throw new Error("Motion-review bundle is incomplete");

writeFileSync(join(outputRoot, "index.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="light" />
    <title>Parallette25 RC.3 — final-product motion review</title>
    <link rel="stylesheet" href="./${stylesheet}" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./${script}"></script>
  </body>
</html>
`);

console.log(`Built self-contained exact-player review at ${relative(projectRoot, join(outputRoot, "index.html"))}.`);
