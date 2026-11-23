import type { CharacterData } from '../../data/CharacterData';
import { availablePoints } from '../../passives/PassiveProgress';

/**
 * Which HUD menu buttons show the "points to spend" pip - pure, unit-tested. One rule for every button:
 * the pip is on while that window has unspent points (Status: stat points, Passive Tree: passive points).
 */
export interface UnspentPoints {
  status: boolean;
  passive: boolean;
}

export function unspentPoints(character: CharacterData): UnspentPoints {
  return {
    status: (character.status?.statPoints ?? 0) > 0,
    passive: character.passives ? availablePoints(character.passives) > 0 : false,
  };
}
