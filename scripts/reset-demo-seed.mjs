// Reset the 5 demo seed tickets (supabase_seed.sql) to their starting tier, status and 72h clocks,
// e.g. after a "Simulate +3 Days" demo. Dry run by default; --apply writes.
// Usage: npm run demo:reset          (dry run: shows what drifted)
//        npm run demo:reset -- --apply
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const flag = args.find((a) => a === '--apply');
const projectDir = args.find((a) => a !== '--apply') || process.cwd();
const require = createRequire(path.join(projectDir, 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(
  fs.readFileSync(path.join(projectDir, '.env.local'), 'utf8')
    .split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const H = 3600e3, now = Date.now(), iso = (ms) => new Date(now + ms).toISOString();
const SEED = {
  'CSR-48291': { current_handler_role: 'TEACHER', stage_entered_at: iso(-30 * H), stage_deadline: iso(42 * H), status: 'IN_PROGRESS', escalated_to_super_admin: false },
  'CSR-83920': { current_handler_role: 'TEACHER', stage_entered_at: iso(-60 * H), stage_deadline: iso(12 * H), status: 'ACKNOWLEDGED', escalated_to_super_admin: false },
  'CSR-19402': { current_handler_role: 'FACULTY', stage_entered_at: iso(-10 * H), stage_deadline: iso(62 * H), status: 'IN_PROGRESS', escalated_to_super_admin: false },
  'CSR-74109': { current_handler_role: 'ADMINISTRATIVE', stage_entered_at: iso(-15 * H), stage_deadline: iso(57 * H), status: 'IN_PROGRESS', escalated_to_super_admin: true },
  'CSR-55201': { current_handler_role: 'TEACHER', stage_entered_at: iso(-5 * H), stage_deadline: iso(67 * H), status: 'UNACKNOWLEDGED', escalated_to_super_admin: false },
};

const { data, error } = await db.from('complaint_groups')
  .select('tracking_id, current_handler_role, status, stage_deadline, escalated_to_super_admin')
  .in('tracking_id', Object.keys(SEED));
if (error) { console.log('read error', error.message); process.exit(1); }
for (const row of data) {
  const want = SEED[row.tracking_id];
  const drift = row.current_handler_role !== want.current_handler_role || row.status !== want.status;
  console.log(`${row.tracking_id}: now ${row.current_handler_role}/${row.status} -> seed ${want.current_handler_role}/${want.status}${drift ? '  DRIFTED' : ''}`);
}
if (flag === '--apply') {
  for (const [id, values] of Object.entries(SEED)) {
    const { error: e } = await db.from('complaint_groups').update(values).eq('tracking_id', id);
    console.log(`restore ${id}: ${e ? 'ERROR ' + e.message : 'ok'}`);
  }
}
