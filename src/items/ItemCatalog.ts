import { createItemCatalog, type ItemDefinition } from './ItemDefinition';

/** Every item of the game. Definitions only: who gets them is decided elsewhere (quest rewards, StartingEquipment). */
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
    icon: { url: 'assets/items/weapons/rusty_dagger_icon_32x32.png', width: 32, height: 32 },
  },
  {
    // starter armor, worn by every new character (StartingEquipment); DEF +1 through the derived stats
    id: 'armor_worn_cloth',
    category: 'equipment',
    equipmentSlot: 'armor',
    weaponType: null,
    requiredLevel: 1,
    bonuses: { physicalAtk: 0, magicAtk: 0 },
    additionalStats: { def: 1 },
    specialEffects: [],
    stackable: false,
    icon: { url: 'assets/items/armor/old_cloth_armor_icon_32x32.png', width: 32, height: 32 },
  },
  {
    // first consumable: Tutorial Quest 03 gives 20; used from the Inventory or the hotbar
    id: 'consumable_red_healing_potion',
    category: 'consumable',
    equipmentSlot: null,
    weaponType: null,
    requiredLevel: 1,
    bonuses: { physicalAtk: 0, magicAtk: 0 },
    additionalStats: {},
    specialEffects: [],
    stackable: true,
    icon: { url: 'assets/items/consumables/small_red_healing_potion_16x16.png', width: 16, height: 16 },
    use: { restoreHp: 50 },
  },
  {
    // second consumable: 30 % of max SP; goes on the W potion slot (not given anywhere yet)
    id: 'consumable_sp_recovery_potion',
    category: 'consumable',
    equipmentSlot: null,
    weaponType: null,
    requiredLevel: 1,
    bonuses: { physicalAtk: 0, magicAtk: 0 },
    additionalStats: {},
    specialEffects: [],
    stackable: true,
    icon: { url: 'assets/items/consumables/sp_recovery_potion_32x32.png', width: 32, height: 32 },
    use: { restoreSpPercent: 30 },
  },
  {
    // skill scroll: used from the Inventory (USE), teaches drifter_lv1 for good
    id: 'scroll_power_thrust',
    category: 'skill_scroll',
    equipmentSlot: null,
    weaponType: null,
    requiredLevel: 1,
    bonuses: { physicalAtk: 0, magicAtk: 0 },
    additionalStats: {},
    specialEffects: [],
    stackable: true,
    icon: { url: 'assets/items/scrolls/scroll_power_thrust_32x32.png', width: 32, height: 32 },
    teaches: 'drifter_lv1',
  },
  {
    // skill scroll: used from the Inventory (USE), teaches drifter_heal for good
    id: 'scroll_heal',
    category: 'skill_scroll',
    equipmentSlot: null,
    weaponType: null,
    requiredLevel: 1,
    bonuses: { physicalAtk: 0, magicAtk: 0 },
    additionalStats: {},
    specialEffects: [],
    stackable: true,
    icon: { url: 'assets/items/scrolls/scroll_heal_32x32.png', width: 32, height: 32 },
    teaches: 'drifter_heal',
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
