import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import type { QuestMarkerType } from '../../quests/QuestMarkers';
import { QUEST_MARKER_ART, QUEST_MARKER_FLOAT, QUEST_MARKER_GAP, questMarkerFloat } from './QuestMarkerArt';

/** The texture of a marker, drawn once per game. */
function textureOf(scene: Phaser.Scene, type: QuestMarkerType): string {
  const key = `fx_quest_marker_${type}`;
  if (scene.textures.exists(key)) return key;
  const { pixels, colors } = QUEST_MARKER_ART[type];
  const canvas = document.createElement('canvas');
  canvas.width = pixels[0].length;
  canvas.height = pixels.length;
  const ctx = canvas.getContext('2d')!;
  pixels.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    ctx.fillStyle = colors[c as keyof typeof colors];
    ctx.fillRect(x, y, 1, 1);
  }));
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * The quest marker above one NPC's head: a single world image that only ever changes its picture, so there
 * is never a second symbol. Fixed above the head of the standing pose (camera movement and zoom apply to it
 * like to the NPC), floating slowly by whole pixels. Above the world and fog, just below the name labels;
 * not interactive, so clicks on the NPC are as before.
 */
export class QuestMarker {
  private image: Phaser.GameObjects.Image | null = null;
  private shown: QuestMarkerType | null = null;
  private elapsed = 0;

  /** `headTop`: world point at the middle of the top of the head (whole pixels). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly headTop: { x: number; y: number },
  ) {}

  /** The marker shown now (for checks). */
  get type(): QuestMarkerType | null {
    return this.shown;
  }

  set(type: QuestMarkerType | null): void {
    if (type === this.shown) return;
    this.shown = type;
    if (type === null) {
      this.image?.setVisible(false);
      return;
    }
    const key = textureOf(this.scene, type);
    if (!this.image) this.image = this.scene.add.image(0, 0, key).setDepth(DEPTH.NamePlate - 1);
    this.image.setTexture(key).setOrigin(0.5, 1).setVisible(true);
    this.place();
  }

  update(deltaMs: number): void {
    if (this.shown === null) return;
    this.elapsed = (this.elapsed + deltaMs) % QUEST_MARKER_FLOAT.periodMs;
    this.place();
  }

  destroy(): void {
    this.image?.destroy();
    this.image = null;
  }

  private place(): void {
    this.image?.setPosition(this.headTop.x, this.headTop.y - QUEST_MARKER_GAP - questMarkerFloat(this.elapsed));
  }
}
