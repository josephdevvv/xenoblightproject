import { createItemCatalog, type ItemDefinition } from './ItemDefinition';

/** Every item of the game. Definitions only: nothing hands them out, see ItemDefinition. */
const DEFINITIONS: readonly ItemDefinition[] = [
  {
    id: 'weapon_rusty_dagger',
    category: 'equipment',
    equipmentSlot: 'weapon',
    weaponType: 'dagger',
    requiredLevel: 1,
    bonuses: { physicalAtk: 4, magicAtk: 0 },
    additionalStats: {},
    specialEffects: [],
    stackable: false,
    icon: { url: 'assets/items/weapons/straight_sword_icon_16x16.png', width: 16, height: 16 },
  },
];

export const ITEM_CATALOG = createItemCatalog(DEFINITIONS);

export function itemDefinition(id: string): ItemDefinition | undefined {
  return ITEM_CATALOG.get(id);
}

/** Texture key of an item's icon. */
export function itemIconKey(id: string): string {
  return `item.icon.${id}`;
}
