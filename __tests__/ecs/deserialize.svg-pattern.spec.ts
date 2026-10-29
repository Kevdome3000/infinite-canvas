import { JSDOM } from 'jsdom';
import { deserializePattern } from '../../packages/ecs/src/utils/deserialize/svg-pattern';

function pattern(children: string, definitions = '') {
  const dom = new JSDOM(
    `<svg xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"><defs>${definitions}
    <pattern id="tile" width="20" height="20" patternUnits="userSpaceOnUse">
      ${children}
    </pattern></defs></svg>`,
    { contentType: 'image/svg+xml' },
  );
  const tile = dom.window.document.getElementById(
    'tile',
  ) as unknown as SVGElement;
  return deserializePattern(tile, []);
}

it.each(['png', 'jpeg', 'jpg', 'webp', 'avif'])(
  'preserves bounded embedded %s image URLs',
  (mime) => {
    const url = `data:image/${mime};base64,AAAA`;
    expect(
      decodeURIComponent(pattern(`<image href="${url}"/>`)!.image as string),
    ).toContain(url);
  },
);

it.each([
  'https://example.com/image.png',
  'data:image/svg+xml;base64,AAAA',
  'data:text/html;base64,AAAA',
  'javascript:alert(1)',
])('rejects unsupported image URL %s', (url) => {
  expect(pattern(`<image href="${url}"/>`)).toBeUndefined();
});

it.each([
  '<image href="data:image/png;base64,AAAA" onload="alert(1)"/>',
  '<rect onclick="alert(1)"/>',
  '<rect style="fill:url(https://example.com/paint.svg#paint)"/>',
  '<rect fill="url(https://example.com/paint.svg#paint)"/>',
])('rejects active or external tile attributes: %s', (child) => {
  expect(pattern(child)).toBeUndefined();
});

it('embeds a local radial gradient using a namespaced inherited reference', () => {
  const result = pattern(
    '<rect fill="url(#paint)"/>',
    '<radialGradient id="base"><stop stop-color="red"/></radialGradient>' +
      '<radialGradient id="paint" xlink:href="#base"/>',
  );
  expect(result).toBeDefined();
  const tile = decodeURIComponent(result!.image as string);
  expect(tile).toContain('id="base"');
  expect(tile).toContain('id="paint"');
});

it.each([
  '<linearGradient id="paint" href="#paint"/>',
  '<linearGradient id="paint" href="#base"/><radialGradient id="base" href="#paint"/>',
  '<linearGradient id="paint" href="https://example.com/gradient.svg#base"/>',
  '<linearGradient id="paint" onload="alert(1)"/>',
  '<linearGradient id="paint"><stop style="stop-color:url(https://example.com)"/></linearGradient>',
])('rejects unsafe gradient definitions: %s', (definitions) => {
  expect(pattern('<rect fill="url(#paint)"/>', definitions)).toBeUndefined();
});

it('accepts twelve gradient references and rejects a thirteenth', () => {
  const definitions = (length: number) =>
    Array.from(
      { length },
      (_, i) =>
        `<linearGradient id="g${i}"${
          i + 1 < length ? ` href="#g${i + 1}"` : ''
        }/>`,
    ).join('');
  expect(pattern('<rect fill="url(#g0)"/>', definitions(12))).toBeDefined();
  expect(pattern('<rect fill="url(#g0)"/>', definitions(13))).toBeUndefined();
});

it('bounds each embedded URL and the combined serialized tile', () => {
  const prefix = 'data:image/png;base64,';
  const url = prefix + 'A'.repeat(750_000 - prefix.length);
  expect(pattern(`<image href="${url}"/>`)).toBeDefined();
  expect(pattern(`<image href="${url}A"/>`)).toBeUndefined();
  expect(
    pattern(`<image href="${url}"/><image href="${url}"/>`),
  ).toBeUndefined();
});

it('bounds tile elements and gradient stops', () => {
  expect(pattern('<rect/>'.repeat(256))).toBeDefined();
  expect(pattern('<rect/>'.repeat(257))).toBeUndefined();
  const gradient = (count: number) =>
    `<linearGradient id="paint">${'<stop/>'.repeat(count)}</linearGradient>`;
  expect(pattern('<rect fill="url(#paint)"/>', gradient(256))).toBeDefined();
  expect(pattern('<rect fill="url(#paint)"/>', gradient(257))).toBeUndefined();
});
