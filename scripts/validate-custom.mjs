import { readFileSync } from "node:fs";
import ts from "typescript";

const compile = (path) => ts.transpileModule(readFileSync(path, "utf8").replaceAll("import.meta.env.BASE_URL", '"/parallettes/"'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const programModule = { exports: {} };
new Function("exports", "module", "require", compile("app/program.ts"))(programModule.exports, programModule, () => { throw new Error("unexpected import"); });
const customModule = { exports: {} };
new Function("exports", "module", "require", compile("app/custom.ts"))(customModule.exports, customModule, (name) => name === "./program" ? programModule.exports : require(name));

for (const seconds of [300, 600, 900, 1200, 1500, 1800]) {
  const plan = customModule.exports.buildCustomSession({ focuses: ["core"], equipment: ["parallettes", "floor", "wall"], seconds, difficulty: "recommended" });
  if (plan.seconds !== seconds) throw new Error(`Custom ${seconds}s plan resolved to ${plan.seconds}s`);
}
const matOnly = customModule.exports.buildCustomSession({ focuses: ["core", "mobility"], equipment: ["floor"], seconds: 1200, difficulty: "easy" });
for (const item of matOnly.items) {
  const exercise = programModule.exports.exercises[item.exerciseId];
  if ((exercise.requiredEquipment ?? []).some((equipment) => equipment !== "floor")) throw new Error(`Mat-only plan selected ${item.exerciseId}`);
}
console.log("Custom Session: exact 5/10/15/20/25/30-minute builds and mat-only filtering passed.");
