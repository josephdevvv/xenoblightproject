import type { CharacterData } from '../data/CharacterData';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { resetOptionalNodes, upgradeNode, type PassiveProgress, type PassiveUpgradeError } from './PassiveProgress';
import { PassiveSaveStore } from './PassiveSaveStore';

/**
 * The single place that changes a character's passive tree: every upgrade is re-validated by the pure
 * rules (points, prerequisite, rank cap), saved immediately, and announced through
 * CharacterStatusService.onChange so the Status window, HUD and combat pick up the new derived stats.
 * (Loading and level rewards happen with the status, in CharacterStatusService.)
 */
export const PassiveTreeService = {
  progress(character: CharacterData): PassiveProgress | null {
    return character.passives ?? null;
  },

  /** Spends one point on `nodeId`. Returns the reason when it is not allowed. */
  upgrade(character: CharacterData, nodeId: string): PassiveUpgradeError | null {
    if (!character.passives) return 'unknownNode';
    const result = upgradeNode(character.passives, nodeId);
    if (!result.ok) return result.error;
    commit(character, result.progress);
    return null;
  },

  /** Free reset of the optional nodes (the center stays). Returns the refunded points. */
  resetOptional(character: CharacterData): number {
    if (!character.passives) return 0;
    const { progress, refunded } = resetOptionalNodes(character.passives);
    if (refunded > 0) commit(character, progress);
    return refunded;
  },
};

function commit(character: CharacterData, progress: PassiveProgress): void {
  character.passives = progress;
  PassiveSaveStore.save(character.name, progress);
  CharacterStatusService.refresh(character);
}
