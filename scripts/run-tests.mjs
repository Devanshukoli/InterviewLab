#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const TEST_BYOK_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function collectTestFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectTestFiles(full, acc);
    } else if (name.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

const roots = ['src/lib', 'server/tests'];
const files = roots.flatMap((root) => collectTestFiles(root)).sort();

if (files.length === 0) {
  console.error('No *.test.ts files found under src/lib or server/tests');
  process.exit(1);
}

const env = { ...process.env };
env.NODE_ENV = env.NODE_ENV ?? 'test';
if (!String(env.BYOK_ENCRYPTION_KEY ?? '').trim()) {
  env.BYOK_ENCRYPTION_KEY = TEST_BYOK_KEY;
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);