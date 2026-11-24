import { t } from '../i18n';
import { labels } from '../i18n/labels';
import type { ItemInfo } from '../inventory/InventorySlots';
import type { DerivedBonusKey } from '../status/DerivedBonuses';
import { DERIVED_DISPLAY, formatStatValue } from '../status/DerivedStats';
import { itemDefinition, itemIconKey } from './ItemCatalog';

const PERCENT_STATS = new Set<string>([...DERIVED_DISPLAY.filter((d) => d.percent).map((d) => d.key), 'aspdPercent']);

/** What the Inventory window says about an item, in the current language. null = unknown item. */
export function itemInfo(id: string): ItemInfo | null {
  const def = itemDefinition(id);
  if (!def) return null;
  const type = [def.equipmentSlot ? t(`inventory.equipment.${def.equipmentSlot}`) : def.category === 'skill_scroll' ? t('itemInfo.skillScroll') : t('itemInfo.consumable')];
  if (def.weaponType !== null) type.push(t(`itemInfo.weaponTypes.${def.weaponType}`));
  if (def.category === 'equipment') type.push(t('itemInfo.requiredLevel', { level: def.requiredLevel }));
  const effects: string[] = [];
  if (def.use?.restoreHp) effects.push(t('itemInfo.restoreHp', { value: def.use.restoreHp }));
  if (def.use?.restoreSpPercent) effects.push(t('itemInfo.restoreSpPercent', { value: def.use.restoreSpPercent }));
  if (def.teaches) effects.push(t('itemInfo.teaches', { skill: labels.skillName(def.teaches) }));
  if (def.bonuses.physicalAtk !== 0) effects.push(t('itemInfo.physicalAtk', { value: signed(def.bonuses.physicalAtk) }));
  if (def.bonuses.magicAtk !== 0) effects.push(t('itemInfo.magicAtk', { value: signed(def.bonuses.magicAtk) }));
  for (const [key, value] of Object.entries(def.additionalStats) as [DerivedBonusKey, number][]) {
    if (value !== 0) effects.push(`${labels.derived(key)} ${signed(value)}${PERCENT_STATS.has(key) ? '%' : ''}`);
  }
  return { name: labels.itemName(id), type: type.join(' · '), description: labels.itemDescription(id), effects, icon: { texture: itemIconKey(id) } };
}

function signed(value: number): string {
  return `${value < 0 ? '-' : '+'}${formatStatValue(Math.abs(value))}`;
}
