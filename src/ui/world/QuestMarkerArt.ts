import type { QuestMarkerType } from '../../quests/QuestMarkers';

/** Pixel art of the quest markers (no Phaser): one character per pixel, drawn 1:1 like the character sprites. */
export interface QuestMarkerArt {
  pixels: readonly string[];
  /** o = outline, W = lit edge, M = main colour, D = shaded edge, '.' = empty. */
  colors: Readonly<Record<'o' | 'W' | 'M' | 'D', string>>;
}

export const QUEST_MARKER_ART: Readonly<Record<QuestMarkerType, QuestMarkerArt>> = {
  available: {
    colors: { o: '#140d06', W: '#ffeeb0', M: '#f2c037', D: '#a5691a' },
    pixels: [
      '.oooooo.',
      'oWMMMMDo',
      'oWMMMMDo',
      'oWMMMMDo',
      'oWMMMMDo',
      'oWMMMMDo',
      '.oWMMDo.',
      '.oWMMDo.',
      '.oWMMDo.',
      '.oWMMDo.',
      '..oMDo..',
      '..oooo..',
      '.oooooo.',
      '.oWMMDo.',
      '.oMMMDo.',
      '.oMDDDo.',
      '.oooooo.',
    ],
  },
  inProgress: {
    colors: { o: '#0e0e12', W: '#dcdce4', M: '#a2a2ac', D: '#62626c' },
    pixels: [
      '........oo......',
      '........oWo.....',
      '........oWMo....',
      'ooooooooWMMMo...',
      'oWWWWWWWMMMMMo..',
      'oMMMMMMMMMMMMMo.',
      'oMMMMMMMMMMMMMMo',
      'oMMMMMMMMMMMMDo.',
      'oDDDDDDDMMMMDo..',
      'ooooooooMMMDo...',
      '........oMDo....',
      '........oDo.....',
      '........oo......',
    ],
  },
  completed: {
    colors: { o: '#07120a', W: '#c8f7b0', M: '#5cc84a', D: '#2a7a34' },
    pixels: [
      '..............o.',
      '.............oWo',
      '............oWMo',
      '...........oWMMo',
      '..........oWMMDo',
      '.o.......oWMMDo.',
      'oWo.....oWMMDo..',
      'oMWo...oWMMDo...',
      'oMMWo.oWMMDo....',
      'oDMMWoWMMDo.....',
      '.oDMMWMMDo......',
      '..oDMMMDo.......',
      '...oDMDo........',
      '....oDo.........',
      '.....o..........',
    ],
  },
};

/** Clear space between the NPC's head and the marker at its lowest point (px). */
export const QUEST_MARKER_GAP = 4;
/** Slow floating: whole pixels up and down, so the art stays crisp. */
export const QUEST_MARKER_FLOAT = { periodMs: 1800, height: 3 } as const;

/** How far (whole px) the marker floats above its lowest point. */
export function questMarkerFloat(elapsedMs: number): number {
  return Math.round(((1 - Math.cos((elapsedMs / QUEST_MARKER_FLOAT.periodMs) * Math.PI * 2)) / 2) * QUEST_MARKER_FLOAT.height);
}
