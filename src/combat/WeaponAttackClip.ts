import type { InventoryState } from '../inventory/InventoryState';
import { itemDefinition } from '../items/ItemCatalog';
import type { WeaponType } from '../items/ItemDefinition';

/**
 * Which attack animation a swing plays, from the weapon slot (pure, unit-tested): empty -> Unarmed Punch, a weapon ->
 * its own attack clip. Read at every swing (manual attacks and Auto Combat share CombatSystem.playerAttack), so
 * equipping / unequipping counts from the next swing on. Kept apart from PlayerAttacks: the item catalog imports the
 * skills, which import PlayerAttacks.
 */
export type PlayerAttackClip = 'unarmed_punch' | 'dagger_thrust';

/** Each weapon type's attack animation (a new weapon type needs its entry - the type check enforces it). */
export const WEAPON_ATTACK_CLIPS: Readonly<Record<WeaponType, PlayerAttackClip>> = { dagger: 'dagger_thrust' };

/** A player clip is one of the attack animations (a swing is playing). */
export function isAttackClip(clip: string | null): boolean {
  return clip === 'unarmed_punch' || (Object.values(WEAPON_ATTACK_CLIPS) as string[]).includes(clip ?? '');
}

/** Weapon slot empty -> Unarmed Punch; a weapon -> its own attack animation. */
export function attackClipFor(weaponType: WeaponType | null): PlayerAttackClip {
  return weaponType === null ? 'unarmed_punch' : WEAPON_ATTACK_CLIPS[weaponType];
}

/** The weapon type in the weapon slot now, or null when it is empty (or holds an unknown item). */
export function equippedWeaponType(inventory: InventoryState | undefined): WeaponType | null {
  const worn = inventory?.equipment.weapon;
  return (worn && itemDefinition(worn.itemId)?.weaponType) || null;
}
