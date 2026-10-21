import {
  decodeRadianceHDR,
  ENV_ATLAS_HEIGHT,
  ENV_ATLAS_WIDTH,
  prefilterEnvironment,
} from '../../packages/ecs/src/utils/environment-map';

it('decodes Radiance scanline RLE into linear HDR pixels', () => {
  const header = new TextEncoder().encode(
    '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 8\n',
  );
  const body = new Uint8Array([
    2, 2, 0, 8, 136, 128, 136, 64, 136, 32, 136, 129,
  ]);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  const environment = decodeRadianceHDR(bytes);
  expect([environment.width, environment.height]).toEqual([8, 1]);
  expect(environment.pixels.slice(0, 4)).toEqual(
    new Float32Array([128.5 / 128, 64.5 / 128, 32.5 / 128, 1]),
  );
  expect(environment.pixels.slice(-4)).toEqual(environment.pixels.slice(0, 4));
  expect(() => decodeRadianceHDR(bytes.subarray(0, bytes.length - 1))).toThrow(
    'Truncated',
  );
});

it('prefilters constant HDR radiance into all roughness levels without dimming it', () => {
  const width = 16;
  const height = 8;
  const pixels = new Float32Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([2, 1, 0.5, 1], i);
  const atlas = prefilterEnvironment({ width, height, pixels });
  expect(atlas.pixels).toHaveLength(ENV_ATLAS_WIDTH * ENV_ATLAS_HEIGHT * 4);
  let top = 0;
  for (let level = 0; level < 5; level++) {
    const offset = (top * ENV_ATLAS_WIDTH + 1) * 4;
    const multiplier = (atlas.pixels[offset + 3] / 255) * 16;
    expect((atlas.pixels[offset] / 255) * multiplier).toBeCloseTo(2, 1);
    expect((atlas.pixels[offset + 1] / 255) * multiplier).toBeCloseTo(1, 1);
    top += 64 >> level;
  }
  expect(atlas.irradiance[0]).toBeGreaterThan(0);
});

function hdrFixture(resolution: string, body: number[] = []) {
  const header = new TextEncoder().encode(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n${resolution}\n`,
  );
  return new Uint8Array([...header, ...body]);
}

it.each([
  ['not Radiance\n', 'Invalid Radiance header'],
  ['#?RADIANCE', 'Truncated Radiance header'],
  ['#?RADIANCE\nFORMAT=32-bit_rle_rgbe', 'Truncated Radiance header'],
  ['#?RADIANCE\nFORMAT=32-bit_rle_xyze\n\n-Y 1 +X 1\n', 'Unsupported Radiance pixel format'],
  ['#?RADIANCE\n\n-Y 1 +X 1\n', 'Unsupported Radiance pixel format'],
  ['#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n+X 1 -Y 1\n', 'Unsupported Radiance image orientation'],
])('rejects malformed header %p before decoding pixels', (header, message) => {
  expect(() => decodeRadianceHDR(new TextEncoder().encode(header))).toThrow(message);
});

it.each(['-Y 0 +X 8', '-Y 1 +X 0', '-Y 4097 +X 4096', '-Y 9999999999999999999999 +X 8'])(
  'rejects invalid dimensions %s before allocating image storage',
  (resolution) => {
    expect(() => decodeRadianceHDR(hdrFixture(resolution))).toThrow('Invalid Radiance image size');
  },
);

it.each<[number[], string]>([
  [[0], 'Invalid Radiance RLE literal'],
  [[9], 'Invalid Radiance RLE literal'],
  [[137, 128], 'Invalid Radiance RLE run'],
  [[135, 128, 130, 128], 'Invalid Radiance RLE run'],
  [[135, 128, 2], 'Invalid Radiance RLE literal'],
  [[136], 'Truncated Radiance pixels'],
  [[8, 1, 2], 'Truncated Radiance pixels'],
])('rejects malformed scanline channel %p without accepting partial pixels', (channel, message) => {
  expect(() => decodeRadianceHDR(hdrFixture('-Y 1 +X 8', [2, 2, 0, 8, ...channel]))).toThrow(message);
});

it('decodes literal RLE channels and zero-exponent black without cross-channel contamination', () => {
  const environment = decodeRadianceHDR(hdrFixture('-Y 1 +X 8', [
    2, 2, 0, 8,
    8, 0, 1, 2, 3, 4, 5, 6, 7,
    136, 64, 136, 32,
    1, 0, 135, 129,
  ]));
  expect([...environment.pixels.slice(0, 4)]).toEqual([0, 0, 0, 1]);
  expect([...environment.pixels.slice(-4)]).toEqual([7.5 / 128, 64.5 / 128, 32.5 / 128, 1]);
});

it.each<[string, number[]]>([
  ['-Y 2 +X 2', [10, 20, 30, 40]],
  ['-Y 2 -X 2', [20, 10, 40, 30]],
  ['+Y 2 +X 2', [30, 40, 10, 20]],
  ['+Y 2 -X 2', [40, 30, 20, 10]],
])('normalizes raw pixel orientation %s to north-first rows', (resolution, expected) => {
  const body = [10, 20, 30, 40].flatMap((red) => [red, 0, 0, 129]);
  const environment = decodeRadianceHDR(hdrFixture(resolution, body));
  expect([environment.width, environment.height]).toEqual([2, 2]);
  expect([0, 1, 2, 3].map((pixel) => environment.pixels[pixel * 4])).toEqual(
    expected.map((red) => (red + 0.5) / 128),
  );
  expect(() => decodeRadianceHDR(hdrFixture(resolution, body.slice(0, -1)))).toThrow('Truncated Radiance pixels');
});
