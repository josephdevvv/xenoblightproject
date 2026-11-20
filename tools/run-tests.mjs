// Runs tests/*.test.ts with Node's built-in test runner. TypeScript is bundled with esbuild, which
// already ships with Vite - no extra test dependency. Usage: npm test
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'node_modules', '.cache', 'xenoblight-tests');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entries = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts')).map((f) => join(root, 'tests', f));
await build({
  entryPoints: entries,
  outdir: outDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  // Game code that touches the browser / Phaser is not imported by the tests; keep Phaser external just in case.
  external: ['phaser'],
  define: { 'import.meta.env.DEV': 'false' },
  logLevel: 'warning',
});

const files = readdirSync(outDir).filter((f) => f.endsWith('.mjs')).map((f) => join(outDir, f));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
