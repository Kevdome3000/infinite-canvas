# Serialization fixture migration

Frozen upstream: `53691a32d9fb4b4986bb23467039f3d0f752eb29`.

The retired fixture failed before assertions (`ConnectionPlugin` is absent). Its
`entityToSerializedNodes` entry point is commented out in current source, and its
mock Commands never established a real round trip. No production legacy API is
restored solely to satisfy this test.

| Original intent                               | Current assertion                                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ColumnLayout gap/padding/alignment/autolayout | Real ColumnLayout components preserve all four fields in two independent ECS worlds; edited gap is exported and restored.                                                           |
| Connection source/target                      | Polyline document `fromId`/`toId` retain stable document IDs; actual Binding.from/to resolve to the new world's source/target entities, both marked Binded.                         |
| Orthogonal connection                         | `edgeStyle: orthogonalEdgeStyle`, `orthogonal: true`; generated Polyline geometry has finite points, multiple segments, and every segment is axis aligned.                          |
| Dashed connection                             | `strokeDasharray` wire value maps to actual Stroke.dasharray; an edit is exported and restored as [12,6].                                                                           |
| Serialize/deserialize round trip              | API.getNodes → JSON stringify/parse → API.replaceDocument in a fresh real ECS world, with document equality and component/binding assertions. No mock Commands or arbitrary sleeps. |

The current wire type is `polyline` (an EdgeSerializedNode), not `connection` or
`edge`. Internal ECS numeric IDs are deliberately not the serialization contract.
The fixture uses a headless DOM adapter: it tests document/ECS semantics, not GPU
rendering. Chromium/WebGL and native input evidence are tracked separately.
