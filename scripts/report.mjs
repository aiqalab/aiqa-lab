// Prints a human-readable summary of the last test run's healing activity.
// Usage: npm run report
import fs from "node:fs";
import path from "node:path";

const dir = process.env.SELF_HEALING_LOG_DIR ?? "logs/self-healing";
const file = path.join(dir, "summary.json");

if (!fs.existsSync(file)) {
  console.log("No healing data yet. Run `npm test` first.");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
console.log(`\nSelf-healing report (${data.generatedAt})`);
console.log(`Attempts: ${data.attempts}  Healed: ${data.healed}  Failed: ${data.failed}\n`);

for (const e of data.events) {
  const mark = e.success ? "HEALED" : "FAILED";
  console.log(`[${mark}] ${e.action}: ${e.originalSelector}`);
  if (e.success) {
    console.log(`   -> ${e.healedSelector}  (${e.confidence}%, ${e.provider})`);
    if (e.reasoning) console.log(`   why: ${e.reasoning}`);
  } else if (e.error) {
    console.log(`   reason: ${e.error}`);
  }
}

const fixes = data.events.filter((e) => e.success);
if (fixes.length) {
  console.log("\nSuggested permanent fixes (update your page objects):");
  for (const f of fixes) console.log(`  - ${f.originalSelector}  =>  ${f.healedSelector}`);
}
console.log();
