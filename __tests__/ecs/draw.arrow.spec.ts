import _gl from 'gl';
import '../useSnapshotMatchers';
import {
  Camera,
  Canvas,
  Children,
  Commands,
  DOMAdapter,
  DefaultPlugins,
  DefaultStateManagement,
  Entity,
  FillLayers,
  StrokeLayers,
  Grid,
  Parent,
  Plugin,
  PreStartUp,
  Renderable,
  Stroke,
  System,
  Theme,
  Transform,
  Visibility,
  system,
  API,
  Name,
  Ellipse,
  ZIndex,
  ComputeZIndex,
  Pen,
  Path,
  ToBeDeleted,
  PartialBinding,
  Binded,
  Binding,
  Flex,
  Opacity,
  GlobalTransform,
} from '../../packages/ecs/src';
import { createECSInteraction } from '../helpers/ecs-interaction';

describe('Draw arrow', () => {
  it('should render arrow correctly', async () => {
    const interaction = createECSInteraction();
    const { app, frames } = interaction;
    let api: API;

    let $canvas: HTMLCanvasElement | undefined;
    let canvasEntity: Entity | undefined;
    let cameraEntity: Entity | undefined;

    const MyPlugin: Plugin = () => {
      system(PreStartUp)(StartUpSystem);
      system((s) => s.before(ComputeZIndex))(StartUpSystem);
    };

    class StartUpSystem extends System {
      private readonly commands = new Commands(this);

      q = this.query(
        (q) =>
          q.using(
            Canvas,
            Theme,
            Grid,
            Camera,
            Parent,
            Children,
            Transform,
            Renderable,
            FillLayers,
            StrokeLayers,
            Stroke,
            Ellipse,
            Visibility,
            Name,
            ZIndex,
            Binding,
            Binded,
            PartialBinding,
            ToBeDeleted,
            Flex,
            Opacity,
            GlobalTransform,
          ).write,
      );

      initialize(): void {
        $canvas = DOMAdapter.get().createCanvas(200, 200) as HTMLCanvasElement;

        api = new API(new DefaultStateManagement(), this.commands);

        canvasEntity = api.createCanvas({
          element: $canvas,
          width: 200,
          height: 200,
          devicePixelRatio: 1,
        });

        cameraEntity = api.createCamera({
          zoom: 1,
        });

        api.setAppState({
          penbarSelected: Pen.DRAW_ARROW,
          penbarDrawArrow: {
            strokes: [{ type: 'solid', value: 'black', opacity: 1 }],
            strokeWidth: 4,
            markerStart: 'line',
            markerEnd: 'line',
            markerFactor: 3,
          },
        });
      }
    }

    app.addPlugins(...DefaultPlugins, MyPlugin);

    const originalPathHitTest = Path.hitTestProvider;
    // The only path is an unbound preview; it cannot be a binding target.
    // Keep pointer/controller and real GL rendering, without Node Path2D picking.
    Path.hitTestProvider = () => false;
    try {
      await app.run();
      await frames();
      await interaction.mouse($canvas!, 'mousedown', 50, 50);
      await interaction.mouse($canvas!, 'mousemove', 50, 50);
      await interaction.mouse($canvas!, 'mousemove', 100, 100);
      await interaction.mouse($canvas!, 'mousemove', 150, 150);
      await interaction.mouse($canvas!, 'mouseup', 150, 150);
      // The first click establishes the source; pointer motion only previews.
      expect(api!.getAppState().penbarSelected).toBe(Pen.DRAW_ARROW);
      expect(api!.getNodes()).toHaveLength(1);
      const previewId = api!.getNodes()[0].id;
      // The historical baseline captures the source-to-pointer preview.
      await frames(6);
      const dir = `${__dirname}/snapshots`;
      await expect($canvas!.getContext('webgl1')).toMatchWebGLSnapshot(
        dir,
        'draw-arrow',
      );
      await interaction.mouse($canvas!, 'mousedown', 150, 150);
      await interaction.mouse($canvas!, 'mouseup', 150, 150);
      await frames(6);
      expect(api!.getNodes()).toHaveLength(1);
      expect(api!.getNodes()[0].id).not.toBe(previewId);
      expect(api!.getAppState().penbarSelected).toBe(Pen.SELECT);
      expect(api!.getAppState().layersSelected).toEqual([api!.getNodes()[0].id]);

    } finally {
      try {
        await interaction.dispose();
      } finally {
        Path.hitTestProvider = originalPathHitTest;
      }
    }
  });
});
