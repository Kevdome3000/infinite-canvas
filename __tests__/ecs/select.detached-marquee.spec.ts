import {
  Children,
  Pen,
  PreStartUp,
  RBush,
  System,
  system,
  type API,
} from '../../packages/ecs/src';
import { createSelectionWorld } from '../helpers/ecs-selection';

it('ignores an indexed detached transient entity and keeps document selection/save healthy', async () => {
  let action: ((system: System) => void) | undefined;
  class LifecycleProbe extends System {
    access = this.query((q) => q.usingAll.write);
    execute() {
      const next = action;
      action = undefined;
      next?.(this);
    }
    spawn() {
      return this.createEntity();
    }
  }
  const world = await createSelectionWorld(1, [
    () => {
      system(PreStartUp)(LifecycleProbe);
      system((s) => s.inAnyOrderWith(s.allSystems))(LifecycleProbe);
    },
  ]);
  const [api]: API[] = world.apis;
  try {
    api.setAppState({ penbarSelected: Pen.SELECT });
    await world.reset(api, [
      {
        id: 'root',
        type: 'rect',
        x: 30,
        y: 30,
        width: 20,
        height: 20,
        zIndex: 0,
      },
    ]);
    await world.frames();
    const saved = JSON.parse(JSON.stringify(api.getNodes()));
    // Becsy clears a ref when its target retires. The child remains live in
    // the spatial index until lifecycle cleanup; it is not a document node.
    let orphan!: ReturnType<LifecycleProbe['spawn']>;
    action = (probe) => {
      const parent = (probe as LifecycleProbe).spawn();
      orphan = (probe as LifecycleProbe).spawn().hold();
      orphan.add(Children, { parent });
      api
        .getCamera()
        .read(RBush)
        .value.insert({
          minX: 60,
          minY: 60,
          maxX: 70,
          maxY: 70,
          entity: orphan,
        });
      parent.delete();
    };
    await world.frames();
    action = () => expect(orphan.read(Children).parent).toBeUndefined();
    await world.frames();
    await world.pointer(api, 'pointerdown', 5, 5, { buttons: 1 });
    await world.pointer(api, 'pointermove', 100, 100, { buttons: 1 });
    await world.pointer(api, 'pointerup', 100, 100, { buttons: 0 });
    expect(api.getAppState().layersSelected).toEqual(['root']);
    expect(JSON.parse(JSON.stringify(api.getNodes()))).toEqual(saved);
    action = () => {
      api
        .getCamera()
        .read(RBush)
        .value.remove(
          { entity: orphan, minX: 60, minY: 60, maxX: 70, maxY: 70 },
          (a, b) => a.entity === b.entity,
        );
      orphan.delete();
    };
    await world.frames();
    await world.reset(api, saved);
    await world.frames();
    expect(JSON.parse(JSON.stringify(api.getNodes()))).toEqual(saved);
  } finally {
    await world.dispose();
  }
});
