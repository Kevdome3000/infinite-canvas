import { Entity, component, field } from '@lastolivegames/becsy';

/**
 * Anchor point positions for connection endpoints.
 * 'auto' - Automatically determine best anchor based on relative positions
 * 'top' | 'right' | 'bottom' | 'left' - Fixed anchor on specific edge
 * 'center' - Connect to center of entity
 */
export type AnchorPoint = 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center';

/**
 * Connection component for linking two entities with a routed path.
 *
 * **Features:**
 * - Links any two entities via source/target references
 * - Supports multiple routing algorithms (orthogonal, straight, bezier)
 * - Configurable anchor points for precise edge attachment
 * - Styling options for stroke and corner radius
 *
 * **Usage:**
 * Connections are typically rendered as Polyline entities. The ConnectionRoutingSystem
 * calculates the path points based on source/target positions and routing type.
 *
 * @see ConnectionRoutingSystem
 */
@component
export class Connection {
    /**
     * Source entity that the connection originates from.
     */
    @field.ref declare source: Entity;

    /**
     * Target entity that the connection points to.
     */
    @field.ref declare target: Entity;

    /**
     * Anchor point on the source entity.
     * Determines where the connection line exits the source.
     * 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center'
     * Default: 'auto'
     */
    @field.staticString(['auto', 'top', 'right', 'bottom', 'left', 'center'])
    declare sourceAnchor: AnchorPoint;

    /**
     * Anchor point on the target entity.
     * Determines where the connection line enters the target.
     * 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center'
     * Default: 'auto'
     */
    @field.staticString(['auto', 'top', 'right', 'bottom', 'left', 'center'])
    declare targetAnchor: AnchorPoint;

    /**
     * Routing algorithm type.
     * 'orthogonal' - 90-degree turns (Z-shape or C-shape)
     * 'straight' - Direct line between points
     * 'bezier' - Smooth curved path
     * Default: 'orthogonal'
     */
    @field.staticString(['orthogonal', 'straight', 'bezier'])
    declare routingType: 'orthogonal' | 'straight' | 'bezier';

    /**
     * Stroke style for the connection line.
     * 'solid' | 'dashed'
     * Default: 'solid'
     */
    @field.staticString(['solid', 'dashed'])
    declare strokeStyle: 'solid' | 'dashed';

    /**
     * Corner radius for smoothing bends in orthogonal routing.
     * Applied at each turn point to create rounded corners.
     * Default: 0 (sharp corners)
     */
    @field.float32 declare cornerRadius: number;

    constructor(props?: Partial<Omit<Connection, 'source' | 'target'>>) {
        this.sourceAnchor = props?.sourceAnchor ?? 'auto';
        this.targetAnchor = props?.targetAnchor ?? 'auto';
        this.routingType = props?.routingType ?? 'orthogonal';
        this.strokeStyle = props?.strokeStyle ?? 'solid';
        this.cornerRadius = props?.cornerRadius ?? 0;
    }
}
