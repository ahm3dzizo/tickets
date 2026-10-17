import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const previous = process.argv[2];
if (!previous) throw new Error('Previous deployment SHA required');
const previousSchema = execFileSync('git', ['show', `${previous}:prisma/schema.prisma`], {encoding:'utf8'});
const currentSchema = readFileSync('prisma/schema.prisma', 'utf8');
// Add only the per-supervisor work details column; never reset or migrate prior data.
const beforeColumn = currentSchema.replace(/^  supervisorWorkDetails Json         @default\("\{\}"\)\n/m, '');
if (previousSchema.trim() !== beforeColumn.trim()) {
  throw new Error('Unexpected database schema changes; contractor metadata deploy blocked');
}
if (process.argv.includes('--check')) process.exit(0);
execFileSync('npx', ['prisma','db','execute','--schema','prisma/schema.prisma',
  '--file','scripts/sql/supervisor-work-details.sql'], {stdio:'inherit'});
