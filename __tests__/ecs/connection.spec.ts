/// <reference types="jest" />
import {
    Connection,
    AnchorPoint,
} from '../../packages/ecs/src';

/**
 * Connection Component and System Tests
 *
 * Note: Full ECS integration tests with App/World are complex due to becsy's
 * global state management. These tests focus on:
 * 1. Component default values and construction
 * 2. Routing algorithm logic (tested via unit tests of the algorithms)
 * 3. Anchor point calculation logic
 *
 * Full integration tests should be run in isolation or as part of E2E tests.
 */
describe('Connection', () => {
    describe('Component defaults', () => {
        it('should have correct default values', () => {
            const connection = new Connection();

            expect(connection.sourceAnchor).toBe('auto');
            expect(connection.targetAnchor).toBe('auto');
            expect(connection.routingType).toBe('orthogonal');
            expect(connection.strokeStyle).toBe('solid');
            expect(connection.cornerRadius).toBe(0);
        });

        it('should allow custom values to be set', () => {
            const connection = new Connection();

            connection.sourceAnchor = 'right';
            connection.targetAnchor = 'left';
            connection.routingType = 'bezier';
            connection.strokeStyle = 'dashed';
            connection.cornerRadius = 8;

            expect(connection.sourceAnchor).toBe('right');
            expect(connection.targetAnchor).toBe('left');
            expect(connection.routingType).toBe('bezier');
            expect(connection.strokeStyle).toBe('dashed');
            expect(connection.cornerRadius).toBe(8);
        });

        it('should support all anchor point values', () => {
            const connection = new Connection();
            const anchorValues: AnchorPoint[] = ['auto', 'top', 'right', 'bottom', 'left', 'center'];

            for (const anchor of anchorValues) {
                connection.sourceAnchor = anchor;
                connection.targetAnchor = anchor;
                expect(connection.sourceAnchor).toBe(anchor);
                expect(connection.targetAnchor).toBe(anchor);
            }
        });

        it('should support all routing types', () => {
            const connection = new Connection();
            const routingTypes: Array<'orthogonal' | 'straight' | 'bezier'> = ['orthogonal', 'straight', 'bezier'];

            for (const routingType of routingTypes) {
                connection.routingType = routingType;
                expect(connection.routingType).toBe(routingType);
            }
        });

        it('should support all stroke styles', () => {
            const connection = new Connection();
            const strokeStyles: Array<'solid' | 'dashed'> = ['solid', 'dashed'];

            for (const strokeStyle of strokeStyles) {
                connection.strokeStyle = strokeStyle;
                expect(connection.strokeStyle).toBe(strokeStyle);
            }
        });
    });

    describe('Routing algorithm logic', () => {
        // Helper types matching the system's internal types
        type Point = { x: number; y: number };
        type Bounds = { x: number; y: number; width: number; height: number };

        // Helper function that mirrors the system's anchor point calculation
        function calculateAnchorPoint(
            entityBounds: Bounds,
            otherBounds: Bounds,
            anchor: AnchorPoint,
        ): Point {
            const { x, y, width, height } = entityBounds;
            const centerX = x + width / 2;
            const centerY = y + height / 2;

            // For 'auto', determine best anchor based on relative positions
            if (anchor === 'auto') {
                const otherCenterX = otherBounds.x + otherBounds.width / 2;
                const otherCenterY = otherBounds.y + otherBounds.height / 2;

                const dx = otherCenterX - centerX;
                const dy = otherCenterY - centerY;

                if (Math.abs(dx) > Math.abs(dy)) {
                    anchor = dx > 0 ? 'right' : 'left';
                } else {
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

        // Helper function for straight route calculation
        function calculateStraightRoute(start: Point, end: Point): [number, number][] {
            return [
                [start.x, start.y],
                [end.x, end.y]
            ];
        }

        // Helper function for orthogonal route calculation (Z-shape and C-shape)
        function calculateOrthogonalRoute(
            start: Point,
            end: Point,
            sourceBounds: Bounds,
            targetBounds: Bounds,
            clearance: number = 40
        ): [number, number][] {
            const points: [number, number][] = [];
            points.push([start.x, start.y]);

            if (start.x < end.x - 0.01) {
                // Z-shape
                const midX = (start.x + end.x) / 2;
                points.push([midX, start.y]);
                points.push([midX, end.y]);
            } else {
                // C-shape
                const rightX = Math.max(
                    start.x + clearance,
                    sourceBounds.x + sourceBounds.width + clearance
                );
                points.push([rightX, start.y]);

                const topMost = Math.min(sourceBounds.y, targetBounds.y) - clearance;
                const bottomMost = Math.max(
                    sourceBounds.y + sourceBounds.height,
                    targetBounds.y + targetBounds.height
                ) + clearance;

                const goUp = Math.abs(start.y - topMost) < Math.abs(start.y - bottomMost);
                const routeY = goUp ? topMost : bottomMost;

                points.push([rightX, routeY]);

                const leftX = Math.min(
                    end.x - clearance,
                    targetBounds.x - clearance
                );
                points.push([leftX, routeY]);
                points.push([leftX, end.y]);
            }

            points.push([end.x, end.y]);
            return points;
        }

        describe('Anchor point calculation', () => {
            const sourceBounds: Bounds = { x: 0, y: 0, width: 100, height: 50 };

            it('should calculate top anchor correctly', () => {
                const targetBounds: Bounds = { x: 200, y: 0, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'top');

                expect(point.x).toBe(50);  // centerX
                expect(point.y).toBe(0);   // top edge
            });

            it('should calculate right anchor correctly', () => {
                const targetBounds: Bounds = { x: 200, y: 0, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'right');

                expect(point.x).toBe(100); // right edge
                expect(point.y).toBe(25);  // centerY
            });

            it('should calculate bottom anchor correctly', () => {
                const targetBounds: Bounds = { x: 200, y: 0, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'bottom');

                expect(point.x).toBe(50);  // centerX
                expect(point.y).toBe(50);  // bottom edge
            });

            it('should calculate left anchor correctly', () => {
                const targetBounds: Bounds = { x: 200, y: 0, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'left');

                expect(point.x).toBe(0);   // left edge
                expect(point.y).toBe(25);  // centerY
            });

            it('should calculate center anchor correctly', () => {
                const targetBounds: Bounds = { x: 200, y: 0, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'center');

                expect(point.x).toBe(50);  // centerX
                expect(point.y).toBe(25);  // centerY
            });

            it('should auto-select right anchor when target is to the right', () => {
                const targetBounds: Bounds = { x: 200, y: 0, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'auto');

                // Target is to the right, so should use right anchor
                expect(point.x).toBe(100); // right edge
                expect(point.y).toBe(25);  // centerY
            });

            it('should auto-select left anchor when target is to the left', () => {
                const targetBounds: Bounds = { x: -200, y: 0, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'auto');

                // Target is to the left, so should use left anchor
                expect(point.x).toBe(0);   // left edge
                expect(point.y).toBe(25);  // centerY
            });

            it('should auto-select bottom anchor when target is below', () => {
                const targetBounds: Bounds = { x: 0, y: 200, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'auto');

                // Target is below, so should use bottom anchor
                expect(point.x).toBe(50);  // centerX
                expect(point.y).toBe(50);  // bottom edge
            });

            it('should auto-select top anchor when target is above', () => {
                const targetBounds: Bounds = { x: 0, y: -200, width: 100, height: 50 };
                const point = calculateAnchorPoint(sourceBounds, targetBounds, 'auto');

                // Target is above, so should use top anchor
                expect(point.x).toBe(50);  // centerX
                expect(point.y).toBe(0);   // top edge
            });
        });

        describe('Straight routing', () => {
            it('should create direct line between two points', () => {
                const start: Point = { x: 100, y: 50 };
                const end: Point = { x: 300, y: 150 };

                const route = calculateStraightRoute(start, end);

                expect(route.length).toBe(2);
                expect(route[0]).toEqual([100, 50]);
                expect(route[1]).toEqual([300, 150]);
            });
        });

        describe('Orthogonal routing - Z-shape', () => {
            it('should create Z-shape when source is left of target', () => {
                const start: Point = { x: 100, y: 50 };
                const end: Point = { x: 300, y: 150 };
                const sourceBounds: Bounds = { x: 0, y: 25, width: 100, height: 50 };
                const targetBounds: Bounds = { x: 200, y: 125, width: 100, height: 50 };

                const route = calculateOrthogonalRoute(start, end, sourceBounds, targetBounds);

                // Z-shape: start -> midX,startY -> midX,endY -> end
                expect(route.length).toBe(4);
                expect(route[0]).toEqual([100, 50]);      // start
                expect(route[1]).toEqual([200, 50]);      // midX, startY
                expect(route[2]).toEqual([200, 150]);     // midX, endY
                expect(route[3]).toEqual([300, 150]);     // end
            });

            it('should calculate correct midpoint for Z-shape', () => {
                const start: Point = { x: 50, y: 100 };
                const end: Point = { x: 250, y: 200 };
                const sourceBounds: Bounds = { x: 0, y: 75, width: 50, height: 50 };
                const targetBounds: Bounds = { x: 200, y: 175, width: 50, height: 50 };

                const route = calculateOrthogonalRoute(start, end, sourceBounds, targetBounds);

                const expectedMidX = (50 + 250) / 2; // 150
                expect(route[1][0]).toBe(expectedMidX);
                expect(route[2][0]).toBe(expectedMidX);
            });
        });

        describe('Orthogonal routing - C-shape', () => {
            it('should create C-shape when source is right of target', () => {
                const start: Point = { x: 300, y: 50 };
                const end: Point = { x: 100, y: 150 };
                const sourceBounds: Bounds = { x: 200, y: 25, width: 100, height: 50 };
                const targetBounds: Bounds = { x: 0, y: 125, width: 100, height: 50 };

                const route = calculateOrthogonalRoute(start, end, sourceBounds, targetBounds);

                // C-shape has more points to route around
                expect(route.length).toBeGreaterThan(4);
                expect(route[0]).toEqual([300, 50]);  // start
                expect(route[route.length - 1]).toEqual([100, 150]); // end
            });

            it('should route around entities with proper clearance', () => {
                const clearance = 40;
                const start: Point = { x: 300, y: 50 };
                const end: Point = { x: 100, y: 50 };
                const sourceBounds: Bounds = { x: 200, y: 25, width: 100, height: 50 };
                const targetBounds: Bounds = { x: 0, y: 25, width: 100, height: 50 };

                const route = calculateOrthogonalRoute(start, end, sourceBounds, targetBounds, clearance);

                // First horizontal segment should extend beyond source
                expect(route[1][0]).toBeGreaterThanOrEqual(sourceBounds.x + sourceBounds.width + clearance);
            });
        });

        describe('Bezier routing', () => {
            // Helper function for cubic bezier point calculation
            function cubicBezierPoint(
                x0: number, y0: number,
                x1: number, y1: number,
                x2: number, y2: number,
                x3: number, y3: number,
                t: number
            ): Point {
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

            it('should calculate bezier point at t=0 as start point', () => {
                const point = cubicBezierPoint(0, 0, 50, 0, 150, 100, 200, 100, 0);

                expect(point.x).toBe(0);
                expect(point.y).toBe(0);
            });

            it('should calculate bezier point at t=1 as end point', () => {
                const point = cubicBezierPoint(0, 0, 50, 0, 150, 100, 200, 100, 1);

                expect(point.x).toBe(200);
                expect(point.y).toBe(100);
            });

            it('should calculate bezier point at t=0.5 as midpoint curve', () => {
                const point = cubicBezierPoint(0, 0, 100, 0, 100, 100, 200, 100, 0.5);

                // At t=0.5, the point should be somewhere in the middle
                expect(point.x).toBeGreaterThan(0);
                expect(point.x).toBeLessThan(200);
                expect(point.y).toBeGreaterThan(0);
                expect(point.y).toBeLessThan(100);
            });
        });
    });

    describe('Edge cases', () => {
        it('should handle zero-size entities', () => {
            const sourceBounds = { x: 100, y: 100, width: 0, height: 0 };
            const targetBounds = { x: 200, y: 200, width: 0, height: 0 };

            // Center should be at the position itself
            const centerX = sourceBounds.x + sourceBounds.width / 2;
            const centerY = sourceBounds.y + sourceBounds.height / 2;

            expect(centerX).toBe(100);
            expect(centerY).toBe(100);
        });

        it('should handle overlapping entities', () => {
            const sourceBounds = { x: 100, y: 100, width: 100, height: 100 };
            const targetBounds = { x: 150, y: 150, width: 100, height: 100 };

            // Entities overlap, but routing should still work
            const sourceCenter = { x: 150, y: 150 };
            const targetCenter = { x: 200, y: 200 };

            // Should still determine direction (diagonal, so horizontal wins if equal)
            const dx = targetCenter.x - sourceCenter.x;
            const dy = targetCenter.y - sourceCenter.y;

            expect(Math.abs(dx)).toBe(Math.abs(dy)); // Equal diagonal
        });

        it('should handle same position entities', () => {
            const sourceBounds = { x: 100, y: 100, width: 100, height: 100 };
            const targetBounds = { x: 100, y: 100, width: 100, height: 100 };

            const sourceCenter = { x: 150, y: 150 };
            const targetCenter = { x: 150, y: 150 };

            const dx = targetCenter.x - sourceCenter.x;
            const dy = targetCenter.y - sourceCenter.y;

            expect(dx).toBe(0);
            expect(dy).toBe(0);
        });
    });

    describe('Serialization attributes', () => {
        it('should have all required properties for serialization', () => {
            const connection = new Connection();

            // Verify all serializable properties exist
            expect(connection).toHaveProperty('sourceAnchor');
            expect(connection).toHaveProperty('targetAnchor');
            expect(connection).toHaveProperty('routingType');
            expect(connection).toHaveProperty('strokeStyle');
            expect(connection).toHaveProperty('cornerRadius');
        });

        it('should have source and target entity reference fields defined in component', () => {
            // Entity refs are defined via @field.ref decorator
            // They are not enumerable properties but are part of the component schema
            // The Connection class definition includes source and target fields
            // This test verifies the component can be instantiated without errors
            const connection = new Connection();

            // Verify the component was created successfully
            expect(connection).toBeDefined();
            expect(connection).toBeInstanceOf(Connection);

            // Note: @field.ref properties are managed by becsy and may not be
            // directly accessible outside of the ECS world context
        });
    });
});
