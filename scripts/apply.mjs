// Preview (default) or write (--write) healed selectors into the spec files.
// A person runs this and reviews the result with `git diff`. Nothing is committed.
import fs from 'node:fs';
import path from 'node:path';

const write = process.argv.includes('--write');
const file = 'logs/self-heal/events.json';
if (!fs.existsSync(file)) { console.log('No healing events. Run the tests first.'); process.exit(0); }

// Latest successful heal per original selector.
const latest = new Map();
for (const e of JSON.parse(fs.readFileSync(file, 'utf8'))) {
  if (e.success && e.healedSelector) latest.set(e.originalSelector, e);
}
if (!latest.size) { console.log('No successful heals to apply.'); process.exit(0); }

const files = fs.readdirSync('tests').filter((f) => f.endsWith('.ts')).map((f) => path.join('tests', f));
console.log(write ? '\nWRITING changes\n' : '\nDRY RUN (no files changed)\n');
let changed = 0;
for (const [from, e] of latest) {
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (!src.includes(from)) continue;
    console.log(`${f}\n  - ${from}\n  + ${e.healedSelector}   (${e.confidence}%)`);
    if (write) fs.writeFileSync(f, src.split(from).join(e.healedSelector));
    changed++;
  }
}
console.log(changed ? (write ? '\nApplied. Review with: git diff\n' : '\nTo apply: npm run heal:apply -- --write\n') : 'No matching selector found in tests/.\n');
