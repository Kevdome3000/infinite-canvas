import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

test('ECS coverage maps TypeScript to real files and enforces per-file thresholds', (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'canvas coverage ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'value.ts');
  writeFileSync(source, 'export const value = () => 42;\n');
  writeFileSync(
    path.join(root, 'value.test.ts'),
    "import { value } from './value'; test('value', () => expect(value()).toBe(42));\n",
  );
  const config = require('../../jest.ecs.config.js');
  const transform = Object.fromEntries(
    Object.entries(config.transform).map(([pattern, [module, options]]) => [
      pattern,
      [require.resolve(module.replace('<rootDir>', process.cwd())), options],
    ]),
  );
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--runInBand',
      '--no-cache',
      '--config',
      JSON.stringify({
        rootDir: root,
        transform,
        collectCoverage: true,
        collectCoverageFrom: ['value.ts'],
        coverageReporters: ['json-summary'],
        coverageThreshold: {
          [source]: { statements: 100, branches: 100, functions: 100, lines: 100 },
        },
      }),
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const summary = JSON.parse(readFileSync(path.join(root, 'coverage/coverage-summary.json'), 'utf8'));
  assert.equal(summary[source]?.lines.pct, 100);
  assert.deepEqual(Object.keys(summary).sort(), ['total', source].sort());
});
