import { readFileSync } from "node:fs";
import ts from "typescript";

const compile = (path) => ts.transpileModule(readFileSync(path, "utf8").replaceAll("import.meta.env.BASE_URL", '"/parallettes/"'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const programModule = { exports: {} };
new Function("exports", "module", "require", compile("app/program.ts"))(programModule.exports, programModule, () => { throw new Error("unexpected import"); });
const customModule = { exports: {} };
new Function("exports", "module", "require", compile("app/custom.ts"))(customModule.exports, customModule, (name) => name === "./program" ? programModule.exports : require(name));

const focuses = ["handstand", "core", "compression", "lsit", "planche", "pushing", "support", "mobility", "conditioning"];
const durations = [300, 600, 900, 1200, 1500, 1800];
const difficulties = ["easy", "recommended", "hard"];
const equipmentScenarios = [
  ["parallettes", "floor", "wall"],
  ["parallettes", "floor"],
  ["floor", "wall"],
  ["floor", "rope"],
  ["floor"],
];
let generatedCombinations = 0;
for (const focus of focuses) {
  for (const seconds of durations) {
    for (const difficulty of difficulties) {
      for (const equipment of equipmentScenarios) {
        const plan = customModule.exports.buildCustomSession({ focuses: [focus], equipment, seconds, difficulty, readiness: {} });
        if (plan.seconds !== seconds) throw new Error(`${focus}/${difficulty}/${equipment.join("+")} ${seconds}s plan resolved to ${plan.seconds}s`);
        if (!plan.items.length) throw new Error(`${focus}/${difficulty}/${equipment.join("+")} ${seconds}s plan is empty`);
        if (focus !== "mobility" && !plan.items.some((item) => ["pre", "skill", "strength", "lab"].includes(item.block))) {
          throw new Error(`${focus}/${difficulty}/${equipment.join("+")} generated only generic warm-up/cooldown work`);
        }
        for (const item of plan.items) {
          const exercise = programModule.exports.exercises[item.exerciseId];
          if ((exercise.requiredEquipment ?? []).some((required) => !equipment.includes(required))) {
            throw new Error(`${focus}/${difficulty}/${equipment.join("+")} selected unavailable ${item.exerciseId}`);
          }
        }
        const seen = [...new Set(plan.items.map((item) => item.block))];
        for (let index = 1; index < seen.length; index += 1) {
          if (["warmup", "pre", "skill", "lab", "strength", "cooldown"].indexOf(seen[index]) < ["warmup", "pre", "skill", "lab", "strength", "cooldown"].indexOf(seen[index - 1])) {
            throw new Error(`Unsafe order in ${focus}/${difficulty}/${equipment.join("+")}/${seconds}: ${seen.join("/")}`);
          }
        }
        generatedCombinations += 1;
      }
    }
  }
}
const matOnly = customModule.exports.buildCustomSession({ focuses: ["core", "mobility"], equipment: ["floor"], seconds: 1200, difficulty: "easy" });
for (const item of matOnly.items) {
  const exercise = programModule.exports.exercises[item.exerciseId];
  if ((exercise.requiredEquipment ?? []).some((equipment) => equipment !== "floor")) throw new Error(`Mat-only plan selected ${item.exerciseId}`);
}

const order = ["warmup", "pre", "skill", "lab", "strength", "cooldown"];
const allReady = Object.fromEntries(Object.keys(programModule.exports.readiness).map((id) => [id, true]));
const advanced = customModule.exports.buildCustomSession({
  focuses: ["handstand", "core", "planche"],
  equipment: ["parallettes", "floor", "wall"],
  seconds: 1800,
  difficulty: "hard",
  readiness: allReady,
  blocks: { lab: true },
});
const seenOrder = [...new Set(advanced.items.map((item) => item.block))];
for (let index = 1; index < seenOrder.length; index += 1) {
  if (order.indexOf(seenOrder[index]) < order.indexOf(seenOrder[index - 1])) {
    throw new Error(`Unsafe Custom Session order: ${seenOrder.join("/")}`);
  }
}
if (!advanced.items.some((item) => ["planche", "horizontal-push"].includes(programModule.exports.exercises[item.exerciseId].primaryFocus))) {
  throw new Error("Planche Custom Session did not include planche-family work");
}

const rope = customModule.exports.buildCustomSession({ focuses: ["conditioning", "core"], equipment: ["floor", "rope"], seconds: 900, difficulty: "recommended", readiness: allReady });
if (!rope.items.some((item) => programModule.exports.exercises[item.exerciseId].requiredEquipment?.includes("rope"))) {
  throw new Error("Conditioning Custom Session did not select skipping rope when available");
}

const noRope = customModule.exports.buildCustomSession({ focuses: ["conditioning"], equipment: ["floor"], seconds: 900, difficulty: "easy", readiness: allReady });
if (!noRope.items.some((item) => item.exerciseId === "no-rope-penguin-taps")) {
  throw new Error("Floor-only Conditioning session did not select No-Rope Penguin Taps");
}

const gated = customModule.exports.buildCustomSession({ focuses: ["planche"], equipment: ["parallettes", "floor"], seconds: 900, difficulty: "hard", readiness: {} });
if (gated.items.some((item) => programModule.exports.exercises[item.exerciseId].gate)) {
  throw new Error("Custom Session bypassed an unmet readiness gate");
}
if (!gated.items.some((item) => programModule.exports.exercises[item.exerciseId].primaryFocus === "planche")) {
  throw new Error("Readiness-regressed Planche session lost its planche-specific training purpose");
}

const noPreparation = customModule.exports.buildCustomSession({ focuses: ["handstand"], equipment: ["parallettes", "floor", "wall"], seconds: 900, difficulty: "recommended", blocks: { preparation: false } });
if (!noPreparation.warnings.some((warning) => warning.toLowerCase().includes("preparation"))) {
  throw new Error("High-load skill without preparation did not produce a warning");
}

console.log(`Custom Session: ${generatedCombinations} focus/time/difficulty/equipment combinations, safe sequence, readiness gates, rope selection and mat-only filtering passed.`);
