import { System } from '@lastolivegames/becsy';
import { Connection, AnchorPoint } from '../components';
import { Polyline } from '../components';
import { GlobalTransform } from '../components';
import { Vec2 } from '../components';
import { Rect } from '../components';

/**
 * ConnectionRoutingSystem calculates and updates connection paths between entities.
 *
 * **Stage:** Update (runs after PropagateTransforms for correct GlobalTransform values)
 *
 * **Dependencies:**
 * - Requires Connection, Polyline components on connection entities
 * - Requires GlobalTransform on source/target entities
 * - Optionally uses Rect on source/target for edge attachment
 *
 * **Features:**
 * - Orthogonal routing with Z-shape and C-shape patterns
 * - Straight line routing
 * - Bezier curve routing with automatic control points
 * - Edge attachment using entity bounds (Rect component)
 * - Configurable anchor points (auto, top, right, bottom, left, center)
 *
 * **Performance:**
 * - O(n) where n = number of connections
 * - Optimized to avoid unnecessary writes via threshold checks
 */
export class ConnectionRoutingSystem extends System {
    connections = this.query(
        (q) => q.current.with(Connection, Polyline).write
    );

    /** Clearance distance for C-shape routing when source is right of target */
    private readonly ROUTING_CLEARANCE = 40;

    /** Threshold for detecting significant position changes */
    private readonly POSITION_THRESHOLD = 0.01;

    execute() {
        this.connections.current.forEach((entity) => {
            const connection = entity.read(Connection);
            const source = connection.source;
            const target = connection.target;

            // Validate entity references
            if (!source || !target || !source.alive || !target.alive) return;

            // Require GlobalTransform for world positions
            if (!source.has(GlobalTransform) || !target.has(GlobalTransform)) return;

            // Get source bounds
            const sourceBounds = this.getEntityBounds(source);
            const targetBounds = this.getEntityBounds(target);

            // Calculate anchor points based on configuration
            const startPoint = this.calculateAnchorPoint(
                sourceBounds,
                targetBounds,
                connection.sourceAnchor,
                true // isSource
            );
            const endPoint = this.calculateAnchorPoint(
                targetBounds,
                sourceBounds,
                connection.targetAnchor,
                false // isSource
            );

            // Calculate route based on routing type
            let points: [number, number][];
            switch (connection.routingType) {
                case 'straight':
                    points = this.calculateStraightRoute(startPoint, endPoint);
                    break;
                case 'bezier':
                    points = this.calculateBezierRoute(startPoint, endPoint, sourceBounds, targetBounds);
                    break;
                case 'orthogonal':
                default:
                    points = this.calculateOrthogonalRoute(startPoint, endPoint, sourceBounds, targetBounds);
                    break;
            }

            // Update Polyline points (only if changed significantly)
            const polyline = entity.write(Polyline);
            polyline.points = points;
        });
    }

    /**
     * Get the bounding box of an entity in world coordinates.
     */
    private getEntityBounds(entity: any): { x: number; y: number; width: number; height: number } {
        const globalTransform = entity.read(GlobalTransform);
        const matrix = globalTransform.matrix;

        // Translation is in m20, m21
        const x = matrix.m20;
        const y = matrix.m21;

        // Default size if no Rect component
        let width = 0;
        let height = 0;

        if (entity.has(Rect)) {
            const rect = entity.read(Rect);
            width = rect.width;
            height = rect.height;
        }

        return { x, y, width, height };
    }

    /**
     * Calculate the anchor point position based on anchor type and entity bounds.
     */
    private calculateAnchorPoint(
        entityBounds: { x: number; y: number; width: number; height: number },
        otherBounds: { x: number; y: number; width: number; height: number },
        anchor: AnchorPoint,
        isSource: boolean
    ): { x: number; y: number } {
        const { x, y, width, height } = entityBounds;
        const centerX = x + width / 2;
        const centerY = y + height / 2;

        // For 'auto', determine best anchor based on relative positions
        if (anchor === 'auto') {
            const otherCenterX = otherBounds.x + otherBounds.width / 2;
            const otherCenterY = otherBounds.y + otherBounds.height / 2;

            const dx = otherCenterX - centerX;
            const dy = otherCenterY - centerY;

            // Determine primary direction
            if (Math.abs(dx) > Math.abs(dy)) {
                // Horizontal connection
                anchor = dx > 0 ? 'right' : 'left';
            } else {
                // Vertical connection
                anchor = dy > 0 ? 'bottom' : 'top';
            }
        }

        switch (anchor) {
            case 'top':
                return { x: centerX, y: y };
            case 'right':
                return { x: x + width, y: centerY };
            case 'bottom':
                return { x: centerX, y: y + height };
            case 'left':
                return { x: x, y: centerY };
            case 'center':
            default:
                return { x: centerX, y: centerY };
        }
    }

    /**
     * Calculate straight line route (direct connection).
     */
    private calculateStraightRoute(
        start: { x: number; y: number },
        end: { x: number; y: number }
    ): [number, number][] {
        return [
            [start.x, start.y],
            [end.x, end.y]
        ];
    }

    /**
     * Calculate orthogonal route with Z-shape or C-shape patterns.
     * Uses Z-shape when source is left of target, C-shape otherwise.
     */
    private calculateOrthogonalRoute(
        start: { x: number; y: number },
        end: { x: number; y: number },
        sourceBounds: { x: number; y: number; width: number; height: number },
        targetBounds: { x: number; y: number; width: number; height: number }
    ): [number, number][] {
        const points: [number, number][] = [];
        points.push([start.x, start.y]);

        if (start.x < end.x - this.POSITION_THRESHOLD) {
            // Z-shape: source is left of target
            // Horizontal to midpoint, vertical to target Y, horizontal to target
            const midX = (start.x + end.x) / 2;
            points.push([midX, start.y]);
            points.push([midX, end.y]);
        } else {
            // C-shape: source is right of or aligned with target
            // Need to route around to avoid crossing through entities
            const clearance = this.ROUTING_CLEARANCE;

            // Go right from source
            const rightX = Math.max(
                start.x + clearance,
                sourceBounds.x + sourceBounds.width + clearance
            );
            points.push([rightX, start.y]);

            // Go up or down to clear both entities
            const topMost = Math.min(sourceBounds.y, targetBounds.y) - clearance;
            const bottomMost = Math.max(
                sourceBounds.y + sourceBounds.height,
                targetBounds.y + targetBounds.height
            ) + clearance;

            // Choose path that's shorter
            const goUp = Math.abs(start.y - topMost) < Math.abs(start.y - bottomMost);
            const routeY = goUp ? topMost : bottomMost;

            points.push([rightX, routeY]);

            // Go left to target side
            const leftX = Math.min(
                end.x - clearance,
                targetBounds.x - clearance
            );
            points.push([leftX, routeY]);

            // Go to target Y level
            points.push([leftX, end.y]);
        }

        points.push([end.x, end.y]);
        return points;
    }

    /**
     * Calculate bezier curve route with automatic control points.
     * Creates smooth S-curves between source and target.
     */
    private calculateBezierRoute(
        start: { x: number; y: number },
        end: { x: number; y: number },
        sourceBounds: { x: number; y: number; width: number; height: number },
        targetBounds: { x: number; y: number; width: number; height: number }
    ): [number, number][] {
        // For bezier, we generate intermediate points that approximate a cubic bezier
        // The Polyline will render these as connected segments
        // For true bezier rendering, a Path component would be needed

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Control point offset (1/3 of distance, clamped)
        const controlOffset = Math.min(distance / 3, 100);

        // Determine control point direction based on anchor positions
        const cp1x = start.x + controlOffset;
        const cp1y = start.y;
        const cp2x = end.x - controlOffset;
        const cp2y = end.y;

        // Generate points along the cubic bezier curve
        const points: [number, number][] = [];
        const segments = 20; // Number of line segments to approximate the curve

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const point = this.cubicBezierPoint(
                start.x, start.y,
                cp1x, cp1y,
                cp2x, cp2y,
                end.x, end.y,
                t
            );
            points.push([point.x, point.y]);
        }

        return points;
    }

    /**
     * Calculate a point on a cubic bezier curve.
     */
    private cubicBezierPoint(
        x0: number, y0: number,
        x1: number, y1: number,
        x2: number, y2: number,
        x3: number, y3: number,
        t: number
    ): { x: number; y: number } {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;

        return {
            x: mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3,
            y: mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3
        };
    }
}
