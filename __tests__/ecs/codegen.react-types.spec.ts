import * as ts from 'typescript';
import { emitReactTailwind } from '../../packages/ecs/src/utils/codegen/emit-react-tailwind';
import type {
  CodeIR,
  CodeNode,
} from '../../packages/ecs/src/utils/codegen/types';

describe('React codegen types', () => {
  it('imports CSSProperties for a visibility-only component and emits valid TSX', () => {
    const node = (extra: Partial<CodeNode> = {}): CodeNode => ({
      id: 'node',
      role: 'container',
      style: {},
      children: [],
      ...extra,
    });
    const ir: CodeIR = {
      variables: {},
      variablesMode: 'resolved',
      components: [
        {
          name: 'Card',
          templateId: 'card',
          root: node({
            bindings: [{ target: 'visibility', prop: 'visibility' }],
          }),
          props: [
            {
              name: 'visibility',
              target: 'visibility',
              defaultValue: { literal: 'visible' },
            },
          ],
        },
      ],
      roots: [node({ instanceOf: 'Card' })],
    };
    const code = emitReactTailwind(ir);

    // A minimal React/JSX contract keeps compilation independent of workspace
    // React versions and prevents ambient test types from hiding missing imports.
    const virtualRoot = '/__canvas_codegen_type_test__';
    const sources: Record<string, string> = {
      [`${virtualRoot}/Design.tsx`]: code,
      [`${virtualRoot}/react.d.ts`]: `
        export interface CSSProperties {
          visibility?: 'visible' | 'hidden' | 'collapse' | 'inherit';
        }
      `,
      [`${virtualRoot}/jsx.d.ts`]: `
        declare namespace JSX {
          interface IntrinsicElements {
            div: { style?: import('react').CSSProperties };
          }
        }
      `,
    };
    const options: ts.CompilerOptions = {
      jsx: ts.JsxEmit.Preserve,
      target: ts.ScriptTarget.ESNext,
      strict: true,
      noEmit: true,
      types: [],
    };
    const compile = (source: string) => {
      const host = ts.createCompilerHost(options);
      const getSourceFile = host.getSourceFile.bind(host);
      host.getSourceFile = (fileName, languageVersion, ...args) =>
        sources[fileName] !== undefined
          ? ts.createSourceFile(
              fileName,
              fileName === `${virtualRoot}/Design.tsx` ? source : sources[fileName],
              languageVersion,
            )
          : getSourceFile(fileName, languageVersion, ...args);
      // Resolve imports only against this fixture. `types: []` blocks ambient
      // inclusion, but does not stop an explicit React import finding @types/react.
      host.resolveModuleNames = (moduleNames) =>
        moduleNames.map((name) =>
          name === 'react'
            ? {
                resolvedFileName: `${virtualRoot}/react.d.ts`,
                extension: ts.Extension.Dts,
              }
            : undefined,
        );
      const program = ts.createProgram(Object.keys(sources), options, host);
      expect(
        program.getSourceFiles().some((file) => file.fileName.includes('/@types/react/')),
      ).toBe(false);
      return ts.getPreEmitDiagnostics(program).map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
    };
    expect(compile(code)).toEqual([]);
    // Negative control: the original emitter omission must still fail semantic
    // type checking; isolation must not accidentally provide a global type.
    expect(
      compile(code.replace("import type { CSSProperties } from 'react';", '')),
    ).toContain("Cannot find name 'CSSProperties'.");
    expect(code).toContain("import type { CSSProperties } from 'react';");
    expect(code).toContain("visibility?: CSSProperties['visibility'];");
  });
});
