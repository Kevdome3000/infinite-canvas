import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import {
  svgElementsToExtrudedNodes,
  svgElementsToSerializedNodes,
} from '../../packages/ecs/src/utils/deserialize/svg';

const serializerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'XMLSerializer');
beforeAll(() => {
  Object.defineProperty(globalThis, 'XMLSerializer', {
    configurable: true,
    value: new JSDOM('').window.XMLSerializer,
  });
});
afterAll(() => {
  if (serializerDescriptor) {
    Object.defineProperty(globalThis, 'XMLSerializer', serializerDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'XMLSerializer');
  }
});

const root = (body: string) => new JSDOM(
  `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
  { contentType: 'image/svg+xml' },
).window.document.documentElement as unknown as SVGSVGElement;

it('requires a decimal separator between variable-length integer and fractional runs', () => {
  // A deterministic complexity guard: an optional separator lets both digit
  // repetitions consume the same run, causing quadratic rejection backtracking.
  // Inspect actual validator literals, without executing oversized input.
  const source = ts.createSourceFile('svg.ts', readFileSync(join(
    __dirname, '../../packages/ecs/src/utils/deserialize/svg.ts',
  ), 'utf8'), ts.ScriptTarget.Latest, true);
  const numericValidators: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isRegularExpressionLiteral(node) && node.text.includes('(?:px)?')) {
      numericValidators.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(numericValidators.length).toBeGreaterThanOrEqual(4);
  for (const validator of numericValidators) {
    expect(validator).not.toContain(String.raw`\d+\.?\d*`);
  }
});

it.each(['2', '2.', '2.5', '.5', '+2', '-2', '2e+1', '2E-1', '2px'])(
  'imports supported radial gradient coordinate %s', (coordinate) => {
    const svg = root(`<defs><radialGradient id="g" gradientUnits="userSpaceOnUse"
      cx="${coordinate}" cy="10" r="5"><stop offset="0" stop-color="red"/>
      <stop offset="1" stop-color="blue"/></radialGradient></defs>
      <rect id="shape" width="20" height="20" fill="url(#g)"/>`);
    const node = svgElementsToSerializedNodes(Array.from(svg.children) as SVGElement[])
      .find((item) => item.id === 'shape');
    expect(node?.fills?.[0]).toMatchObject({ type: 'gradient' });
    expect(node?.fills?.[0]?.value).toContain(
      `at ${Number(coordinate.replace(/px$/, ''))}px 10px`,
    );
  },
);

it.each(['2x', '2..5', '.', '2e', '2pxx'])(
  'rejects malformed radial gradient coordinate %s', (coordinate) => {
    const svg = root(`<defs><radialGradient id="g" gradientUnits="userSpaceOnUse"
      cx="${coordinate}" cy="10" r="5"><stop offset="0" stop-color="red"/>
      <stop offset="1" stop-color="blue"/></radialGradient></defs>
      <rect id="shape" width="20" height="20" fill="url(#g)"/>`);
    const node = svgElementsToSerializedNodes(Array.from(svg.children) as SVGElement[])
      .find((item) => item.id === 'shape');
    expect(node?.fills?.[0]?.type).not.toBe('gradient');
  },
);

it.each(['2', '2.', '2.5', '.5', '2e+0', '2px'])(
  'extrudes a stroke with supported dash length and offset %s', (value) => {
    const svg = root(`<path id="shape" d="M0 0 H20" fill="none" stroke="red"
      stroke-width="2" stroke-dasharray="${value} 2" stroke-dashoffset="-${value}"/>`);
    expect(svgElementsToExtrudedNodes(svg, 12)[0]).toMatchObject({ extrude3d: 12 });
  },
);

it.each(['stroke-dasharray', 'stroke-dashoffset'])(
  'retains a stroke in 2D when %s is malformed', (attribute) => {
    const svg = root(`<path id="shape" d="M0 0 H20" fill="none" stroke="red"
      stroke-width="2" ${attribute}="22x"/>`);
    expect(svgElementsToExtrudedNodes(svg, 12)[0]).not.toHaveProperty('extrude3d');
  },
);

it.each(['2', '2.', '2.5', '.5', '+2', '-2', '2e+1', '2E-1', '2px'])(
  'preserves numeric bounds coordinate %s in radial image fallback', (coordinate) => {
    const svg = root(`<defs><radialGradient id="g" gradientTransform="scale(2)"
      cx="10" cy="10" r="5"><stop offset="0" stop-color="red"/>
      <stop offset="1" stop-color="blue"/></radialGradient></defs>
      <rect id="shape" x="${coordinate}" width="20" height="20" fill="url(#g)"/>`);
    const node = svgElementsToSerializedNodes(Array.from(svg.children) as SVGElement[])
      .find((item) => item.id === 'shape');
    const value = String(node?.fills?.[0]?.value);
    expect(value).toContain('data:image/svg+xml');
    expect(decodeURIComponent(value)).toContain(
      `viewBox="${Number(coordinate.replace(/px$/, ''))} 0 20 20"`,
    );
  },
);

it.each(['2x', '2..5', '.', '2e', '2pxx'])(
  'rejects malformed radial image bounds coordinate %s', (coordinate) => {
    const svg = root(`<defs><radialGradient id="g" gradientTransform="scale(2)"
      cx="10" cy="10" r="5"><stop offset="0" stop-color="red"/>
      <stop offset="1" stop-color="blue"/></radialGradient></defs>
      <rect id="shape" x="${coordinate}" width="20" height="20" fill="url(#g)"/>`);
    const node = svgElementsToSerializedNodes(Array.from(svg.children) as SVGElement[])
      .find((item) => item.id === 'shape');
    expect(String(node?.fills?.[0]?.value)).not.toContain('data:image/svg+xml');
  },
);
