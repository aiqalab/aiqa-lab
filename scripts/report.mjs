import fs from 'node:fs';

const file = 'logs/self-heal/events.json';
if (!fs.existsSync(file)) { console.log('No healing events yet. Run the tests first.'); process.exit(0); }
const events = JSON.parse(fs.readFileSync(file, 'utf8'));
const ok = events.filter((e) => e.success).length;
console.log(`\nSelf-heal report: ${events.length} attempt(s), ${ok} healed, ${events.length - ok} rejected/failed\n`);
for (const e of events) {
  console.log(`${e.success ? 'HEALED  ' : 'REJECTED'} ${e.action}  ${e.originalSelector}`);
  if (e.healedSelector) console.log(`         -> ${e.healedSelector}  (${e.confidence}%)`);
  console.log(`         ${e.reasoning ?? ''} ${e.reason ? '[' + e.reason + ']' : ''}`.trimEnd());
}
console.log('');
