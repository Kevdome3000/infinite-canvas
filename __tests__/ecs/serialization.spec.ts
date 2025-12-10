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
    ColumnLayout,
    Rect,
    ConnectionPlugin,
    LayoutPlugin,
    TransformPlugin,
    Polyline,
    Vec2
} from '../../packages/ecs/src';
import { entityToSerializedNodes } from '../../packages/ecs/src/utils/serialize/entity';
import { serializedNodesToEntities } from '../../packages/ecs/src/utils/deserialize/entity';

export const sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

describe('Serialization', () => {
    it('should serialize and deserialize ColumnLayout and Connection', async () => {
        const app = new App();

        const entities: { layout?: Entity; source?: Entity; target?: Entity; conn?: Entity } = {};

        const TestSetupPlugin: Plugin = (app) => {
            app.registerComponent(Polyline); // Needed for visual connection parts
            app.registerComponent(Rect); // Needed for layout parts
            system(PreStartUp)(StartUpSystem);
        };

        class StartUpSystem extends System {
            private readonly commands = new Commands(this);

            // We declare a query to ensure write access if needed
            q = this.query((q) => q.using(Transform, Connection, Polyline, ColumnLayout, Rect).write);

            initialize(): void {
                // Create ColumnLayout Entity
                const layoutCmd = this.commands.spawn(
                    new Transform({ translation: new Vec2(10, 10) }),
                    new ColumnLayout({
                        gap: 20,
                        padding: 15,
                        alignItems: 'center',
                        isAutoLayout: true
                    }),
                    new Rect({ width: 100, height: 200 })
                );
                entities.layout = layoutCmd.id().hold();

                // Create Source & Target for connection
                const sourceCmd = this.commands.spawn(new Transform({ translation: new Vec2(0, 0) }));
                const sourceEntity = sourceCmd.id().hold();
                entities.source = sourceEntity;

                const targetCmd = this.commands.spawn(new Transform({ translation: new Vec2(100, 100) }));
                const targetEntity = targetCmd.id().hold();
                entities.target = targetEntity;

                // Create Connection Entity
                const connCmd = this.commands.spawn(
                    new Connection({
                        source: sourceEntity,
                        target: targetEntity,
                        routingType: 'orthogonal',
                        strokeStyle: 'dashed'
                    }),
                    new Polyline() // Visual representation
                );
                entities.conn = connCmd.id().hold();
            }
        }

        app.addPlugins(TransformPlugin, LayoutPlugin, ConnectionPlugin, TestSetupPlugin);

        // Run the app loop to initialize entities
        await app.run();
        await sleep(50); // Allow systems to process

        // 1. Serialize entities
        const serializedNodes = [];
        if (entities.layout) serializedNodes.push(...entityToSerializedNodes(entities.layout));
        if (entities.conn) serializedNodes.push(...entityToSerializedNodes(entities.conn));

        // Check serialization output
        const layoutNode = serializedNodes.find(n => n.type === 'column-layout');
        expect(layoutNode).toBeDefined();
        expect((layoutNode as any).gap).toBe(20);
        expect((layoutNode as any).padding).toBe(15);
        expect((layoutNode as any).alignItems).toBe('center');

        const connNode = serializedNodes.find(n => n.type === 'connection');
        expect(connNode).toBeDefined();
        // Verify IDs match source/target (need to check how IDs are serialized, likely stringified entity ID)
        // entities.source.__id is internal, but serialization usually uses it to map.
        // However, `entityToSerializedNodes` uses internal `__id`? 
        // Yes: const id = entity.__id;

        expect((connNode as any).routingType).toBe('orthogonal');
        expect((connNode as any).strokeStyle).toBe('dashed');
        expect((connNode as any).source).toBe(entities.source?.__id);


        // 2. Deserialize (Mocking world)
        // We need a fresh Commands object usually, but testing deserialization function in isolation 
        // requires a mocked Commands or a real one attached to a system.
        // `serializedNodesToEntities` takes `commands: Commands`.

        // We can't easily spawn into the SAME world without conflicts or ID mapping issues strictly speaking,
        // but here we just want to verify the created components.
        // Let's rely on checking the serialized data mostly, as `serializedNodesToEntities` uses standard `commands.spawn`.

        // To strictly test deserialization, we would need to run it.
        // Let's assume serialization checking is the critical missing part requested by review.
        // But acceptance criteria said "Round-trip".

        // Validating "Round-trip" implies:
        // Serialize -> JSON -> Deserialize -> Check Components.

        // We can use the existing app's commands if we are careful or use a "mock" commands object
        // that captures spawn calls.

        const mockCommands: any = {
            spawn: () => {
                const entityStore: any = {
                    components: [],
                    insert: (component: any) => {
                        entityStore.components.push(component);
                        return entityStore;
                    },
                    appendChild: () => { },
                    id: () => ({ hold: () => ({}) })
                };
                return entityStore;
            }
        };

        // Mock idEntityMap to resolve references
        const idMap = new Map();
        // Pre-populate source/target in map so connection can resolve them
        idMap.set(entities.source!.__id, { id: () => entities.source });
        idMap.set(entities.target!.__id, { id: () => entities.target });

        const result = serializedNodesToEntities(
            serializedNodes,
            [], // fonts
            mockCommands,
            idMap
        );

        // Inspect created "entities"
        // We expect a ColumnLayout entity and Connection entity (plus children/parents if any)
        // Since we mocked spawn, `result.entities` will be our mock objects.

        // Actually `serializedNodesToEntities` returns { entities, idEntityMap }. 
        // The entries in `idEntityMap` values are the spawn results.

        // Let's filter for the one that has ColumnLayout component
        const allSpawned = Array.from(result.idEntityMap.values()) as any[];

        const layoutSpawn = allSpawned.find(e => e.components.some((c: any) => c instanceof ColumnLayout));
        expect(layoutSpawn).toBeDefined();
        const layoutComp = layoutSpawn.components.find((c: any) => c instanceof ColumnLayout);
        expect(layoutComp.gap).toBe(20);

        const connSpawn = allSpawned.find(e => e.components.some((c: any) => c instanceof Connection));
        expect(connSpawn).toBeDefined();
        const connComp = connSpawn.components.find((c: any) => c instanceof Connection);
        expect(connComp.strokeStyle).toBe('dashed');
        // Ensure source/target resolved
        expect(connComp.source).toBe(entities.source);
        expect(connComp.target).toBe(entities.target);

        await app.exit();
    });
});
