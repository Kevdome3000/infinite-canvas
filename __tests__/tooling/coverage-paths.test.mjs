import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

function runCoverageFixture(t, sourceText, testText) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'canvas coverage ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'value.ts');
  writeFileSync(source, sourceText);
  writeFileSync(
    path.join(root, 'value.test.ts'),
    testText,
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
  const summary = JSON.parse(readFileSync(path.join(root, 'coverage/coverage-summary.json'), 'utf8'));
  return { result, summary, source };
}

test('ECS coverage maps fully exercised TypeScript to real files', (t) => {
  const { result, summary, source } = runCoverageFixture(
    t,
    'export const value = () => 42;\n',
    "import { value } from './value'; test('value', () => expect(value()).toBe(42));\n",
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(summary[source]?.lines.pct, 100);
  assert.deepEqual(Object.keys(summary).sort(), ['total', source].sort());
});

test('ECS coverage rejects an uncovered branch at its real-file threshold', (t) => {
  const { result, summary, source } = runCoverageFixture(
    t,
    'export const value = (enabled: boolean) => enabled ? 42 : 0;\n',
    "import { value } from './value'; test('value', () => expect(value(true)).toBe(42));\n",
  );
  const output = result.stdout + result.stderr;
  assert.equal(result.status, 1, output);
  assert.match(output, /Tests:\s+1 passed/);
  assert.ok(output.includes(`"${source}" coverage threshold for branches (100%) not met`), output);
  assert.doesNotMatch(output, /Coverage data for .* was not found/);
  assert.equal(summary[source]?.branches.pct, 50);
  assert.deepEqual(Object.keys(summary).sort(), ['total', source].sort());
});
