/// <reference types="jest" />
import {
    App,
    Commands,
    Entity,
    Plugin,
    PreStartUp,
    System,
    Transform,
    system,
    Connection,
    ConnectionPlugin,
    TransformPlugin,
    Polyline,
    Vec2
} from '../../packages/ecs/src';
import { sleep } from '../utils';

describe('ConnectionRouting', () => {
    it('should routing connection points', async () => {
        const app = new App();

        const entities: { source?: Entity; target?: Entity; conn?: Entity } = {};

        const TestSetupPlugin: Plugin = (app) => {
            // Register components used in our test scene (but not in Plugins used)
            // ConnectionPlugin registers Connection and Polyline? 
            // ConnectionPlugin registers Connection and ConnectionRoutingSystem.
            // ConnectionRoutingSystem writes to Polyline.
            // So we need to ensure Polyline is registered.
            // Polyline is usually in RendererPlugin.
            app.registerComponent(Polyline);

            system(PreStartUp)(StartUpSystem);
        };

        class StartUpSystem extends System {
            private readonly commands = new Commands(this);

            // Query components to ensure writability if needed
            q = this.query((q) => q.using(Transform, Connection, Polyline).write);

            initialize(): void {
                // Source at 0,0
                const sourceCmd = this.commands.spawn(new Transform({ translation: new Vec2(0, 0) }));
                const sourceEntity = sourceCmd.id().hold();
                entities.source = sourceEntity;

                // Target at 100, 100
                const targetCmd = this.commands.spawn(new Transform({ translation: new Vec2(100, 100) }));
                const targetEntity = targetCmd.id().hold();
                entities.target = targetEntity;

                // Connection
                const connCmd = this.commands.spawn(
                    new Connection({
                        source: sourceEntity,
                        target: targetEntity,
                        routingType: 'orthogonal',
                        strokeStyle: 'solid'
                    }),
                    new Polyline() // System expects Polyline to exist or it creates it? 
                    // Checking system: "const polyline = entity.write(Polyline);"
                    // If component doesn't exist, write might fail or require it to be added first.
                    // Safe to add it.
                );
                const connEntity = connCmd.id().hold();
                entities.conn = connEntity;
            }
        }

        app.addPlugins(TransformPlugin, ConnectionPlugin, TestSetupPlugin);

        // Run the app loop
        await app.run();

        // Allow Systems to cycle
        await sleep(100);

        // Assertions
        const { conn } = entities;
        if (conn) {
            const polyline = conn.read(Polyline);
            const points = polyline.points;

            // Orthogonal Routing from 0,0 to 100,100
            // Expected: (0,0) -> (50,0) -> (50,100) -> (100,100)
            // MidX = 50.

            expect(points.length).toBe(3);

            // Point 1: 0,0
            expect(points[0][0]).toBeCloseTo(0);
            expect(points[0][1]).toBeCloseTo(0);

            // Point 2: 50,0 (MidX, StartY) -- Wait, system implementation:
            // const midX = (startX + endX) / 2;
            // points.push(new Vec2(midX, startY));
            // points.push(new Vec2(midX, endY));
            // points.push(new Vec2(endX, endY));
            // Plus start point (startX, startY).
            // So 4 points?
            // Let's re-read ConnectionRoutingSystem.ts snippet from memory/context:
            /*
              const points: Vec2[] = [];
              points.push(new Vec2(startX, startY));
              if (routingType === 'orthogonal') {
                 const midX = (startX + endX) / 2;
                 points.push(new Vec2(midX, startY));
                 points.push(new Vec2(midX, endY));
                 points.push(new Vec2(endX, endY));
              }
            */
            // So YES, 4 points.

            expect(points.length).toBe(4);

            // 0: 0,0
            expect(points[0][0]).toBe(0);
            expect(points[0][1]).toBe(0);

            // 1: 50,0
            expect(points[1][0]).toBe(50);
            expect(points[1][1]).toBe(0);

            // 2: 50,100
            expect(points[2][0]).toBe(50);
            expect(points[2][1]).toBe(100);

            // 3: 100,100
            expect(points[3][0]).toBe(100);
            expect(points[3][1]).toBe(100);

        } else {
            throw new Error("Entities not created");
        }

        await app.exit();
    });
});
