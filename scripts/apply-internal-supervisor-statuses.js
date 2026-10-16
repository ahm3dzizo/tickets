import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const previous = process.argv[2];
if (!previous) throw new Error('Previous deployment SHA required');
const before = execFileSync('git', ['show', `${previous}:prisma/schema.prisma`], { encoding: 'utf8' });
const current = readFileSync('prisma/schema.prisma', 'utf8');
const withoutNewColumn = current.replace(/^  supervisorStatuses   Json         @default\("\{\}"\)\n/m, '');
if (before.trim() !== withoutNewColumn.trim()) {
  throw new Error('Unexpected schema differences: abort internal-status migration');
}
if (process.argv.includes('--check')) process.exit(0);
execFileSync('npx', ['prisma','db','execute','--schema','prisma/schema.prisma',
  '--file','scripts/sql/internal-supervisor-statuses.sql'], {stdio:'inherit'});
