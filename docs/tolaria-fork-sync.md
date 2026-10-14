# Tolaria fork-sync handoff and workaround retirement guide

Recorded October 14, 2026. This guide belongs to the canvas fork so it travels
with its history. It records candidates for investigation, not permission to
remove patches or a claim that newer upstream code already replaces them.

## Baselines and branch meaning

- Tested engine runtime: `e5f2ec83f7d50eb199ca28aea96f7145bfbfdf0f`.
- Integrated Tolaria consumer: `269d6b894ba24e77245a58ad2d7496098f3f746a` on `dev`.
- Reconciled upstream target: `0e6de421`.
- Last observed newer upstream: `79952c99c9b83d082efd464c2634541a3ab74d9f`,
  92 commits / 50 non-merge commits beyond that target. This is a saved observation,
  not a fresh remote check. Fetch and freeze the next target in the next session.
- The historical `completedSync` marker remains at `23d906df`. Code integration
  and completed physical acceptance are different records. Do not advance that
  marker or regenerate the previous cycle from it without reconciling this history.
- This documentation commit adds no runtime behavior. Local canvas `master` can
  contain it while Tolaria remains pinned to the tested runtime commit above.
  A detached submodule at that exact pin is expected, not lost work.
- A new local session can use these local objects. A fresh remote clone needs the
  engine commits published before the consumer commit that references them.
  Local merging is not a push; remote publication remains separately authorized.

The DrawRect cancellation/release repair from upstream
`bbf5c50a58082cfb6d21598ef1b35b9b5aadc6db` is already selectively adopted in
`packages/ecs/src/systems/DrawRect.ts`. Shape tests and brush regressions from
`8069acf23af0764b6c45c346d980b5506fd25f3d` are retained in
`__tests__/ecs/draw-rect.interaction.spec.ts` and
`__tests__/ecs/draw-brush.interaction.spec.ts`. Account for this adoption when
reviewing the newer range; do not apply the repair twice or discard its tests.

## Where the adaptations actually live

Most workarounds are **consumer patches**, not edits visible in this raw engine
checkout. In the Tolaria repository, read these sources at the consumer baseline:

- `patches/infinite-canvas/README.md`: chronological rationale and regressions.
- `patches/infinite-canvas/ecs.patch` and `webcomponents.patch`: effective deltas.
- `scripts/build-canvas.mjs`: copies pinned source, applies patches with zero fuzz,
  compiles the copies and fingerprints the pin, patches, lockfile and build scripts.
- `fork-sync-workspace/sync-manifest.json`: intentional-divergence registry.
- `fork-sync-workspace/refresh-2026-10-09/.implementation-run/patch-dispositions.json`:
  original 74-hunk reconciliation ledger. Later crop and highlight repairs have
  supplemental receipts; this ledger alone is not the complete current patch list.

In the entries below, `ecs:` means `packages/ecs/src/` in this engine, `wc:` means
`packages/webcomponents/src/`, and `consumer:` means the Tolaria repository root.
Inspect the complete patched file, not only the raw upstream implementation.

## Priority candidates to compare against the next upstream range

### Asynchronous images, rasterization and native export

- **Idle image redraw:** ECS patch targets `ecs:systems/BatchManager.ts` and
  `ecs:systems/MeshPipeline.ts`. It invalidates actual drawcalls and their owning
  cameras when image materials become ready. Investigate newer image decode,
  material and renderer changes. Remove only if idle decode, remove/re-add,
  unsupported/suppressed shapes and camera isolation work without these hunks.
  Tests: `consumer:tests/canvas-engine/material-invalidation.spec.ts` and
  `consumer:tests/canvas-publication/publication.spec.ts`.
- **Native raster readability and bitmap lifecycle:** ECS patch targets
  `ecs:utils/fill-layer-image-url-raster.ts` and `ecs:utils/fillImageSvgReraster.ts`.
  Anonymous CORS is set before loading; both URL raster paths probe readability
  before bitmap allocation. Upstream already owns source-aspect dimensions and
  obsolete-bitmap disposal. New decode/filter changes may overlap only part of
  this correction. Preserve those upstream responsibilities and prove both paths,
  unreadable resources and cleanup without the local guards before retirement.
  Test: `consumer:tests/canvas-engine/image-raster-guards.spec.ts`.
- **Explicit native image fills in SVG:** ECS patch targets
  `ecs:utils/serialize/svg.ts`; native `asset://` images must remain image elements
  based on explicit fill type, not only URL classification. Review newer SVG/export
  changes. Remove only after `consumer:tests/canvas-engine/native-export.spec.ts`
  passes without the hunk and native exported files decode correctly.
- **Recovery after a refused export:** ECS patch targets `ecs:systems/ExportSVG.ts`.
  A rejected image/render request must release pending screenshot state so the
  next valid export succeeds. Retire only after failure-then-success export is
  proven, without mutating live scene, selection or history. Existing image/export
  checks are in `consumer:tests/smoke/studio-canvas-image-history-closeout.spec.ts`.

### History, cropping and entity lifetimes

- **Storage-field equality:** ECS patch targets
  `ecs:history/ElementsChange.ts`. Semantically unchanged cloned fills, strokes and
  metadata must not become geometry-history deltas that overwrite later storage
  normalization. This is a particularly useful removal experiment: the previous
  focused source diagnostic without the callback passed, but that alone did not
  retire it. Require source, emitted, consumer and native evidence, including
  normalization before/after commit and after Undo/Redo, real paint changes and
  field removal. Test: `consumer:tests/canvas-engine/history-rebase.spec.ts`.
- **Field-scoped history rebasing:** ECS patch adds `API.rebaseHistoryNodes` in
  `ecs:API.ts`, consumed by `consumer:src/lib/canvas/studioAssetUpdates.ts`.
  Whole-scene `record('NEVER')` is not equivalent: it can absorb a pending move.
  Keep the behavior unless upstream supplies equivalent node/field-scoped
  baseline replacement that preserves app state, pending gestures, storage data,
  missing/deleted nodes and subsequent Undo/Redo. Use the history-rebase test above
  and `consumer:tests/smoke/studio-canvas-image-history-closeout.spec.ts`.
- **Visibility override removal:** ECS patch targets
  `ecs:utils/deserialize/entity.ts`. Removing an override must restore inherited
  visibility under both visible and hidden parents. Current enum coercion can
  make a narrow unpatched test pass; that is not a stable API guarantee.
  Recheck source/emitted history tests and actual presentation before retirement.
- **Crop reentry:** webcomponents patch targets `wc:spectrum/context-menu.ts`.
  Re-entering Crop on the sole live image child of an existing clip must reuse it,
  not nest wrappers or translate already-local coordinates again. Retire only
  after new-crop and reentry paths, membership guards, Apply/Exit, node count,
  geometry and Undo/Redo pass without the patch. Tests:
  `consumer:tests/canvas-engine/crop-reentry.spec.ts` and the image-history smoke.
- **Stale highlights after Undo/deletion:** appended ECS patch targets `ecs:API.ts`.
  It guards absent entities at highlight clearing, incoming/preserved highlighting
  and unhighlighting; it does not swallow errors for live entities. New selection
  or gizmo-lifecycle changes are candidates to inspect, not proven replacements.
  Keep real ECS history/highlighting and subsequent-drawing regression coverage.
- **Outgoing crop settlement:** `consumer:src/features/Canvas/canvasSession.ts`
  settles the old document's crop before acknowledged save or replacement.
  Generic upstream crop completion does not establish this host lifecycle order.
  Rework only if the session contract is preserved, including failure blocking
  target load/save. Test:
  `consumer:src/features/Canvas/canvasSession.persistence.test.ts`.

### Camera, drawing, picker and host-input boundaries

- **Camera pointer-down origin:** ECS patch targets `ecs:systems/CameraControl.ts`.
  Captured origins prevent delayed pan work from using mutable event coordinates.
  Compare newer camera/input work and require
  `consumer:tests/canvas-engine/camera-pointer-origin.spec.ts` plus native pan checks.
- **Pencil preview/simplification:** ECS patch targets `ecs:systems/DrawPencil.ts`.
  Preserve valid two-point strokes and guard absent click-only previews. New brush
  tests do not automatically cover pencil. Prove these exact cases and Undo/Redo
  without the hunk, retaining native brush-speed/pen-pressure limitations.
- **Single-gesture color history:** patches span `ecs:API.ts` and
  `wc:spectrum/paint-command.ts`, `color-picker.ts`, `input-solid.ts` and
  `fill-section.ts`. Deferred `EVENTUALLY` capture does not automatically schedule
  a final record. Preserve one Undo step, continuous preview, flush on close or
  owner replacement and rejection of stale picker events. Tests:
  `consumer:tests/canvas-engine/paint-preview.spec.ts`,
  `consumer:tests/canvas-engine/deferred-capture.spec.ts` and
  `consumer:tests/smoke/studio-canvas-color-history.spec.ts`.
- **Image chooser/paste ownership:** inspect webcomponents patches and Tolaria's
  native adapters. Upstream AbortSignal support alone does not cover A-to-B-to-A
  rebinding: captured host admission must survive chooser, preparation, upload,
  queue and tool-restoration boundaries. Clipboard text adapters must preserve the
  trusted file/HTML paste path. Require image-history smoke and binding tests.
- **Nested shape menu and pasted stacking:** webcomponents context-menu and penbar
  corrections isolate nested menu events and place pasted roots above the saved
  scene while preserving relative order. New upstream selection/input work may
  overlap. Require `consumer:tests/smoke/studio-canvas-controls.spec.ts` and the
  image-history tests for exact-center drag, z-order, paste and Undo/Redo.
- **Build/environment adaptations:** inspect `consumer:scripts/build-canvas.mjs`
  and `consumer:patches/@lastolivegames__becsy@0.16.0.patch` for filter typed-array,
  Yoga resolution and no-eval Becsy compatibility. Review dependency/toolchain
  changes before removal. Require strict TypeScript, all 11 package outputs,
  `consumer:scripts/canvas-csp.test.mjs`, device-build/output tests and native
  resource loading. Preserve locally packaged brush/compiler assets and the CSP;
  relaxing security or downloading runtime resources is not equivalent removal.

## Preserve by design; do not classify these as accidental drift

- Upstream React runtime/provider/actions/selectors remain the ownership base.
  Tolaria retains CanvasSession, persistence, native services, binding epochs,
  frame observation/failure handling and save/close contracts. Do not introduce a
  second App owner or treat one-shot `initialNodes` as full document replacement.
- Metadata round trips and the registry's deliberate core/lesson removals remain
  intentional. LayoutPlugin/ColumnLayout retirement was already owner-approved;
  upstream align/distribute and Yoga remain, and retired wire data stays rejected.
- The optional `transformOriginEnabled` behavior in `ecs:context.ts` and
  `ecs:systems/RenderTransformer.ts` preserves Tolaria's exact-center image drag.
  A new gizmo design is not permission to restore the center rotation-origin hit
  target in Tolaria. Keep the behavior or obtain a product decision.
- Upstream theme/drawing preferences outside document Undo are the selected policy.
  Old background-theme Undo patches must not be restored from historical notes.

## Already replaced or adopted

- The old consumer MeshPipeline retiring-entity patch was replaced by upstream's
  guard. Keep the rapid Undo/deletion batch-membership tests; do not re-add it.
- DrawArrowConnect Text/ComputedTextMetrics access hunks were removed because the
  reconciled upstream declares them. Keep actual arrow-over-text interaction tests.
- The old Hex change-handler hunk and unchanged-theme/snapshot-refresh guards were
  retired in earlier cycles. Historical patch README entries are not instructions
  to restore them.
- DrawRect cancellation was selectively adopted as recorded above. A future merge
  must preserve that behavior and both shape/brush regression suites.

## How to validate a removal

1. Freeze the next upstream SHA and inspect its changes since `0e6de421`, accounting
   for selective adoption. Follow the Tolaria profile, not generic additive-ECS or
   ChanceAI mirror assumptions. Report candidate scope before issues/implementation.
2. In an isolated checkout, remove only the candidate hunk or adapter and keep the
   remainder applying with `--fuzz=0`. Record the complete effective source and
   original failure evidence; patch applicability alone is not acceptance.
3. Run the matching maintained regression against source and rebuilt consumer
   output. `consumer:scripts/test-canvas-engine-patches.mjs` has modes
   `--material-invalidation`, `--image-raster-guards`, `--native-export`,
   `--history-rebase`, `--crop-reentry`, `--camera-pointer-origin`,
   `--paint-preview` and `--deferred-capture`; use `--built-consumer` for emitted
   output. Mutation controls such as `--without-storage-field-equality` are source
   diagnostics only and cannot establish complete acceptance by themselves.
4. Exercise the real consumer flow, then applicable native WKWebView behavior.
   Preserve binding, save/close, history and security invariants. Update the patch
   ledger and build fingerprint only after evidence supports retirement.

The previous cycle's final integration receipt and plan are under the consumer's
`fork-sync-workspace/refresh-2026-10-09/.implementation-run/`. Raw logs and native
captures also have local recovery archives outside Git; do not assume a fresh clone
contains them. Obtain the prior handoff/recovery artifacts when those are required.
High-DPI precision, controlled native brush speed, physical pen pressure, CJK
candidate-list/codepoint preservation, unavailable lasso UI, total native draw-count
measurement and physical mid-drag Escape remain recorded limitations. New upstream
code or browser tests alone do not close these physical acceptance gaps.
