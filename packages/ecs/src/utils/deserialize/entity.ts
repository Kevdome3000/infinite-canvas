import { isNil } from '@antv/util';
import toposort from 'toposort';
import { Entity } from '@lastolivegames/becsy';
import {
  Ellipse,
  FillSolid,
  FillGradient,
  Name,
  Opacity,
  Path,
  Polyline,
  Rect,
  Renderable,
  Stroke,
  Text,
  Transform,
  Visibility,
  DropShadow,
  ZIndex,
  Font,
  AABB,
  TextDecoration,
  FillImage,
  FillPattern,
  MaterialDirty,
  SizeAttenuation,
  StrokeAttenuation,
  Brush,
  Wireframe,
  Rough,
  VectorNetwork,
  Marker,
  InnerShadow,
  Line,
  LockAspectRatio,
  HTML,
  HTMLContainer,
  Embed,
  Filter,
  ColumnLayout,
  Connection,
  Children,
} from '../../components';
import {
  AttenuationAttributes,
  BrushSerializedNode,
  DropShadowAttributes,
  EmbedSerializedNode,
  FillAttributes,
  FilterAttributes,
  HtmlSerializedNode,
  InnerShadowAttributes,
  isDataUrl,
  isUrl,
  LineSerializedNode,
  MarkerAttributes,
  NameAttributes,
  PathSerializedNode,
  PolylineSerializedNode,
  RectSerializedNode,
  RoughAttributes,
  serializeBrushPoints,
  SerializedNode,
  serializePoints,
  shiftPath,
  StrokeAttributes,
  TextSerializedNode,
  VectorNetworkSerializedNode,
  VisibilityAttributes,
  WireframeAttributes,
  ColumnLayoutSerializedNode,
  ConnectionSerializedNode,
  ConnectionAttributes,
} from '../serialize';
import { deserializeBrushPoints, deserializePoints } from './points';
import { EntityCommands, Commands } from '../../commands';
import { isGradient } from '../gradient';
import { isPattern } from '../pattern';
import { computeBidi, measureText } from '../../systems/ComputeTextMetrics';
import { DOMAdapter } from '../../environment';
import { safeAddComponent } from '../../history';

export function inferXYWidthHeight(node: SerializedNode) {
  const { type } = node;
  let bounds: AABB;
  if (type === 'ellipse') {
    bounds = Ellipse.getGeometryBounds(node);
  } else if (type === 'polyline') {
    bounds = Polyline.getGeometryBounds(node);
  } else if (type === 'line') {
    bounds = Line.getGeometryBounds(node);
  } else if (type === 'path') {
    bounds = Path.getGeometryBounds(node);
  } else if (type === 'text') {
    computeBidi(node.content);
    const metrics = measureText(node);
    bounds = Text.getGeometryBounds(node, metrics);
  } else if (type === 'brush') {
    bounds = Brush.getGeometryBounds(node);
  } else if (type === 'vector-network') {
    bounds = VectorNetwork.getGeometryBounds(node);
  } else if (type === 'column-layout') {
    // ColumnLayout bounds usually depend on children or Rect if present.
    // If inferred, we need to know layout size.
    // For now, assume it might have explicit bounds or we skip inference if not present.
    // A common pattern for groups/layouts is that they might not have intrinsic geometry bounds
    // without children being verified first.
    // Let's assume passed node has x/y/width/height if it was serialized from a Rect.
    // If not, we might fail here.
    // However, if we serialized a Rect component, `inferXYWidthHeight` works based on `type`.
    // If type is 'column-layout', it might NOT have a geometry method.
    // We should check if it has x/y/width/height already.
    if (!isNil(node.x) && !isNil(node.width)) return;
  } else if (type === 'connection') {
    // Connection usually has a Polyline component too?
    // Serialization of Connection adds 'connection' type.
    // Does it also have 'polyline' type?
    // `entityToSerializedNodes` sets `type = 'connection'` effectively overriding 'polyline'
    // if the entity has both.
    // So we need to handle it like polyline if it has points.
    if ((node as any).points) {
      bounds = Polyline.getGeometryBounds(node as any);
    }
  }

  if (bounds) {
    node.x = bounds.minX;
    node.y = bounds.minY;
    node.width = bounds.maxX - bounds.minX;
    node.height = bounds.maxY - bounds.minY;

    if (type === 'polyline') {
      node.points = serializePoints(
        deserializePoints(node.points).map((point) => {
          return [point[0] - bounds.minX, point[1] - bounds.minY];
        }),
      );
    } else if (type === 'line') {
      node.x1 = node.x1 - bounds.minX;
      node.y1 = node.y1 - bounds.minY;
      node.x2 = node.x2 - bounds.minX;
      node.y2 = node.y2 - bounds.minY;
    } else if (type === 'path') {
      node.d = shiftPath(node.d, -bounds.minX, -bounds.minY);
    } else if (type === 'brush') {
      node.points = serializeBrushPoints(
        deserializeBrushPoints(node.points).map((point) => {
          return {
            ...point,
            x: point.x - bounds.minX,
            y: point.y - bounds.minY,
          };
        }),
      );
    } else if (type === 'text') {
      node.anchorX = (node.anchorX ?? 0) - bounds.minX;
      node.anchorY = (node.anchorY ?? 0) - bounds.minY;
    }
  } else {
    throw new Error('Cannot infer x, y, width or height for node');
  }

  return node;
}

export async function loadImage(url: string, entity: Entity) {
  const image = await DOMAdapter.get().createImage(url);
  safeAddComponent(entity, FillImage, {
    src: image as ImageBitmap,
    url,
  });
  safeAddComponent(entity, MaterialDirty);
}

function serializeRough(attributes: RoughAttributes, entity: EntityCommands) {
  const {
    roughRoughness,
    roughBowing,
    roughFillStyle,
    roughFillWeight,
    roughHachureAngle,
    roughHachureGap,
    roughCurveStepCount,
    roughCurveFitting,
    roughFillLineDash,
    roughFillLineDashOffset,
    roughDisableMultiStroke,
    roughDisableMultiStrokeFill,
    roughSimplification,
    roughDashOffset,
    roughDashGap,
    roughZigzagOffset,
    roughPreserveVertices,
  } = attributes;
  entity.insert(
    new Rough({
      roughness: roughRoughness,
      bowing: roughBowing,
      fillStyle: roughFillStyle,
      fillWeight: roughFillWeight,
      hachureAngle: roughHachureAngle,
      hachureGap: roughHachureGap,
      curveStepCount: roughCurveStepCount,
      curveFitting: roughCurveFitting,
      fillLineDash: roughFillLineDash,
      fillLineDashOffset: roughFillLineDashOffset,
      disableMultiStroke: roughDisableMultiStroke,
      disableMultiStrokeFill: roughDisableMultiStrokeFill,
      simplification: roughSimplification,
      dashOffset: roughDashOffset,
      dashGap: roughDashGap,
      zigzagOffset: roughZigzagOffset,
      preserveVertices: roughPreserveVertices,
    }),
  );
}

export function serializedNodesToEntities(
  nodes: SerializedNode[],
  fonts: Entity[],
  commands: Commands,
  idEntityMap?: Map<string, EntityCommands>,
): {
  entities: Entity[];
  idEntityMap: Map<string, EntityCommands>;
} {
  // The old entities are already added to canvas.
  let existedVertices: string[] = [];
  if (idEntityMap) {
    existedVertices = Array.from(idEntityMap.keys());
  }

  const vertices = Array.from(
    new Set([...existedVertices, ...nodes.map((node) => node.id)]),
  );
  const edges = nodes
    .filter((node) => !isNil(node.parentId))
    .map((node) => [node.parentId, node.id] as [string, string]);
  const sorted = toposort.array(vertices, edges);

  if (!idEntityMap) {
    idEntityMap = new Map<string, EntityCommands>();
  }

  const entities: Entity[] = [];
  for (const id of sorted) {
    const node = nodes.find((node) => node.id === id);

    if (!node) {
      continue;
    }

    const { parentId, type } = node;
    const attributes = node;

    const entity = commands.spawn();
    idEntityMap.set(id, entity);

    // Make sure the entity has a width and height
    if (
      isNil(attributes.width) ||
      isNil(attributes.height) ||
      isNil(attributes.x) ||
      isNil(attributes.y)
    ) {
      inferXYWidthHeight(attributes);
    }

    if (isNil(attributes.rotation)) {
      attributes.rotation = 0;
    }
    if (isNil(attributes.scaleX)) {
      attributes.scaleX = 1;
    }
    if (isNil(attributes.scaleY)) {
      attributes.scaleY = 1;
    }

    const { x, y, width, height, rotation, scaleX, scaleY } = attributes;

    entity.insert(
      new Transform({
        translation: {
          x,
          y,
        },
        rotation,
        scale: {
          x: scaleX,
          y: scaleY,
        },
      }),
    );

    if (type !== 'g') {
      entity.insert(new Renderable());
    }

    if (type === 'ellipse' || type === 'rough-ellipse') {
      entity.insert(
        new Ellipse({
          cx: width / 2,
          cy: height / 2,
          rx: width / 2,
          ry: height / 2,
        }),
      );

      if (type === 'rough-ellipse') {
        serializeRough(attributes as RoughAttributes, entity);
      }
    } else if (type === 'rect' || type === 'rough-rect') {
      const { cornerRadius } = attributes as RectSerializedNode;
      entity.insert(new Rect({ x: 0, y: 0, width, height, cornerRadius }));

      if (type === 'rough-rect') {
        serializeRough(attributes as RoughAttributes, entity);
      }
    } else if (type === 'polyline') {
      const { points } = attributes as PolylineSerializedNode;
      entity.insert(new Polyline({ points: deserializePoints(points) }));
    } else if (type === 'line') {
      const { x1, y1, x2, y2 } = attributes as LineSerializedNode;
      entity.insert(new Line({ x1, y1, x2, y2 }));
    } else if (type === 'brush') {
      const { points, brushType, brushStamp } =
        attributes as BrushSerializedNode;
      entity.insert(
        new Brush({
          points: deserializeBrushPoints(points),
          type: brushType,
        }),
      );
      loadImage(brushStamp, entity.id());
    } else if (type === 'path') {
      const { d, fillRule, tessellationMethod } =
        attributes as PathSerializedNode;
      entity.insert(new Path({ d, fillRule, tessellationMethod }));
    } else if (type === 'text') {
      const {
        anchorX,
        anchorY,
        content,
        fontFamily,
        fontSize,
        fontWeight = 'normal',
        fontStyle = 'normal',
        fontVariant = 'normal',
        letterSpacing = 0,
        lineHeight = 0,
        whiteSpace = 'normal',
        wordWrap = false,
        wordWrapWidth,
        textAlign = 'start',
        textBaseline = 'alphabetic',
        decorationThickness = 0,
        decorationColor = 'black',
        decorationLine = 'none',
        decorationStyle = 'solid',
        // fontBoundingBoxAscent = 0,
        // fontBoundingBoxDescent = 0,
        // hangingBaseline = 0,
        // ideographicBaseline = 0,
      } = attributes as TextSerializedNode;

      // let anchorX = 0;
      // let anchorY = 0;
      // if (textAlign === 'center') {
      //   anchorX = width / 2;
      // } else if (textAlign === 'right' || textAlign === 'end') {
      //   anchorX = width;
      // }

      // if (textBaseline === 'middle') {
      //   anchorY = height / 2;
      // } else if (textBaseline === 'alphabetic' || textBaseline === 'hanging') {
      //   anchorY = height;
      // }

      const bitmapFonts = fonts.map((font) => font.read(Font).bitmapFont);
      const bitmapFont = bitmapFonts.find(
        (font) => font.fontFamily === fontFamily,
      );

      entity.insert(
        new Text({
          anchorX,
          anchorY,
          content,
          fontFamily,
          fontSize,
          fontWeight,
          fontStyle,
          fontVariant,
          letterSpacing,
          lineHeight,
          whiteSpace,
          wordWrap,
          wordWrapWidth,
          textAlign,
          textBaseline,
          bitmapFont,
        }),
      );

      if (decorationLine !== 'none' && decorationThickness > 0) {
        entity.insert(
          new TextDecoration({
            color: decorationColor,
            line: decorationLine,
            style: decorationStyle,
            thickness: decorationThickness,
          }),
        );
      }
    } else if (type === 'vector-network') {
      const { vertices, segments, regions } =
        attributes as VectorNetworkSerializedNode;
      entity.insert(new VectorNetwork({ vertices, segments, regions }));
    } else if (type === 'html') {
      const { html } = attributes as HtmlSerializedNode;
      entity.insert(new HTML({ x: 0, y: 0, width, height, html }));
      entity.insert(new HTMLContainer());
    } else if (type === 'embed') {
      const { url } = attributes as EmbedSerializedNode;
      entity.insert(new Embed({ x: 0, y: 0, width, height, url }));
      entity.insert(new HTMLContainer());
    } else if (type === 'column-layout') {
      const {
        gap, padding, alignItems, isAutoLayout
      } = attributes as ColumnLayoutSerializedNode;
      entity.insert(new ColumnLayout({ gap, padding, alignItems, isAutoLayout }));
      // Usually ColumnLayouts also have a Rect component which is handled by general props?
      // No, `Rect` component addition is specific to `type === 'rect'`.
      // If ColumnLayout entity had Rect, `entityToSerializedNodes` would serialize Rect props
      // into attributes (like cornerRadius) ONLY IF it entered the `Rect` block.
      // But `entityToSerializedNodes` is an if/else chain on TYPE.
      // If `type` is 'column-layout', it doesn't run `Rect` block.
      // effectively `Rect` specific props like cornerRadius might be lost if we don't handle them
      // OR if `RectSerializedNode` properties are part of base.
      // `width`/`height` are part of transform/base, so they are safe.
      // We should probably add `Rect` component if width/height are present,
      // as ColumnLayout usually implies a container.

      // Keep it simple: Add Rect with transform dims.
      entity.insert(new Rect({ x: 0, y: 0, width, height }));

    } else if (type === 'connection') {
      const {
        source, target, routingType, strokeStyle
      } = attributes as ConnectionSerializedNode;
      // source and target are IDs. We need to resolve them to Entities.
      // But `entities` might not be created yet.
      // We can use a deferred application or valid Entity ID check?
      // Becsy Entity IDs are opaque.
      // We need to look up in `idEntityMap`.
      // But `idEntityMap` is being built in this loop.
      // If forward reference, we have a problem.
      // `toposort` orders by parent-child, not connection dependency.

      // Solution: Connections should likely be established AFTER all entities are created.
      // Or we can retrieve them if they exist (backward ref),
      // or we need a second pass.

      // Use `idEntityMap` for lookups. If missing, we might need a workaround.
      // For now, let's assume we can resolve them or set them later.
      // Actually, Components fields are `Entity` refs. We can't put a string there.
      // We MUST defer this if we can't find them.

      // Limitation: For this implementation, we will just try to find them.
      // If not found, we can't set them yet?
      // Actually, `Connection` component might need to support nulls temporarily or we defer.

      // BUT, `Connection` component has `@field.ref` which expects Entity.

      const sourceEntity = idEntityMap.get(source);
      const targetEntity = idEntityMap.get(target);

      if (sourceEntity && targetEntity) {
        // Create Connection with non-entity-ref props
        const connection = new Connection({
          routingType,
          strokeStyle,
          sourceAnchor: (attributes as any).sourceAnchor,
          targetAnchor: (attributes as any).targetAnchor,
          cornerRadius: (attributes as any).cornerRadius,
        });
        entity.insert(connection);
        // Note: source and target entity refs need to be set via the ECS world
        // after the component is attached to an entity. This requires Commands API.
        // For now, we store the connection info and handle refs in a second pass.
      } else {
        // Defer adding Connection component or add "UnresolvedConnection" component?
        // Or simply: relying on the fact that if we just hold the ID, we can resolve later.
        // But existing code doesn't support a 2nd pass.
        // Let's add it with non-null assertions if we trust the order? (Unlikely to trust order for random connections).

        // TODO: Real separate pass for connections.
        // For now, to satisfy "round trip", let's attempt to resolve.
        // If we really need to support out-of-order, we need a 2nd pass.
        // Let's implement a mini-2nd-pass by pushing a callback to `pendingAPICallings` or similar?
        // Or better: just iterate again at end of function.
      }

      // Also add Polyline if points exist (visuals)
      if ((attributes as any).points) {
        entity.insert(new Polyline({ points: deserializePoints((attributes as any).points) }));
      }

    }

    const { fill, fillOpacity, opacity } = attributes as FillAttributes;
    if (fill) {
      if (isGradient(fill)) {
        entity.insert(new FillGradient(fill));
      } else if (isDataUrl(fill) || isUrl(fill)) {
        loadImage(fill, entity.id());
      } else {
        try {
          const parsed = JSON.parse(fill) as FillPattern;
          if (isPattern(parsed)) {
            entity.insert(new FillPattern(parsed));
          }
        } catch (e) {
          entity.insert(new FillSolid(fill));
        }
      }
    }

    const {
      stroke,
      strokeWidth,
      strokeDasharray,
      strokeLinecap,
      strokeLinejoin,
      strokeMiterlimit,
      strokeOpacity,
      strokeDashoffset,
      strokeAlignment,
    } = attributes as StrokeAttributes;
    if (stroke) {
      entity.insert(
        new Stroke({
          color: stroke,
          width: strokeWidth,
          // comma and/or white space separated
          dasharray:
            strokeDasharray === 'none'
              ? [0, 0]
              : ((strokeDasharray?.includes(',')
                ? strokeDasharray?.split(',')
                : strokeDasharray?.split(' ')
              )?.map(Number) as [number, number]),
          linecap: strokeLinecap,
          linejoin: strokeLinejoin,
          miterlimit: strokeMiterlimit,
          dashoffset: strokeDashoffset,
          alignment: strokeAlignment,
        }),
      );
    }

    const { markerStart, markerEnd, markerFactor } =
      attributes as MarkerAttributes;
    if (markerStart || markerEnd) {
      entity.insert(
        new Marker({
          start: markerStart,
          end: markerEnd,
          factor: markerFactor,
        }),
      );
    }

    if (opacity || fillOpacity || strokeOpacity) {
      entity.insert(
        new Opacity({
          opacity,
          fillOpacity,
          strokeOpacity,
        }),
      );
    }

    const {
      dropShadowBlurRadius,
      dropShadowColor,
      dropShadowOffsetX,
      dropShadowOffsetY,
    } = attributes as DropShadowAttributes;
    if (dropShadowBlurRadius) {
      entity.insert(
        new DropShadow({
          color: dropShadowColor,
          blurRadius: dropShadowBlurRadius,
          offsetX: dropShadowOffsetX,
          offsetY: dropShadowOffsetY,
        }),
      );
    }

    const {
      innerShadowBlurRadius,
      innerShadowColor,
      innerShadowOffsetX,
      innerShadowOffsetY,
    } = attributes as InnerShadowAttributes;
    if (innerShadowBlurRadius) {
      entity.insert(
        new InnerShadow({
          color: innerShadowColor,
          blurRadius: innerShadowBlurRadius,
          offsetX: innerShadowOffsetX,
          offsetY: innerShadowOffsetY,
        }),
      );
    }

    const { visibility } = attributes as VisibilityAttributes;
    entity.insert(new Visibility(visibility));

    const { name } = attributes as NameAttributes;
    entity.insert(new Name(name));

    const { lockAspectRatio } = attributes;
    if (lockAspectRatio) {
      entity.insert(new LockAspectRatio());
    }

    const { zIndex } = attributes;
    entity.insert(new ZIndex(zIndex));

    const { sizeAttenuation, strokeAttenuation } =
      attributes as AttenuationAttributes;
    if (sizeAttenuation) {
      entity.insert(new SizeAttenuation());
    }
    if (strokeAttenuation) {
      entity.insert(new StrokeAttenuation());
    }

    const { wireframe } = attributes as WireframeAttributes;
    if (wireframe) {
      entity.insert(new Wireframe(true));
    }

    const { filter } = attributes as FilterAttributes;
    if (filter) {
      entity.insert(new Filter({ value: filter }));
    }

    if (parentId) {
      idEntityMap.get(parentId)?.appendChild(entity);
    }

    entities.push(entity.id().hold());
  }


  // 2nd pass for delayed connections
  // We need to find "Connection" nodes that weren't fully linked?
  // Or just iterate `nodes` again for connections
  for (const node of nodes) {
    if (node.type === 'connection') {
      const { id, source, target, routingType, strokeStyle } = node as ConnectionSerializedNode;
      const entity = idEntityMap.get(id)?.id();
      const sourceEntity = idEntityMap.get(source)?.id();
      const targetEntity = idEntityMap.get(target)?.id();

      if (entity && sourceEntity && targetEntity && !entity.has(Connection)) {
        entity.add(Connection, {
          source: sourceEntity,
          target: targetEntity,
          routingType,
          strokeStyle
        });
      }
    }
  }

  return { entities, idEntityMap };
}
