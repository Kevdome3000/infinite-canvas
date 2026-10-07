# Serialization fixture migration

Frozen upstream: `1a82d8aa3cfaade982d8ee10fa54c6e9be5899b0`.

The retired fixture failed before assertions (`ConnectionPlugin` is absent). Its
`entityToSerializedNodes` entry point is commented out in current source, and its
mock Commands never established a real round trip. No production legacy API is
restored solely to satisfy this test.

| Original intent                  | Current assertion                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream flex container settings | A native rect with display:flex preserves gap/padding/alignment/direction in two independent ECS worlds; the Flex marker is present, edited gap is exported and restored. Actual Yoga geometry and spacing updates are covered by browser/layout-retirement.spec.ts. |
| Connection source/target         | Polyline document `fromId`/`toId` retain stable document IDs; actual Binding.from/to resolve to the new world's source/target entities, both marked Binded.                                                                                                          |
| Orthogonal connection            | `edgeStyle: orthogonalEdgeStyle`, `orthogonal: true`; generated Polyline geometry has finite points, multiple segments, and every segment is axis aligned.                                                                                                           |
| Dashed connection                | `strokeDasharray` wire value maps to actual Stroke.dasharray; an edit is exported and restored as [12,6].                                                                                                                                                            |
| Serialize/deserialize round trip | API.getNodes → JSON stringify/parse → API.replaceDocument in a fresh real ECS world, with document equality and component/binding assertions. No mock Commands or arbitrary sleeps.                                                                                  |

The current wire type is `polyline` (an EdgeSerializedNode), not `connection` or
`edge`. Internal ECS numeric IDs are deliberately not the serialization contract.
The fixture uses a headless DOM adapter: it tests document/ECS semantics, not GPU
rendering. Chromium/WebGL and native input evidence are tracked separately.

The fork LayoutPlugin and column-layout wire are retired by explicit owner decision. Complete document replacement and raw node updates reject that retired type before mutation. Historical HTML stack metadata remains opaque data and does not inject layout or rectangle geometry. No document conversion is performed.
