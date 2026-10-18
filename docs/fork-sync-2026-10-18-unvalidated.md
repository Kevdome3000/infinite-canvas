# Canvas upstream review branch — 2026-10-18

**UNVALIDATED — one-time owner-authorized bypass of project quality hooks.**

Base: `1b415868f0a9b3c597c96c1a90db2ec926012589`. Frozen upstream: `8ccac105f9ff325bf0d9906b6a28e16f9bba4726`. Full merge on persistent `sync/upstream`; no protected branch is changed by this run. The prior frozen upstream was `b81a5fe835c95ee70512bc9f6b208adb19e7d887`.

## Scope and preservation

32 unmatched nonmerge upstream commits (31 merge commits also enter ancestry), covering SVG import/extrusion, GLB export and lighting. Only API.ts and serialized-node.ts overlap fork changes; merge is clean and preserves fork helpers, card metadata and layout guards. Engine dependency manifests and lockfile are unchanged. Tolaria's 89 existing patch hunks apply to copied merged source with zero fuzz; no patch is retired. Upstream app extrusion toolbar is outside Tolaria's consumed package set and is not ported into the host.

Common 2D SVG import now expands local use references and resolves paint/currentColor; affine rotation/skew decomposition also changes. These are untested behavioral risks, not a runtime pass.

## Authorization and limits

Owner instructed: bypass checks for this sync, then reenable them. Each mutating Git command that needs the exception uses `git -c core.hooksPath=/dev/null`; repository/global configuration and hook files are not changed. The exception ends with this attempt, no later than 2026-10-19T15:26:01Z. Recurring automation keeps strict acceptance. Routine fork-sync Gate 1/2 approvals and review-branch pushes are authorized; product/architecture decisions still pause.

Builds, lint/static/security gates, unit/browser tests, coverage, localization checks and packaged native QA are skipped for this attempt. Static merge review and zero-fuzz patch application are compensating checks only. Prior consumer URI-rule timeout, drag-overlay runtime error, unverified zoom/CSP checks, localization and HEIC distribution follow-ups remain open. No successful-sync marker or release/no-regressions claim is made.

Publish this engine review branch before the consumer review branch; the consumer will pin this merge commit. Normal future Git commands retain existing hooks. No force push or integration-branch push/merge is authorized.

## Upstream commits

- `e5b6c284b8098b6361f71fef2c9b0f10c5454fe9` docs: plan vector-to-3d extrusion roadmap
- `71d74aa95471c3bd6da1f1079bc3e5ee40a7f6c6` feat(ecs): extrude basic SVG shapes and inherit group paint
- `9876a7cff17bf409ee27c965a8fca1a90df83b83` fix(ecs): restore visible lighting for 3D meshes
- `a5e18b10aacf8d20650ea6ed2c4c2d658634104f` perf(ecs): share extrusion cap vertices
- `3b105774c1c588c9638c44e8ef5a1e730f4ea366` feat(ecs): customize extrusion side color
- `e256ba140adb898bf5ffc1bd30cff43bc931727c` feat(ecs): export extruded meshes as GLB
- `36babca8808b5be06ac365c5741a01eeab8a14b0` feat(ecs): export extruded shapes as GLB through API
- `88ee505922e910c123978b1e6d7b72a25991d14b` feat(ecs): bevel convex path and rect extrusions
- `6b35da411a0df39af682cf105b220fbcc55ec9cf` feat(ecs): bevel compound extruded paths
- `b2ae7a1c6afca19eacdefb7ce39765bc5f0ac1fc` feat(ecs): add rounded extrusion bevel profiles
- `de13e5a2c273f2382d32559396a9d2a82560b12a` test: verify rounded SVG extrusion in browser
- `3092c4ad368e6615f47769e345e8c1c03a5cac2f` perf(ecs): retain bevels on detailed paths
- `0e5b1a0b1504dd3d89d59ce0cceb548260de2d74` perf(ecs): reuse rounded bevel ring vertices
- `30594bb138c95eee39063048076977d6bf807a02` fix(ecs): preserve SVG rounded rect radii for extrusion
- `41c4746d0600a2b37d332db3d605e20afa0b094f` feat(ecs): complete affine vector extrusion footprints
- `1bdd7547d3505bc34504d78bd004aa2f82e7e782` feat(ecs): preserve SVG affine transforms in extrusion import
- `e6be8f1fa58c3eb95bba7ac2096153257af36ecd` feat(ecs): clip sliced SVG extrusions to viewport
- `d3e6633f2f881b1f21d1c83b66b4184ad14ba406` feat(ecs): extrude explicitly closed SVG polylines
- `a69c6527de4b7417e6cd38a75b7d7cd0d4aa6e07` feat(ecs): expand local SVG use references for extrusion
- `ef8205658d4ba7ed88514b6f21fea5c70a4fa4f6` test(ecs): cover affine extrusion transform branches
- `0e83123277ebee3b9a1622392764bb84e040bcb8` feat(ecs): extrude SVG symbol viewport instances
- `e2de3ffe56b3d16b03d07970029fb56d1c6e5d2a` feat(ecs): inherit SVG symbol viewport dimensions
- `4de19547f025d032feecc9984e0e426e593be68e` feat(ecs): import nested SVG extrusion viewports
- `779b87510800013fb3c9a70da4f21a5eae5af16d` feat(ecs): import SVG inline paint and currentColor
- `6717569674c8e9c232b31af4121fab984bdaa4c3` feat(ecs): clip SVG extrusion outlines with local clip paths
- `123bc6c098f328da72afd1d59f54440f42de0d49` feat(ecs): complete local SVG extrusion clip reuse and group bounds
- `534a841356d63c1db2ca28973ec4c8e4291f3d52` feat(app): expose vector extrusion and GLB export
- `f991c497c51a3aeacd707f4b156c24d13c2aca6d` feat(app): finish vector extrusion appearance controls
- `36d4eabadf3f9b03d2af876f8837516dc4becd00` test(browser): cover App SVG extrusion through GLB export
- `b6f21d2287ae3020216d2638aa8fd2db360a6ddc` fix(app): prevent unsupported Path extrusion toggles
- `fcda54d7169219c53252fafc0a886541cf1f612e` fix(app): initialize linked camera for vector extrusion
- `ef26c9ffdf01916163dd5f34300afd11e41fad44` fix(app): center imported SVG artwork by visible bounds
