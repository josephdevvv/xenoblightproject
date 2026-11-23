import type { HotbarEntry } from '../../hotbar/Hotbar';
import { itemDefinition, itemIconKey } from '../../items/ItemCatalog';
import { SKILL_DEFINITIONS, type SkillId } from '../../skills/SkillDefinitions';
import { PASSIVE_ICON_TEXTURE, passiveIconFrame } from '../passiveTree/PassiveTreeLayout';

/** The picture of a hotbar entry, wherever it is shown (HUD hotbar, assignment window): one rule. */
export interface EntryIcon {
  texture: string;
  frame?: number;
  /** Scale that fits the HUD slot (item icons 16 px, skill icons from the passive icon sheet). */
  hudScale: number;
  /** Scale in the larger slots of the assignment window. */
  largeScale: number;
}

export function skillIcon(id: SkillId): EntryIcon {
  return { texture: PASSIVE_ICON_TEXTURE, frame: passiveIconFrame(SKILL_DEFINITIONS[id].icon), hudScale: 1, largeScale: 1 };
}

/** HUD hotbar slot (33 x 37) and assignment window slot (40 x 40): the room an icon may fill. */
const HUD_BOX = 28;
const LARGE_BOX = 32;

/** Whole-number scale that fits `size` into `box`; never below 1 (a 32 px icon stays 1:1 - no blurred shrink). */
export function wholeScale(size: number, box: number): number {
  return Math.max(1, Math.floor(box / Math.max(1, size)));
}

export function entryIcon(entry: HotbarEntry): EntryIcon | null {
  if (entry.type === 'item') {
    const icon = itemDefinition(entry.itemId)?.icon;
    const size = icon ? Math.max(icon.width, icon.height) : 16;
    return { texture: itemIconKey(entry.itemId), hudScale: wholeScale(size, HUD_BOX), largeScale: wholeScale(size, LARGE_BOX) };
  }
  return entry.skillId in SKILL_DEFINITIONS ? skillIcon(entry.skillId as SkillId) : null;
}
