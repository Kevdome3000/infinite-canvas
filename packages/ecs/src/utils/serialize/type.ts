import {
  BrushType,
  DropShadow,
  Ellipse,
  InnerShadow,
  Line,
  Marker,
  Opacity,
  Path,
  Rect,
  Rough,
  Stroke,
  Text,
  TextDecoration,
  VectorNetwork,
  Visibility,
} from '../../components';

// @see https://dev.to/themuneebh/typescript-branded-types-in-depth-overview-and-use-cases-60e
export type FractionalIndex = string & { _brand: 'franctionalIndex' };
export type Ordered<TElement extends SerializedNode> = TElement & {
  index: FractionalIndex;
};
export type OrderedSerializedNode = Ordered<SerializedNode>;

/**
 * Refer SVG attributes
 * @see https://github.com/tldraw/tldraw/blob/main/packages/tlschema/src/shapes/TLBaseShape.ts
 * @see https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton
 */
export interface BaseSerializeNode<Type extends string>
  extends Partial<TransformAttributes>,
  Partial<VisibilityAttributes>,
  Partial<NameAttributes>,
  Partial<ZIndexAttributes>,
  Partial<EditableAttributes> {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Parent unique identifier
   */
  parentId?: string;

  /**
   * Shape type
   */
  type?: Type;

  /**
   * @see https://github.com/excalidraw/excalidraw/issues/1639
   */
  version?: number;
  versionNonce?: number;
  isDeleted?: boolean;

  updated?: number;

  /**
   * Lock aspect ratio like image.
   */
  lockAspectRatio?: boolean;
}

export interface EditableAttributes {
  editable?: boolean;
  isEditing?: boolean;
}

export interface ZIndexAttributes {
  /**
   * Z index
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/z-index
   */
  zIndex?: number;

  fractionalIndex?: string;
}

export interface NameAttributes {
  name: string;
}

/**
 * Friendly to transformer.
 */
export interface TransformAttributes {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface VisibilityAttributes {
  visibility: Visibility['value'];
}

export interface FillAttributes {
  /**
   * Solid color, gradient, stringified pattern, image data-uri, etc.
   */
  fill: string;
  fillOpacity: Opacity['fillOpacity'];
  opacity: Opacity['opacity'];
}

export interface StrokeAttributes {
  stroke: Stroke['color'];
  strokeWidth: Stroke['width'];
  strokeAlignment: Stroke['alignment'];
  strokeLinecap: Stroke['linecap'];
  strokeLinejoin: Stroke['linejoin'];
  strokeMiterlimit: Stroke['miterlimit'];
  strokeDasharray: string;
  strokeDashoffset: Stroke['dashoffset'];
  strokeOpacity: Opacity['strokeOpacity'];
}

export interface MarkerAttributes {
  markerStart: Marker['start'];
  markerEnd: Marker['end'];
  markerFactor: Marker['factor'];
}

export interface InnerShadowAttributes {
  innerShadowColor: InnerShadow['color'];
  innerShadowOffsetX: InnerShadow['offsetX'];
  innerShadowOffsetY: InnerShadow['offsetY'];
  innerShadowBlurRadius: InnerShadow['blurRadius'];
}

export interface DropShadowAttributes {
  dropShadowColor: DropShadow['color'];
  dropShadowOffsetX: DropShadow['offsetX'];
  dropShadowOffsetY: DropShadow['offsetY'];
  dropShadowBlurRadius: DropShadow['blurRadius'];
}

export interface AttenuationAttributes {
  strokeAttenuation: boolean;
  sizeAttenuation: boolean;
}

export interface TextDecorationAttributes {
  decorationColor: TextDecoration['color'];
  decorationLine: TextDecoration['line'];
  decorationStyle: TextDecoration['style'];
  decorationThickness: TextDecoration['thickness'];
}

export interface WireframeAttributes {
  wireframe: boolean;
}

export interface RoughAttributes {
  roughSeed: Rough['seed'];
  roughRoughness: Rough['roughness'];
  roughBowing: Rough['bowing'];
  roughFillStyle: Rough['fillStyle'];
  roughFillWeight: Rough['fillWeight'];
  roughHachureAngle: Rough['hachureAngle'];
  roughHachureGap: Rough['hachureGap'];
  roughCurveStepCount: Rough['curveStepCount'];
  roughCurveFitting: Rough['curveFitting'];
  roughFillLineDash: Rough['fillLineDash'];
  roughFillLineDashOffset: Rough['fillLineDashOffset'];
  roughDisableMultiStroke: Rough['disableMultiStroke'];
  roughDisableMultiStrokeFill: Rough['disableMultiStrokeFill'];
  roughSimplification: Rough['simplification'];
  roughDashOffset: Rough['dashOffset'];
  roughDashGap: Rough['dashGap'];
  roughZigzagOffset: Rough['zigzagOffset'];
  roughPreserveVertices: Rough['preserveVertices'];
}

export interface FilterAttributes {
  /**
   * The filter CSS property applies graphical effects like blur or color shift to an element. Filters are commonly used to adjust the rendering of images.
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/filter
   */
  filter: string;
}

export interface GSerializedNode extends BaseSerializeNode<'g'> { }

export interface EllipseSerializedNode
  extends BaseSerializeNode<'ellipse'>,
  Partial<Pick<Ellipse, 'rx' | 'ry' | 'cx' | 'cy'>>,
  Partial<FillAttributes>,
  Partial<StrokeAttributes>,
  Partial<AttenuationAttributes>,
  Partial<WireframeAttributes>,
  Partial<FilterAttributes> { }

export interface RectSerializedNode
  extends BaseSerializeNode<'rect'>,
  Partial<Pick<Rect, 'width' | 'height' | 'cornerRadius'>>,
  Partial<FillAttributes>,
  Partial<StrokeAttributes>,
  Partial<InnerShadowAttributes>,
  Partial<DropShadowAttributes>,
  Partial<AttenuationAttributes>,
  Partial<WireframeAttributes>,
  Partial<FilterAttributes> { }

export interface RoughRectSerializedNode
  extends BaseSerializeNode<'rough-rect'>,
  Partial<Pick<Rect, 'width' | 'height' | 'cornerRadius'>>,
  Partial<FillAttributes>,
  Partial<StrokeAttributes>,
  Partial<RoughAttributes> { }

export interface RoughEllipseSerializedNode
  extends BaseSerializeNode<'rough-ellipse'>,
  Partial<Pick<Ellipse, 'rx' | 'ry' | 'cx' | 'cy'>>,
  Partial<FillAttributes>,
  Partial<StrokeAttributes>,
  Partial<RoughAttributes> { }
export interface LineSerializedNode
  extends BaseSerializeNode<'line'>,
  Partial<Pick<Line, 'x1' | 'y1' | 'x2' | 'y2'>>,
  Partial<StrokeAttributes>,
  Partial<Pick<AttenuationAttributes, 'strokeAttenuation'>> { }

interface PolylineAttributes {
  points: string;
}
export interface PolylineSerializedNode
  extends BaseSerializeNode<'polyline'>,
  Partial<PolylineAttributes>,
  Partial<StrokeAttributes>,
  Partial<Pick<AttenuationAttributes, 'strokeAttenuation'>>,
  Partial<WireframeAttributes>,
  Partial<MarkerAttributes> { }

export interface BrushAttributes {
  points: string;
  brushType: BrushType;
  brushStamp: string;
  stroke: Stroke['color'];
  strokeOpacity: Opacity['strokeOpacity'];
}
export interface BrushSerializedNode
  extends BaseSerializeNode<'brush'>,
  Partial<BrushAttributes>,
  Partial<WireframeAttributes> { }
export interface PathSerializedNode
  extends BaseSerializeNode<'path'>,
  Partial<Pick<Path, 'd' | 'fillRule' | 'tessellationMethod'>>,
  Partial<FillAttributes>,
  Partial<StrokeAttributes>,
  Partial<AttenuationAttributes>,
  Partial<WireframeAttributes>,
  Partial<MarkerAttributes>,
  Partial<FilterAttributes> { }

export interface TextAttributes
  extends Partial<
    Pick<
      Text,
      | 'anchorX'
      | 'anchorY'
      | 'content'
      | 'fontFamily'
      | 'fontSize'
      | 'fontWeight'
      | 'fontStyle'
      | 'fontVariant'
      | 'letterSpacing'
      | 'lineHeight'
      | 'whiteSpace'
      | 'wordWrap'
      | 'wordWrapWidth'
      | 'textOverflow'
      | 'maxLines'
      | 'textAlign'
      | 'textBaseline'
      | 'leading'
      | 'bitmapFont'
      | 'bitmapFontKerning'
      | 'physical'
      | 'esdt'
    >
  > { }

export interface TextSerializedNode
  extends BaseSerializeNode<'text'>,
  Partial<TextAttributes>,
  Partial<{
    fontBoundingBoxAscent: number;
    fontBoundingBoxDescent: number;
    hangingBaseline: number;
    ideographicBaseline: number;
  }>,
  Partial<FillAttributes>,
  Partial<StrokeAttributes>,
  Partial<DropShadowAttributes>,
  Partial<TextDecorationAttributes>,
  Partial<AttenuationAttributes>,
  Partial<WireframeAttributes> { }

export interface VectorNetworkAttributes {
  vertices: VectorNetwork['vertices'];
  segments: VectorNetwork['segments'];
  regions: VectorNetwork['regions'];
}
export interface VectorNetworkSerializedNode
  extends BaseSerializeNode<'vector-network'>,
  Partial<VectorNetworkAttributes> { }

export interface HtmlAttributes {
  html: string;
}

/**
 * Metadata for ChanceAI card entities.
 * Stores card-specific data that persists with the HTML entity.
 */
export interface CardMetadata {
  /** Card type discriminator */
  cardType?: 'NOTE' | 'LINK' | 'AI_PROMPT' | 'AI_RESPONSE' | 'CHAT' | 'TODO' | 'TABLE' | 'FILE' | 'STACK' | 'ARTIFACT' | 'note' | 'file' | 'table' | 'todo' | 'link' | 'artifact' | 'stack';
  /** Card content (HTML/JSON for TEXT, plain text for NOTE) */
  content?: string;
  /** Rich text flag for TEXT cards */
  isRichText?: boolean;
  /** Color theme for NOTE cards */
  colorTheme?: 'yellow' | 'pink' | 'blue' | 'green' | 'white';
  /** Image source URL for IMAGE cards */
  src?: string;
  /** Image caption for IMAGE cards */
  caption?: string;
  /** Aspect ratio for IMAGE cards */
  aspectRatio?: number;
  /** URL for LINK cards */
  url?: string;
  /** Embed flag for LINK cards */
  isEmbed?: boolean;
  /** Embed URL for LINK cards */
  embedUrl?: string;
  /** Embed provider for LINK cards */
  embedProvider?: string;
  /** Fetch status for LINK cards */
  fetchStatus?: 'idle' | 'loading' | 'success' | 'error';
  /** Link metadata for LINK cards */
  linkMetadata?: {
    title?: string;
    description?: string;
    image?: string;
    favicon?: string;
    siteName?: string;
  };

  // Display/visibility toggles
  /** Show preview toggle (LINK, FILE cards) */
  showPreview?: boolean;
  /** Show link info toggle (LINK cards) */
  showLinkInfo?: boolean;
  /** Show caption toggle (multiple card types) */
  showCaption?: boolean;
  /** Show file info toggle (FILE cards) */
  showFileInfo?: boolean;
  /** Show title toggle (TABLE, TODO cards) */
  showTitle?: boolean;

  // Card styling
  /** Background color for cards */
  backgroundColor?: string;
  /** Top strip accent color */
  stripColor?: string | null;
  /** Text color */
  textColor?: string;
  /** Highlight color */
  highlightColor?: string;

  // Table cell formatting
  /** Cell alignment */
  cellAlignment?: { horizontal: 'left' | 'center' | 'right'; vertical: 'top' | 'middle' | 'bottom' };
  /** Cell background color */
  cellColor?: string;
  /** Cell type */
  cellType?: string;

  // Artifact card settings
  /** Artifact card view mode */
  cardView?: 'preview' | 'icon';

  // Card Stack ECS layout configuration
  /** ColumnLayout settings for card stacks */
  columnLayout?: {
    direction: 'vertical' | 'horizontal';
    gap: number;
    padding: number;
    alignItems: 'start' | 'center' | 'end' | 'stretch';
  };
}

export interface HtmlSerializedNode
  extends BaseSerializeNode<'html'>,
  Partial<HtmlAttributes> {
  /** ChanceAI card metadata for serialization/deserialization */
  metadata?: CardMetadata;
}

export interface EmbedAttributes {
  url: string;
}
export interface EmbedSerializedNode
  extends BaseSerializeNode<'embed'>,
  Partial<EmbedAttributes> { }

export interface ColumnLayoutAttributes {
  gap: number;
  padding: number;
  alignItems: 'start' | 'center' | 'end' | 'stretch';
  isAutoLayout: boolean;
  direction: 'vertical' | 'horizontal';
  maxChildren: number;
  showDropZone: boolean;
}
export interface ColumnLayoutSerializedNode
  extends BaseSerializeNode<'column-layout'>,
  Partial<ColumnLayoutAttributes> { }

export interface ConnectionAttributes {
  /** Source entity ID */
  source: string;
  /** Target entity ID */
  target: string;
  /** Anchor point on source entity: 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center' */
  sourceAnchor: 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center';
  /** Anchor point on target entity: 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center' */
  targetAnchor: 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center';
  /** Routing algorithm: 'orthogonal' | 'straight' | 'bezier' */
  routingType: 'orthogonal' | 'straight' | 'bezier';
  /** Stroke style: 'solid' | 'dashed' */
  strokeStyle: 'solid' | 'dashed';
  /** Corner radius for smoothing bends in orthogonal routing */
  cornerRadius: number;
}
export interface ConnectionSerializedNode
  extends BaseSerializeNode<'connection'>,
  Partial<ConnectionAttributes>,
  Partial<StrokeAttributes> { }

export type SerializedNode =
  | GSerializedNode
  | EllipseSerializedNode
  | RectSerializedNode
  | LineSerializedNode
  | PolylineSerializedNode
  | PathSerializedNode
  | TextSerializedNode
  | BrushSerializedNode
  | RoughRectSerializedNode
  | RoughEllipseSerializedNode
  | VectorNetworkSerializedNode
  | HtmlSerializedNode
  | EmbedSerializedNode
  | ColumnLayoutSerializedNode
  | ConnectionSerializedNode;

export type SerializedNodeAttributes = GSerializedNode &
  EllipseSerializedNode &
  RectSerializedNode &
  LineSerializedNode &
  PolylineSerializedNode &
  PathSerializedNode &
  TextSerializedNode &
  BrushSerializedNode &
  RoughRectSerializedNode &
  RoughEllipseSerializedNode &
  VectorNetworkSerializedNode &
  HtmlSerializedNode &
  EmbedSerializedNode &
  ColumnLayoutSerializedNode &
  ConnectionSerializedNode;
