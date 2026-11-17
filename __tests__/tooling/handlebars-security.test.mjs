import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const tsJestRequire = createRequire(require.resolve('ts-jest'));
const Handlebars = tsJestRequire('handlebars');

test('ts-jest resolves a Handlebars version with all three compiler fixes', () => {
  const version = tsJestRequire('handlebars/package.json').version;
  const [major, minor, patch] = version.split('.').map(Number);
  assert(
    major > 4 || (major === 4 && (minor > 7 || (minor === 7 && patch >= 10))),
    `ts-jest still resolves vulnerable Handlebars ${version}`,
  );
});

test('compiler rejects a tampered block parameter count before executing it', () => {
  const source = '{{#if ok}}accepted{{/if}}';
  assert.equal(Handlebars.compile(Handlebars.parse(source))({ ok: true }), 'accepted');
  const ast = Handlebars.parse(source);
  ast.body[0].program.blockParams = {
    length: "(()=>{throw new Error('HANDLEBARS_AST_SENTINEL_EXECUTED')})()",
  };
  assert.throws(
    () => Handlebars.compile(ast)({ ok: true }),
    /Invalid AST/,
  );
  assert.throws(() => Handlebars.precompile(ast), /Invalid AST/);
});

test('prototype constructor remains hidden with prototype methods enabled', () => {
  const render = Handlebars.compile('{{lookup (lookup fn "__proto__") "constructor"}}');
  assert.equal(render({ fn() {} }, { allowProtoMethodsByDefault: true }), '');
});

test('precompiled static text cannot terminate an inline script', () => {
  const source = 'before</script><script>HANDLEBARS_INLINE_SENTINEL</script>after';
  const compiled = Handlebars.precompile(source);
  assert.equal(/<\/script/iu.test(compiled), false);
  const specification = vm.runInNewContext(`(${compiled})`);
  assert.equal(Handlebars.template(specification)({}), source);
});

test('the patched compiler retains normal ts-jest config generation', (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'canvas-ts-jest-config-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [require.resolve('ts-jest/cli.js'), 'config:init'], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = readFileSync(path.join(cwd, 'jest.config.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(generated, { require, module });
  assert.equal(module.exports.testEnvironment, 'node');
  assert.equal(typeof module.exports.transform, 'object');
  assert(Object.keys(module.exports.transform).length > 0);
});
