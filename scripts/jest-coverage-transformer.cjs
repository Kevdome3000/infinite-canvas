const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { fileURLToPath } = require('node:url');
const tsJest = require('ts-jest').default;

const adapterKey = createHash('sha256')
  .update(readFileSync(__filename))
  .digest('hex');
const inlineMap = /sourceMappingURL=data:application\/json;charset=utf-8;base64,([^\s]+)/;

module.exports = {
  createTransformer(options) {
    const transformer = tsJest.createTransformer(options);
    return {
      getCacheKey(...args) {
        return transformer.getCacheKey(...args) + adapterKey;
      },
      process(...args) {
        const result = transformer.process(...args);
        // ts-jest emits file URLs. Jest 29's Istanbul source-map store treats
        // them as relative paths, so real-file coverage thresholds find no data.
        // Preserve every mapping and source body; only decode local file URLs.
        return {
          ...result,
          code: result.code.replace(inlineMap, (match, encoded) => {
            const map = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
            map.sources = map.sources.map((source) =>
              source.startsWith('file:') ? fileURLToPath(source) : source,
            );
            return match.replace(encoded, Buffer.from(JSON.stringify(map)).toString('base64'));
          }),
        };
      },
    };
  },
};
