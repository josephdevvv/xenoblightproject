import Phaser from 'phaser';
import { PALETTE } from '../../config/palette';
import type { CharacterData } from '../../data/CharacterData';
import { t, type TranslationKey, type TranslationParams } from '../../i18n';
import { labels } from '../../i18n/labels';
import { localize } from '../../i18n/phaser';
import {
  activeTreeDefinition,
  availablePoints,
  checkUpgrade,
  isCenterUnlocked,
  rankOf,
  spentPoints,
  tutorialStep,
  type PassiveProgress,
  type PassiveTutorialStep,
} from '../../passives/PassiveProgress';
import { passiveNode, type PassiveEffect, type PassiveNodeDefinition } from '../../passives/PassiveTree';
import { PassiveTreeService } from '../../passives/PassiveTreeService';
import { CharacterStatusService } from '../../status/CharacterStatusService';
import { DERIVED_DISPLAY, formatStatValue } from '../../status/DerivedStats';
import { GameServices } from '../../systems/GameServices';
import { fitText } from '../text/fitText';
import type { TypographyRole } from '../text/Typography';
import { typo } from '../UITheme';
import {
  NODE_FRAME,
  nodeCenter,
  octagonRows,
  PASSIVE_ICON_SHEET,
  PASSIVE_ICON_TEXTURE,
  PASSIVE_TREE_LAYERS,
  passiveIconFrame,
  passiveTreeTextureKey,
  TREE_UI,
  type Rect,
} from './PassiveTreeLayout';

/** Pack colours (flat, from the layer art). */
const C = {
  line: 0xe7e7ee,
  dim: 0x3a3a45,
  fill: 0x0e0e12,
  red: 0xd3424b,
  redText: '#d3424b',
  lineText: '#e7e7ee',
} as const;
const PERCENT_STATS = new Set<string>([...DERIVED_DISPLAY.filter((d) => d.percent).map((d) => d.key as string), 'aspdPercent']);

interface NodeView {
  def: PassiveNodeDefinition;
  x: number;
  y: number;
  size: number;
  cut: number;
  frame: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  rank: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
}

/** A rectangle button on the baked art: hit zone, game-rendered label, 1-px hover outline, dim veil. */
export class FrameButton {
  readonly label: Phaser.GameObjects.Text;
  private readonly hover: Phaser.GameObjects.Graphics;
  private readonly veil: Phaser.GameObjects.Rectangle;
  readonly zone: Phaser.GameObjects.Zone;
  private enabled = true;
  private pressed = false;

  constructor(scene: Phaser.Scene, root: Phaser.GameObjects.Container, private readonly rect: Rect, color: string, onClick: () => void) {
    const [x, y, w, h] = rect;
    this.label = scene.add.text(Math.round(x + w / 2), Math.round(y + h / 2), '', typo('button', color)).setOrigin(0.5);
    this.hover = scene.add.graphics().setVisible(false);
    strokeRect(this.hover, x + 2, y + 2, w - 4, h - 4, C.line);
    this.veil = scene.add.rectangle(x + 1, y + 1, w - 2, h - 2, C.fill, 0.6).setOrigin(0, 0).setVisible(false);
    this.zone = scene.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.zone.on('pointerover', () => this.hover.setVisible(this.enabled));
    this.zone.on('pointerout', () => this.resetHover());
    this.zone.on('pointerdown', () => (this.pressed = true));
    this.zone.on('pointerup', () => {
      const fire = this.pressed && this.enabled;
      this.pressed = false;
      if (fire) onClick();
    });
    root.add([this.hover, this.label, this.veil, this.zone]);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.veil.setVisible(!on);
    if (!on) this.hover.setVisible(false);
  }

  resetHover(): void {
    this.hover.setVisible(false);
    this.pressed = false;
  }

  /** Shows or removes the button (a removed one takes no clicks). */
  setVisible(on: boolean): void {
    this.label.setVisible(on);
    this.veil.setVisible(on && !this.enabled);
    this.zone.setVisible(on);
    if (this.zone.input) this.zone.input.enabled = on;
    if (!on) this.resetHover();
  }

  get bounds(): Rect {
    return this.rect;
  }
}

function strokeRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}

/** Crisp 1-px octagon (outline + optional fill) with its top-left at (x, y). */
function drawOctagon(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, cut: number, line: number, fill: number | null): void {
  const rows = octagonRows(size, cut);
  rows.forEach(([l, r], row) => {
    if (fill !== null && row > 0 && row < size - 1 && r - l > 1) {
      g.fillStyle(fill, 1);
      g.fillRect(x + l + 1, y + row, r - l - 1, 1);
    }
    g.fillStyle(line, 1);
    if (row === 0 || row === size - 1) g.fillRect(x + l, y + row, r - l + 1, 1);
    else {
      g.fillRect(x + l, y + row, 1, 1);
      g.fillRect(x + r, y + row, 1, 1);
    }
  });
}

/**
 * The Drifter Passive Tree window (minimal layer pack chrome + data-driven tree). Mouse: click a node
 * to select it, UNLOCK / UPGRADE spends a point, RESET refunds the optional nodes, CLOSE / Esc / P
 * closes. Keyboard: arrows move the selection along the branches, Enter / Space upgrades. A modal blocker
 * swallows every click outside the window, so nothing reaches the world behind it.
 */
export class PassiveTreeWindow {
  static async load(): Promise<void> {
    const services = await GameServices.ready();
    await Promise.all([
      ...PASSIVE_TREE_LAYERS.map((layer) =>
        services.assets
          .load({ key: passiveTreeTextureKey(layer.id), type: 'image', url: layer.url })
          .catch((e: Error) => console.warn(`[passiveTree] ${e.message}`)),
      ),
      services.assets
        .load({ key: PASSIVE_ICON_TEXTURE, type: 'spritesheet', url: PASSIVE_ICON_SHEET.url, frameWidth: PASSIVE_ICON_SHEET.frameSize, frameHeight: PASSIVE_ICON_SHEET.frameSize })
        .catch((e: Error) => console.warn(`[passiveTree] ${e.message}`)),
    ]);
  }

  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly selectRing: Phaser.GameObjects.Graphics;
  private readonly nodes: NodeView[] = [];
  private readonly classText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly pointsText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly keysText: Phaser.GameObjects.Text;
  private readonly tooltip: Phaser.GameObjects.Text;
  private readonly detailIcon: Phaser.GameObjects.Image;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly rankText: Phaser.GameObjects.Text;
  private readonly requireText: Phaser.GameObjects.Text;
  private readonly effectTexts: Phaser.GameObjects.Text[];
  private readonly unlockButton: FrameButton;
  private readonly resetButton: FrameButton;
  private readonly closeButton: FrameButton;
  private readonly unsubscribe: () => void;
  private selectedId: string | null = null;
  private message: { key: TranslationKey; params?: TranslationParams; color: string } | null = null;
  private open = false;
  /** Called when the window opens / closes / the tutorial step changes (HUD guidance). */
  onStateChange: (() => void) | null = null;
  /** When the tutorial may guide the player (the tree itself always works). */
  tutorialEnabled: () => boolean = () => true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly character: CharacterData,
    depth: number,
  ) {
    const { width: sw, height: sh } = scene.scale;
    const [wx, wy, ww, wh] = TREE_UI.window;
    const ox = Math.round((sw - ww) / 2) - wx;
    const oy = Math.round((sh - wh) / 2) - wy;

    this.blocker = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.55).setOrigin(0, 0).setDepth(depth).setInteractive();
    this.root = scene.add.container(ox, oy).setDepth(depth + 1);

    // 1. Chrome (pack layers in render order); a window-sized zone keeps clicks on empty areas inside.
    this.root.add(scene.add.zone(wx, wy, ww, wh).setOrigin(0, 0).setInteractive());
    for (const layer of PASSIVE_TREE_LAYERS) {
      const key = passiveTreeTextureKey(layer.id);
      if (scene.textures.exists(key)) this.root.add(scene.add.image(layer.x, layer.y, key).setOrigin(0, 0));
    }

    // 2. Header: class on the left, title in the centre box, points in the right box.
    const H = TREE_UI.header;
    this.classText = this.text(H.classX, H.textY, '', 'label', PALETTE.silver);
    const [tx, ty, tw, th] = H.title;
    this.titleText = this.text(tx + tw / 2, ty + th / 2, '', 'section', C.lineText).setOrigin(0.5);
    const [px, py, pw, ph] = H.points;
    this.pointsText = this.text(px + pw / 2, py + ph / 2, '', 'label', C.lineText).setOrigin(0.5);
    this.root.add([this.classText, this.titleText, this.pointsText]);

    // 3. Tree: lines under the nodes, selection ring.
    this.lines = scene.add.graphics();
    this.selectRing = scene.add.graphics();
    this.root.add([this.lines, this.selectRing]);
    const tree = activeTreeDefinition(this.progress());
    for (const def of tree.nodes) this.buildNode(def);
    this.hintText = this.text(TREE_UI.hint.cx, TREE_UI.hint.y, '', 'small', PALETTE.silver).setOrigin(0.5, 0);
    this.keysText = this.text(TREE_UI.keys.x, TREE_UI.keys.y, '', 'small', PALETTE.slate);
    this.tooltip = this.text(0, 0, '', 'tooltip', PALETTE.white).setBackgroundColor(PALETTE.black).setPadding(3, 1, 3, 1).setOrigin(0.5, 1).setVisible(false);
    this.root.add([this.hintText, this.keysText]);

    // 4. Detail strip: icon, name / rank / requirement, effect, unlock button.
    const D = TREE_UI.detail;
    const frameHalf = Math.floor(PASSIVE_ICON_SHEET.frameSize / 2);
    this.detailIcon = scene.add.image(D.icon.cx - frameHalf, D.icon.cy - frameHalf, PASSIVE_ICON_TEXTURE, 0).setOrigin(0, 0);
    this.nameText = this.text(D.info.x, D.rows[0], '', 'label', PALETTE.white);
    this.rankText = this.text(D.info.x, D.rows[1], '', 'small', PALETTE.silver);
    this.requireText = this.text(D.info.x, D.rows[2], '', 'small', PALETTE.gray);
    this.effectTexts = D.rows.map((y) => this.text(D.effect.x, y, '', 'small', PALETTE.pale));
    this.root.add([this.detailIcon, this.nameText, this.rankText, this.requireText, ...this.effectTexts]);
    this.unlockButton = new FrameButton(scene, this.root, D.unlock, C.lineText, () => this.upgradeSelected());

    // 5. Footer.
    this.resetButton = new FrameButton(scene, this.root, TREE_UI.footer.reset, C.lineText, () => this.reset());
    this.closeButton = new FrameButton(scene, this.root, TREE_UI.footer.close, C.redText, () => this.close());
    this.root.add(this.tooltip);

    // Keyboard (only while open): arrows select, Enter / Space upgrade. P toggles (GameUIScene), Esc closes (GameScene).
    const onKey = (e: KeyboardEvent): void => {
      if (!this.open) return;
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dir[e.key]) {
        e.preventDefault();
        this.moveSelection(...dir[e.key]);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.upgradeSelected();
      }
    };
    scene.input.keyboard?.on('keydown', onKey);

    this.unsubscribe = CharacterStatusService.onChange((changed) => {
      if (changed === this.character) this.refresh();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe();
      scene.input.keyboard?.off('keydown', onKey);
    });

    localize(scene, () => this.refresh());
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The current tutorial step (HUD shows 'open'; the window shows 'select' / 'unlock'). */
  get tutorial(): PassiveTutorialStep {
    if (!this.tutorialEnabled()) return null;
    return tutorialStep(this.progress(), this.open, this.selectedId);
  }

  /** The control the tutorial asks for now (spotlight target), or null. */
  get tutorialControl(): Phaser.GameObjects.Zone | null {
    const step = this.tutorial;
    if (step === 'unlock') return this.unlockButton.zone;
    if (step !== 'select') return null;
    const { centerId } = activeTreeDefinition(this.progress());
    return this.nodes.find((n) => n.def.id === centerId)?.zone ?? null;
  }

  show(): void {
    // Tutorial: nothing selected so the player is asked to select the center; afterwards keep the last selection.
    const p = this.progress();
    if (!this.selectedId && isCenterUnlocked(p)) this.selectedId = activeTreeDefinition(p).centerId;
    this.message = null;
    this.setVisible(true);
    this.refresh();
    this.onStateChange?.();
  }

  close(): void {
    for (const b of [this.unlockButton, this.resetButton, this.closeButton]) b.resetHover();
    this.tooltip.setVisible(false);
    this.setVisible(false);
    this.onStateChange?.();
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  select(nodeId: string): void {
    if (!passiveNode(activeTreeDefinition(this.progress()), nodeId)) return;
    this.selectedId = nodeId;
    this.message = null;
    this.refresh();
    this.onStateChange?.();
  }

  /** Upgrades the selected node (re-validated by the rules). */
  upgradeSelected(): void {
    const id = this.selectedId;
    if (!id) return;
    const before = this.progress();
    const wasCenterUnlocked = isCenterUnlocked(before);
    const error = PassiveTreeService.upgrade(this.character, id);
    const tree = activeTreeDefinition(this.progress());
    const node = passiveNode(tree, id)!;
    if (error) {
      const params = node.requires ? { node: labels.passiveNode(node.requires) } : undefined;
      this.message = { key: `passive.errors.${error}` as TranslationKey, params, color: C.redText };
    } else if (!wasCenterUnlocked && isCenterUnlocked(this.progress())) {
      this.message = { key: 'passive.branchesOpen', color: C.redText };
    } else {
      const rank = rankOf(this.progress(), id);
      this.message = rank === 1
        ? { key: 'passive.unlocked', params: { node: labels.passiveNode(id) }, color: PALETTE.silver }
        : { key: 'passive.upgraded', params: { node: labels.passiveNode(id), rank }, color: PALETTE.silver };
    }
    this.refresh();
    this.onStateChange?.();
  }

  reset(): void {
    const refunded = PassiveTreeService.resetOptional(this.character);
    this.message = refunded > 0 ? { key: 'passive.resetDone', params: { points: refunded }, color: PALETTE.silver } : { key: 'passive.resetNothing', color: PALETTE.gray };
    this.refresh();
  }

  // ---------------------------------------------------------------------------------------------

  private progress(): PassiveProgress {
    return this.character.passives!;
  }

  private buildNode(def: PassiveNodeDefinition): void {
    const { x, y } = nodeCenter(def.branch, def.step);
    const { size, cut } = def.branch === 'center' ? NODE_FRAME.center : NODE_FRAME.branch;
    const half = (size - 1) / 2;
    const frame = this.scene.add.graphics();
    const frameHalf = Math.floor(PASSIVE_ICON_SHEET.frameSize / 2);
    const icon = this.scene.add.image(x - frameHalf, y - frameHalf, PASSIVE_ICON_TEXTURE, passiveIconFrame(def.icon)).setOrigin(0, 0);
    const rank = this.text(x + half + 1, y + half - 9, '', 'small', PALETTE.silver);
    const zone = this.scene.add.zone(x - half, y - half, size, size).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.select(def.id));
    zone.on('pointerover', () => {
      this.tooltip.setText(labels.passiveNode(def.id)).setPosition(x, y - half - 3).setVisible(true);
    });
    zone.on('pointerout', () => this.tooltip.setVisible(false));
    this.root.add([frame, icon, rank, zone]);
    this.nodes.push({ def, x, y, size, cut, frame, icon, rank, zone });
  }

  /** Arrow keys: the nearest node in that direction on the same row / column. */
  private moveSelection(dx: number, dy: number): void {
    const from = this.nodes.find((n) => n.def.id === this.selectedId) ?? this.nodes.find((n) => n.def.branch === 'center')!;
    if (!this.selectedId) {
      this.select(from.def.id);
      return;
    }
    let best: NodeView | null = null;
    let bestDist = Infinity;
    for (const n of this.nodes) {
      const vx = n.x - from.x;
      const vy = n.y - from.y;
      const along = vx * dx + vy * dy;
      const across = Math.abs(vx * dy - vy * dx);
      if (along <= 0 || across > 4) continue;
      if (along < bestDist) {
        bestDist = along;
        best = n;
      }
    }
    if (best) this.select(best.def.id);
  }

  private refresh(): void {
    if (!this.open) return;
    const p = this.progress();
    const tree = activeTreeDefinition(p);
    const points = availablePoints(p);

    this.classText.setText(`${t('passive.classLabel')}  ${labels.passiveClass(tree.id)}`);
    this.titleText.setText(t('passive.title'));
    this.pointsText.setText(t('passive.points', { points })).setColor(points > 0 ? C.redText : C.lineText);
    this.keysText.setText(t('passive.keys'));

    // Lines: parent edge -> child edge, lit once the child has a rank.
    this.lines.clear();
    for (const n of this.nodes) {
      if (!n.def.requires) continue;
      const parent = this.nodes.find((m) => m.def.id === n.def.requires)!;
      const lit = rankOf(p, n.def.id) > 0;
      this.lines.fillStyle(lit ? C.line : C.dim, 1);
      const ph = (parent.size - 1) / 2, nh = (n.size - 1) / 2;
      if (parent.y === n.y) {
        const [a, b] = parent.x < n.x ? [parent.x + ph + 1, n.x - nh - 1] : [n.x + nh + 1, parent.x - ph - 1];
        this.lines.fillRect(a, n.y, b - a + 1, 1);
      } else {
        this.lines.fillRect(n.x, parent.y + ph + 1, 1, n.y - nh - 1 - (parent.y + ph + 1) + 1);
      }
    }

    // Nodes: locked (dim), available (white, icon half bright), learned (white, full icon).
    for (const n of this.nodes) {
      const rank = rankOf(p, n.def.id);
      const error = checkUpgrade(p, n.def.id);
      const locked = rank === 0 && error === 'requires';
      const left = n.x - (n.size - 1) / 2, top = n.y - (n.size - 1) / 2;
      n.frame.clear();
      drawOctagon(n.frame, left, top, n.size, n.cut, locked ? C.dim : C.line, C.fill);
      if (rank > 0 && n.def.branch !== 'center') drawOctagon(n.frame, left + 2, top + 2, n.size - 4, n.cut - 1, C.dim, null);
      n.icon.setAlpha(rank > 0 ? 1 : locked ? 0.28 : 0.6);
      const maxed = rank >= n.def.maxRank;
      n.rank.setText(`${rank}/${n.def.maxRank}`).setColor(maxed ? C.redText : rank > 0 ? PALETTE.pale : PALETTE.slate);
    }

    // Selection ring (red, like the pack's selected state).
    this.selectRing.clear();
    const sel = this.nodes.find((n) => n.def.id === this.selectedId);
    if (sel) drawOctagon(this.selectRing, sel.x - (sel.size + 5) / 2, sel.y - (sel.size + 5) / 2, sel.size + 6, sel.cut + 2, C.red, null);

    // Hint line: the last action's message (the tutorial has its own spotlight and label).
    if (this.message) this.hintText.setText(t(this.message.key, this.message.params)).setColor(this.message.color);
    else this.hintText.setText('');

    this.refreshDetail(p, points);
    this.resetButton.label.setText(t('passive.reset'));
    this.closeButton.label.setText(t('passive.close'));
    this.resetButton.setEnabled(spentPoints(p) - rankOf(p, tree.centerId) > 0);
  }

  private refreshDetail(p: PassiveProgress, points: number): void {
    const D = TREE_UI.detail;
    const tree = activeTreeDefinition(p);
    const node = this.selectedId ? passiveNode(tree, this.selectedId) : undefined;
    const visible = !!node;
    for (const o of [this.detailIcon, this.nameText, this.rankText, this.requireText, ...this.effectTexts]) o.setVisible(visible);
    if (!node) {
      this.unlockButton.label.setText(t('passive.unlock'));
      this.unlockButton.setEnabled(false);
      return;
    }
    const rank = rankOf(p, node.id);
    this.detailIcon.setFrame(passiveIconFrame(node.icon));
    fitText(this.nameText, labels.passiveNode(node.id), D.info.right - D.info.x);
    this.rankText.setText(t('passive.rank', { rank, max: node.maxRank }));
    if (!node.requires) {
      this.requireText.setText(t('passive.requiresFirst')).setColor(PALETTE.gray);
    } else {
      const met = rankOf(p, node.requires) >= 1;
      fitText(this.requireText, t(met ? 'passive.requiresMet' : 'passive.requires', { node: labels.passiveNode(node.requires) }), D.info.right - D.info.x);
      this.requireText.setColor(met ? PALETTE.gray : C.redText);
    }

    const width = D.effect.right - D.effect.x;
    const perRank = effectText(node.effects, 1);
    fitText(this.effectTexts[0], node.maxRank === 1 ? t('passive.effect', { effect: perRank }) : t('passive.perRank', { effect: perRank }), width);
    fitText(this.effectTexts[1], rank > 0 ? t('passive.current', { effect: effectText(node.effects, rank) }) : t('passive.noneYet'), width);
    this.effectTexts[1].setColor(rank > 0 ? PALETTE.white : PALETTE.gray);
    const futureOnly = node.effects.some((e) => e.kind === 'skill');
    fitText(this.effectTexts[2], futureOnly ? t('passive.notActive') : '', width);
    this.effectTexts[2].setColor(C.redText);

    const maxed = rank >= node.maxRank;
    this.unlockButton.label.setText(t(maxed ? 'passive.maxed' : rank > 0 ? 'passive.upgrade' : 'passive.unlock'));
    this.unlockButton.setEnabled(!maxed && points > 0 && checkUpgrade(p, node.id) === null);
  }

  private text(x: number, y: number, value: string, role: TypographyRole, color: string): Phaser.GameObjects.Text {
    return this.scene.add.text(Math.round(x), Math.round(y), value, typo(role, color));
  }

  private setVisible(visible: boolean): void {
    this.open = visible;
    this.root.setVisible(visible);
    this.blocker.setVisible(visible);
    if (visible) this.blocker.setInteractive();
    else this.blocker.disableInteractive();
    this.root.each((child: Phaser.GameObjects.GameObject) => {
      if (child.input) child.input.enabled = visible;
    });
  }
}

/** "Melee ATK +3, Max HP +5" for `rank` ranks of a node's effects. */
export function effectText(effects: readonly PassiveEffect[], rank: number): string {
  return effects
    .map((e) => {
      const value = formatStatValue(e.amount * rank);
      if (e.kind === 'flat') return `${labels.derived(e.stat)} +${value}${PERCENT_STATS.has(e.stat) ? '%' : ''}`;
      if (e.kind === 'maxHpPercent') return t('passive.effects.maxHpPercent', { value });
      return t(`passive.effects.${e.modifier}`, { value });
    })
    .join(', ');
}
