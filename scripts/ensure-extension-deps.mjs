import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'devpilot-ai');
// Stored inside node_modules so that deleting/reinstalling it regenerates the stamp.
const stampPath = path.join(extension, 'node_modules', '.devpilot-install-stamp');

const fingerprint = async () => {
  const hash = createHash('sha256');
  for (const name of ['package.json', 'package-lock.json']) hash.update(await readFile(path.join(extension, name)));
  hash.update(`\n${process.platform}-${process.arch}-${process.version}`);
  return hash.digest('hex');
};

let expected;
try { expected = await fingerprint(); }
catch (error) { console.error(`DevPilot AI: cannot read devpilot-ai/package.json or package-lock.json: ${error.message}`); process.exit(1); }

let installed = '';
try { installed = (await readFile(stampPath, 'utf8')).trim(); } catch { /* not installed yet */ }
if (installed === expected) {
  console.log('DevPilot AI: extension dependencies already match devpilot-ai/package-lock.json; skipping npm ci.');
  process.exit(0);
}

console.log('DevPilot AI: installing extension dependencies (devpilot-ai)...');
const command = process.platform === 'win32' ? 'npm.cmd ci' : 'npm ci';
const result = spawnSync(command, { cwd: extension, stdio: 'inherit', shell: true, env: process.env });
if (result.error) { console.error(result.error.message); process.exit(1); }
if (result.status !== 0) process.exit(result.status ?? 1);
await writeFile(stampPath, expected + '\n');
