import { EQUIPMENT_SLOTS, type EquipmentSlotId } from '../inventory/InventorySlots';
import type { DerivedStats } from '../status/DerivedStats';
import { isSkillId, type SkillId } from '../skills/SkillDefinitions';

/**
 * Item data - pure, no Phaser. A definition only says what an item IS. Who has it, wears it and gets its
 * bonuses: InventoryState / InventoryService. Names and descriptions are translated
 * texts under `items.<id>` in src/i18n (labels.itemName / labels.itemDescription).
 */
export const ITEM_CATEGORIES = ['equipment', 'consumable', 'skill_scroll'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const WEAPON_TYPES = ['dagger'] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

/** Attack bonuses of a piece of equipment: plain amounts to ADD while it is worn (never multipliers). */
export interface EquipmentBonuses {
  physicalAtk: number;
  magicAtk: number;
}

/** The item's picture: original art under /public, shown at its own pixel size or whole multiples of it. */
export interface ItemIcon {
  url: string;
  width: number;
  height: number;
}

/** What using a consumable does. */
export interface ItemUseEffect {
  /** HP restored (never above max HP). */
  restoreHp?: number;
  /** Percent of max SP restored (rounded like every percentage restore; never above max SP). */
  restoreSpPercent?: number;
}

export interface ItemDefinition {
  /** Stable id (saves, translations, icon texture). */
  id: string;
  category: ItemCategory;
  /** Equipment only; null for every other item (it can never be worn). */
  equipmentSlot: EquipmentSlotId | null;
  /** Weapons only, otherwise null. */
  weaponType: WeaponType | null;
  requiredLevel: number;
  bonuses: Readonly<EquipmentBonuses>;
  /** Further flat bonuses on derived stats; empty = none. */
  additionalStats: Readonly<Partial<Record<keyof DerivedStats, number>>>;
  /** Ids of special effects; empty = none. */
  specialEffects: readonly string[];
  stackable: boolean;
  icon: Readonly<ItemIcon>;
  /** Consumables only: what one use does. */
  use?: Readonly<ItemUseEffect>;
  /** Skill scrolls only: the skill one use teaches (for good; the scroll is used up). */
  teaches?: SkillId;
}

/** Problems of one definition, empty when it is valid. */
/** A consumable restores HP (whole points) or SP (a percent, 1-100) - at least one, nothing else. */
function validUse(use: Readonly<ItemUseEffect> | undefined): boolean {
  if (!use) return false;
  const hp = use.restoreHp;
  const sp = use.restoreSpPercent;
  if (hp === undefined && sp === undefined) return false;
  if (hp !== undefined && (!Number.isInteger(hp) || hp <= 0)) return false;
  return sp === undefined || (Number.isInteger(sp) && sp > 0 && sp <= 100);
}

export function itemProblems(d: ItemDefinition): string[] {
  const out: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(d.id)) out.push('id: lower-case letters, digits and _ only');
  if (!ITEM_CATEGORIES.includes(d.category)) out.push(`category: ${d.category}`);
  if (d.category === 'equipment' ? d.equipmentSlot === null || !EQUIPMENT_SLOTS.includes(d.equipmentSlot) : d.equipmentSlot !== null) out.push(`equipmentSlot: ${d.equipmentSlot}`);
  if (d.equipmentSlot === 'weapon' ? d.weaponType === null || !WEAPON_TYPES.includes(d.weaponType) : d.weaponType !== null) out.push(`weaponType: ${d.weaponType}`);
  if (d.category === 'consumable' ? !validUse(d.use) : d.use !== undefined) out.push('use');
  if (d.category === 'skill_scroll' ? !isSkillId(d.teaches) : d.teaches !== undefined) out.push(`teaches: ${d.teaches}`);
  if (!Number.isInteger(d.requiredLevel) || d.requiredLevel < 1) out.push(`requiredLevel: ${d.requiredLevel}`);
  for (const [key, value] of Object.entries({ ...d.bonuses, ...d.additionalStats })) if (!Number.isFinite(value)) out.push(`${key}: ${value}`);
  if (d.category === 'equipment' && d.stackable) out.push('equipment does not stack');
  if (!d.icon.url || d.icon.width < 1 || d.icon.height < 1) out.push('icon');
  return out;
}

/** Index by id. Throws on an invalid definition or an id used twice. */
export function createItemCatalog(definitions: readonly ItemDefinition[]): ReadonlyMap<string, ItemDefinition> {
  const out = new Map<string, ItemDefinition>();
  for (const d of definitions) {
    const problems = itemProblems(d);
    if (problems.length) throw new Error(`item ${d.id}: ${problems.join('; ')}`);
    if (out.has(d.id)) throw new Error(`item ${d.id} is defined twice`);
    out.set(d.id, d);
  }
  return out;
}
