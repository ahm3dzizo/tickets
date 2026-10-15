import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const previous = process.argv[2];
if (!previous) throw new Error('Previous deployment SHA required');
const oldSchema = execFileSync('git', ['show', `${previous}:prisma/schema.prisma`], {encoding: 'utf8'});
const current = readFileSync('prisma/schema.prisma', 'utf8');
// Fail closed: only the two outbox columns and approval model may change in this release.
const withoutApprovals = current
  .replace(/^  approvalRequestId String\?\n  snapshot    Json\?\n/m, '')
  .replace(/\n\/\/ A single batch can contain several tickets[\s\S]*?\nmodel TicketClosureApproval \{[\s\S]*?\n\}\n/, '');
if (oldSchema.trim() !== withoutApprovals.trim()) {
  throw new Error('Unexpected Prisma schema change; refuse unsafe production migration');
}
if (process.argv.includes('--check')) process.exit(0);
execFileSync('npx', ['prisma', 'db', 'execute', '--schema', 'prisma/schema.prisma',
  '--file', 'scripts/sql/closure-approvals.sql'], {stdio: 'inherit'});
