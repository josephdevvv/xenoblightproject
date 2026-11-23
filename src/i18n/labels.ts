import { translate } from './index';

/**
 * Display names for game data identified by stable IDs (appearance options, directions, maps,
 * stats). Keys are built from the IDs, so data stays language-free and every locale must list
 * each ID (checked by the i18n tests).
 */
export const labels = {
  gender: (id: string) => translate(`appearance.gender.${id}`),
  hairstyle: (id: string) => translate(`appearance.hairstyle.${id}`),
  hairColor: (id: string) => translate(`appearance.hairColor.${id}`),
  outfit: (id: string) => translate(`appearance.outfit.${id}`),
  direction: (direction: string) => translate(`direction.${direction}`),
  map: (mapId: string) => translate(`maps.${mapId}`),
  statLabel: (stat: string) => translate(`status.stats.${stat}.label`),
  statDescription: (stat: string) => translate(`status.stats.${stat}.description`),
  derived: (key: string) => translate(`status.derived.${key}`),
  itemName: (id: string) => translate(`items.${id}.name`),
  itemDescription: (id: string) => translate(`items.${id}.description`),
  questName: (id: string) => translate(`quests.${id}.name`),
  questObjective: (id: string, key = 'objective', params?: Record<string, number>) => translate(`quests.${id}.${key}`, params),
  passiveNode: (id: string) => translate(`passive.nodes.${id}`),
  passiveClass: (treeId: string) => translate(`passive.classNames.${treeId}`),
};
