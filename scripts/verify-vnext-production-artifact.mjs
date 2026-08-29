#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { PHASE11_RELEASE } from "./vnext-phase11-release-ops.mjs";

const root = resolve("dist");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

if (!existsSync(root)) throw new Error("dist is missing; build and validate the production lane first.");
const files = walk(root).sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
const composite = createHash("sha256");
for (const path of files) {
  composite.update(relative(root, path).replaceAll("\\", "/"));
  composite.update("\0");
  composite.update(readFileSync(path));
  composite.update("\0");
}
const manifest = JSON.parse(readFileSync(join(root, "asset-manifest.json"), "utf8"));
const actual = {
  buildId: manifest.buildId,
  cacheChannel: manifest.channel,
  distSetSha256: composite.digest("hex"),
  indexSha256: sha256(readFileSync(join(root, "index.html"))),
  serviceWorkerSha256: sha256(readFileSync(join(root, "sw.js"))),
};
const expected = PHASE11_RELEASE.productionArtifact;

if (process.argv.includes("--print")) {
  console.log(JSON.stringify(actual));
  process.exit(0);
}

if (!expected || expected.status !== "frozen") throw new Error("The Phase 11 production artifact is not frozen.");
for (const [key, value] of Object.entries(actual)) {
  if (expected[key] !== value) throw new Error(`Frozen production artifact mismatch for ${key}.`);
}
if (expected.profileApiOrigin !== PHASE11_RELEASE.productionProfileApiOrigin) {
  throw new Error("The frozen artifact is not bound to the exact profile API origin.");
}

if (process.argv.includes("--require-grant")) {
  const contract = readFileSync("app/vnext/production/release.ts", "utf8");
  const fingerprint = expected.distSetSha256;
  if (!contract.includes('status: "granted"')
    || !contract.includes(`releaseArtifactFingerprint: "${fingerprint}"`)
    || !/deployCompatibleRelease:\s*true/u.test(contract)
    || !/runIdempotentLiveMigration:\s*true/u.test(contract)
    || !/switchProductionAuthority:\s*true/u.test(contract)
    || !/deleteLegacyDataOrPaths:\s*false/u.test(contract)) {
    throw new Error("The evaluated release contract has not granted this exact production artifact.");
  }
}

console.log(JSON.stringify(actual));
