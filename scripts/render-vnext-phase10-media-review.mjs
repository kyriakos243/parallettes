import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(projectRoot, "dist/phase10-media-review");
const frameRoot = join(outputRoot, "frames");
const nodeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

const resolveTypeScriptModule = (specifier, parentPath) => {
  const base = resolve(dirname(parentPath), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  const found = candidates.find((candidate) => {
    try { readFileSync(candidate); return true; } catch { return false; }
  });
  if (!found) throw new Error(`Cannot resolve ${specifier} from ${relative(projectRoot, parentPath)}`);
  return found;
};

const loadTypeScriptModule = (path) => {
  const absolutePath = resolve(projectRoot, path);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  const source = readFileSync(absolutePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;
  const loaded = { exports: {} };
  moduleCache.set(absolutePath, loaded);
  const localRequire = (specifier) => specifier.startsWith(".")
    ? loadTypeScriptModule(relative(projectRoot, resolveTypeScriptModule(specifier, absolutePath)))
    : nodeRequire(specifier);
  new Function("exports", "module", "require", "__filename", "__dirname", compiled)(
    loaded.exports, loaded, localRequire, absolutePath, dirname(absolutePath),
  );
  return loaded.exports;
};

const React = nodeRequire("react");
const { renderToStaticMarkup } = nodeRequire("react-dom/server");
const { VNextMotionGuide } = loadTypeScriptModule("app/vnext/media/VNextMotionGuide.tsx");
const { phase10OwnedMotionReferences } = loadTypeScriptModule("app/vnext/media/phase10OwnedMotion.ts");
const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const frames = ["start", "middle", "end"];
const pageSize = 4;

mkdirSync(outputRoot, { recursive: true });
mkdirSync(frameRoot, { recursive: true });
const frameManifest = ["index\treference\tframe\tfile"];
for (let page = 0; page < Math.ceil(phase10OwnedMotionReferences.length / pageSize); page += 1) {
  const visible = phase10OwnedMotionReferences.slice(page * pageSize, (page + 1) * pageSize);
  const cells = [];
  for (const [row, reference] of visible.entries()) {
    const y = 74 + row * 462;
    cells.push(`<text x="24" y="${y - 18}" font-family="system-ui, sans-serif" font-size="22" font-weight="800" fill="#163a33">${page * pageSize + row + 1}. ${escapeXml(reference)}</text>`);
    for (const [column, frame] of frames.entries()) {
      const markup = renderToStaticMarkup(React.createElement(VNextMotionGuide, {
        preset: reference,
        auditFrame: frame,
        compact: true,
      }));
      const match = markup.match(/<svg[\s\S]*<\/svg>/u);
      if (!match) throw new Error(`MotionGuide did not render SVG for ${reference}/${frame}`);
      const ordinal = String(page * pageSize + row + 1).padStart(2, "0");
      const frameFile = `${ordinal}-${reference}-${frame}.svg`;
      const standalone = match[0].replace(
        "<svg ",
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="520" ',
      );
      writeFileSync(join(frameRoot, frameFile), `${standalone}\n`);
      // ImageMagick's local SVG delegate drops groups that use feDropShadow and
      // paints unit-coordinate gradients black. Keep the exact SVG above as the
      // audit source and emit a shape-identical, filter-free raster-review copy.
      const rasterReview = standalone
        .replaceAll(/ filter="url\(#[^"]+\)"/gu, "")
        .replaceAll(/fill="url\(#motion-bg-[^"]+\)"/gu, 'fill="#f7f1e8"');
      writeFileSync(join(frameRoot, frameFile.replace(".svg", ".review.svg")), `${rasterReview}\n`);
      frameManifest.push(`${ordinal}\t${reference}\t${frame}\tframes/${frameFile}`);
      const x = 24 + column * 500;
      const nested = match[0].replace("<svg ", `<svg x="${x}" y="${y}" width="472" height="384" `);
      cells.push(nested);
      cells.push(`<text x="${x + 236}" y="${y + 410}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#526a64">${frame}</text>`);
    }
  }
  const height = 74 + visible.length * 462;
  const document = `<svg xmlns="http://www.w3.org/2000/svg" width="1520" height="${height}" viewBox="0 0 1520 ${height}">
  <rect width="1520" height="${height}" fill="#f7f1e8"/>
  <text x="24" y="36" font-family="system-ui, sans-serif" font-size="25" font-weight="900" fill="#12352e">Parallette25 Phase 10 owned-motion audit · page ${page + 1}/7</text>
  ${cells.join("\n  ")}
</svg>\n`;
  writeFileSync(join(outputRoot, `page-${page + 1}.svg`), document);
}

writeFileSync(join(outputRoot, "frames.tsv"), `${frameManifest.join("\n")}\n`);

let rasterMessage = "";
try {
  const sharp = nodeRequire("sharp");
  for (let page = 0; page < Math.ceil(phase10OwnedMotionReferences.length / pageSize); page += 1) {
    const visible = phase10OwnedMotionReferences.slice(page * pageSize, (page + 1) * pageSize);
    const composites = [];
    const labels = [
      `<text x="16" y="27">Parallette25 owned-motion audit · page ${page + 1}/7</text>`,
      ...frames.map((frame, column) => `<text x="${200 + column * 400}" y="55" text-anchor="middle" font-size="16">${frame}</text>`),
      ...visible.map((reference, row) => `<text x="16" y="${85 + row * 350}" font-size="14">${page * pageSize + row + 1}. ${escapeXml(reference)}</text>`),
    ].join("");
    composites.push({
      input: Buffer.from(`<svg width="1200" height="1470" xmlns="http://www.w3.org/2000/svg"><g fill="#163a33" font-family="system-ui, sans-serif" font-size="20" font-weight="800">${labels}</g></svg>`),
      left: 0,
      top: 0,
    });
    for (const [row, reference] of visible.entries()) {
      const ordinal = String(page * pageSize + row + 1).padStart(2, "0");
      for (const [column, frame] of frames.entries()) {
        const input = await sharp(join(frameRoot, `${ordinal}-${reference}-${frame}.svg`), { density: 72 })
          .resize(392, 319, { fit: "contain" })
          .png()
          .toBuffer();
        composites.push({ input, left: column * 400 + 4, top: row * 350 + 92 });
      }
    }
    await sharp({
      create: { width: 1200, height: 1470, channels: 4, background: "#f7f1e8" },
    }).composite(composites).png().toFile(join(outputRoot, `page-${page + 1}.png`));
  }
  rasterMessage = " and 7 browser-equivalent PNG sheets";
} catch (error) {
  if (error?.code !== "MODULE_NOT_FOUND") throw error;
}

console.log(`Rendered 84 isolated frames, 7 exact SVG sheets${rasterMessage} to ${relative(projectRoot, outputRoot)}.`);
