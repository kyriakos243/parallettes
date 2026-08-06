import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workoutSource = readFileSync(join(projectRoot, "app/workouts.ts"), "utf8")
  .replaceAll("import.meta.env.BASE_URL", '"/parallettes/"');
const compiled = ts.transpileModule(workoutSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const loaded = { exports: {} };
const runModule = new Function("exports", "module", "require", compiled);
runModule(loaded.exports, loaded, () => {
  throw new Error("Unexpected runtime import in workout data");
});

const { exercises, universalWarmup, workouts } = loaded.exports;
const failures = [];
const media = { motion: 0, gifs: 0, video: 0 };

for (const exercise of Object.values(exercises)) {
  if (!exercise.target || !exercise.easier || exercise.cues.length !== 2) {
    failures.push(`${exercise.id}: incomplete instructions`);
  }
  if (!exercise.motion && !exercise.image && !exercise.video) {
    failures.push(`${exercise.id}: missing demonstration`);
  }
  if (exercise.motion) media.motion += 1;
  if (exercise.video) media.video += 1;

  if (exercise.image) {
    media.gifs += 1;
    const match = exercise.image.match(/exercises\/(.+)\.gif$/);
    if (!match) {
      failures.push(`${exercise.id}: invalid image path`);
    } else {
      const asset = join(projectRoot, "public/exercises", `${match[1]}.gif`);
      if (!existsSync(asset)) failures.push(`${exercise.id}: missing original GIF`);
    }
  }

  for (const swapId of exercise.swaps) {
    if (!exercises[swapId]) failures.push(`${exercise.id}: missing swap ${swapId}`);
  }
  if (exercise.category === "Cooldown" && exercise.swaps.length < 3) {
    failures.push(`${exercise.id}: fewer than four total cooldown choices`);
  }
}

const dayResults = workouts.map((day) => {
  const ids = [...universalWarmup, ...day.pre, ...day.core, day.skill, ...day.cooldown];
  for (const id of ids) {
    if (!exercises[id]) failures.push(`Day ${day.day}: missing ${id}`);
  }

  const seconds =
    universalWarmup.length * (45 + 15) +
    day.pre.length * 2 * (40 + 20) +
    day.core.length * 3 * (40 + 20) +
    5 * (30 + 30) +
    day.cooldown.length * 30;
  if (seconds !== 1500) failures.push(`Day ${day.day}: ${seconds} seconds`);
  return `Day ${day.day}: ${seconds / 60}:00`;
});

const presetCount = new Set(
  Object.values(exercises).map((exercise) => exercise.motion).filter(Boolean),
).size;

console.log(dayResults.join("\n"));
console.log(
  `${Object.keys(exercises).length} exercises; ${presetCount} smooth motion guides; ` +
  `${media.gifs} original GIF guides; ${media.video} licensed videos`,
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("All timing, exercise, swap, instruction and media checks passed.");
}
