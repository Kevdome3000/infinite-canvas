import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import ts from 'typescript';

test('GLB exports can be passed directly to browser Blob and ArrayBuffer consumers', () => {
  const file = path.resolve('__tests__/tooling/glb-consumer.ts');
  const source = `
    import { exportMeshesToGlb } from '../../packages/ecs/src/utils/gltf/export-glb';
    import { API, ExportFormat } from '../../packages/ecs/src/API';
    const bytes = exportMeshesToGlb([]);
    new Blob([bytes], { type: 'model/gltf-binary' });
    const buffer: ArrayBuffer = bytes.buffer;
    void buffer;
    declare const api: API;
    new Blob([api.export({ format: ExportFormat.GLB, download: false })]);
  `;
  const options = {
    noEmit: true,
    skipLibCheck: true,
    experimentalDecorators: true,
    esModuleInterop: true,
    target: ts.ScriptTarget.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    name === file
      ? ts.createSourceFile(name, source, languageVersion, true)
      : getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([file], options, host);
  const diagnostics = program.getSemanticDiagnostics(program.getSourceFile(file));
  assert.deepEqual(
    diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    ),
    [],
  );
});
