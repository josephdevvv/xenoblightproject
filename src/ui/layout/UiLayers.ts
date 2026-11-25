import Phaser from 'phaser';
import { layerSpace, type UiZooms } from './UiScale';

/**
 * The in-game UI's cameras (GameUIScene): one scene, three cameras over it - the HUD camera (zoomed by the HUD's UI
 * scale), the window camera (the windows' UI scale) and the screen camera (1x: the tutorial spotlight, which cuts its
 * hole in screen pixels around a control of either layer). Every object is drawn - and hit-tested - by exactly one of
 * them (Phaser's cameraFilter), chosen just before each frame is drawn:
 *
 *   'screen'  objects tagged so (the spotlight)
 *   'hud'     depth below 10 (HUD, banners, touch controls) and 36-39 (item notices)
 *   'windows' everything else (the windows at 10-24, the leave dialog, dialogue, the death screen)
 *
 * Text is re-rendered at its camera's zoom, so it stays sharp when scaled. Other scenes (menus) have none of this:
 * uiView / cameraOf fall back to the plain view and the main camera.
 */
export type UiLayer = 'hud' | 'windows' | 'screen';

/** Data key for an explicit layer (the spotlight's objects). */
export const UI_LAYER_KEY = 'uiLayer';
/** Data key for a text's own render resolution (a text scaled up on its layer, e.g. the spotlight label). */
export const TEXT_RESOLUTION_KEY = 'uiTextResolution';

interface Layers {
  cameras: Record<UiLayer, Phaser.Cameras.Scene2D.Camera>;
  zooms: Record<UiLayer, number>;
}

const registry = new WeakMap<Phaser.Scene, Layers>();
/** The layer an object was last given (so its filter / text resolution change only when it moves). */
const given = new WeakMap<Phaser.GameObjects.GameObject, UiLayer>();

export function layerOfDepth(depth: number): Exclude<UiLayer, 'screen'> {
  return depth < 10 || (depth >= 36 && depth < 40) ? 'hud' : 'windows';
}

/** Sets up the three cameras for a scene (before its UI is built: layouts read uiView). */
export function installUiLayers(scene: Phaser.Scene, zooms: Pick<UiZooms, 'hud' | 'windows'>): void {
  const main = scene.cameras.main;
  const { width, height } = scene.scale;
  const windows = scene.cameras.add(0, 0, width, height);
  const screen = scene.cameras.add(0, 0, width, height);
  for (const [cam, zoom] of [
    [main, zooms.hud],
    [windows, zooms.windows],
    [screen, 1],
  ] as const) {
    cam.setOrigin(0, 0).setZoom(zoom).setScroll(0, 0).setRoundPixels(true);
  }
  registry.set(scene, { cameras: { hud: main, windows, screen }, zooms: { hud: zooms.hud, windows: zooms.windows, screen: 1 } });
  const assign = (): void => assignUiLayers(scene);
  scene.events.on(Phaser.Scenes.Events.PRE_RENDER, assign);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.PRE_RENDER, assign);
    registry.delete(scene);
  });
}

/** The room (UI pixels) a layer lays out in: the view divided by its zoom (the plain view without layers). */
export function uiView(scene: Phaser.Scene, layer: UiLayer): { width: number; height: number } {
  const L = registry.get(scene);
  const view = { width: scene.scale.width, height: scene.scale.height };
  return L ? layerSpace(view, L.zooms[layer]) : view;
}

/** A layer's zoom (1 without UI layers). */
export function layerZoom(scene: Phaser.Scene, layer: UiLayer): number {
  return registry.get(scene)?.zooms[layer] ?? 1;
}

/** The layer of an object (its outermost container decides). */
export function layerOf(object: Phaser.GameObjects.GameObject): UiLayer {
  let top = object;
  while ((top as Phaser.GameObjects.Zone).parentContainer) top = (top as Phaser.GameObjects.Zone).parentContainer;
  const tagged = top.getData?.(UI_LAYER_KEY) as UiLayer | undefined;
  if (tagged) return tagged;
  return layerOfDepth((top as Partial<Phaser.GameObjects.Components.Depth>).depth ?? 0);
}

/** The camera that draws an object (the main camera in scenes without UI layers). */
export function cameraOf(scene: Phaser.Scene, object: Phaser.GameObjects.GameObject): Phaser.Cameras.Scene2D.Camera {
  const L = registry.get(scene);
  return L ? L.cameras[layerOf(object)] : scene.cameras.main;
}

/** A pointer in an object's layer coordinates. */
export function pointerIn(scene: Phaser.Scene, object: Phaser.GameObjects.GameObject, pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
  return cameraOf(scene, object).getWorldPoint(pointer.x, pointer.y);
}

/** Each top-level object to its layer's camera only; text at that camera's zoom. Runs before every render. */
export function assignUiLayers(scene: Phaser.Scene): void {
  const L = registry.get(scene);
  if (!L) return;
  const ids = { hud: L.cameras.hud.id, windows: L.cameras.windows.id, screen: L.cameras.screen.id };
  for (const o of scene.children.list) {
    const layer = layerOf(o);
    if (given.get(o) !== layer) {
      given.set(o, layer);
      // cameraFilter: the cameras that must NOT draw (or hit-test) it
      o.cameraFilter = (ids.hud | ids.windows | ids.screen) & ~ids[layer];
    }
    // text added later inside a container (window rows) is caught too: a cheap check per text
    sharpenText(o, L.zooms[layer]);
  }
}

function sharpenText(o: Phaser.GameObjects.GameObject, zoom: number): void {
  if (o instanceof Phaser.GameObjects.Text) {
    const resolution = (o.getData(TEXT_RESOLUTION_KEY) as number | undefined) ?? zoom;
    if (o.style.resolution !== resolution) o.setResolution(resolution);
  } else if (o instanceof Phaser.GameObjects.Container) {
    for (const child of o.list) sharpenText(child, zoom);
  }
}
