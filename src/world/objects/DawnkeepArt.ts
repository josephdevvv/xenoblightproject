/**
 * Dawnkeep's hand-made sprites (public/assets/environment/dawnkeep, made with PixelLab - isometric, transparent,
 * drawn with a palette taken from the city wall set; source copies in art-source/environment/dawnkeep). Sizes and
 * footprint-centre anchors are measured from the images (world px, 1x - never scaled). A sprite whose baked-in
 * ground lot was sand or grass had only that lot recoloured to the ash ground's tones.
 *
 *   keep, castle_tower, gate_tower   the intact citadel and the town gate (crimson banners)
 *   church                           the church with its bell tower (the landmark of its quarter)
 *   house_intact                     the few houses still standing
 *   ruin_burned, ruin_cottage, ruin_shell   the ruined houses (burned / roof torn open / roofless shell)
 *   market_stall, well, barricade, banner_pole, knight_statue   props
 */
export interface DawnkeepArtEntry {
  file: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export const DAWNKEEP_ART_BASE = 'assets/environment/dawnkeep/';

export const DAWNKEEP_ART = {
  dk_keep: { file: 'keep.png', width: 192, height: 208, anchorX: 96, anchorY: 145 },
  dk_castle_tower: { file: 'castle_tower.png', width: 128, height: 208, anchorX: 63, anchorY: 167 },
  dk_gate_tower: { file: 'gate_tower.png', width: 128, height: 224, anchorX: 63, anchorY: 185 },
  dk_church: { file: 'church.png', width: 192, height: 208, anchorX: 95, anchorY: 148 },
  dk_house_intact: { file: 'house_intact.png', width: 192, height: 160, anchorX: 88, anchorY: 114 },
  dk_ruin_burned: { file: 'ruin_burned.png', width: 192, height: 160, anchorX: 95, anchorY: 105 },
  dk_ruin_cottage: { file: 'ruin_cottage.png', width: 192, height: 160, anchorX: 96, anchorY: 103 },
  dk_ruin_shell: { file: 'ruin_shell.png', width: 192, height: 160, anchorX: 95, anchorY: 104 },
  dk_market_stall: { file: 'market_stall.png', width: 128, height: 96, anchorX: 63, anchorY: 63 },
  dk_well: { file: 'well.png', width: 64, height: 80, anchorX: 32, anchorY: 58 },
  dk_barricade: { file: 'barricade.png', width: 128, height: 80, anchorX: 64, anchorY: 47 },
  dk_banner: { file: 'banner_pole.png', width: 48, height: 112, anchorX: 24, anchorY: 103 },
  dk_knight_statue: { file: 'knight_statue.png', width: 64, height: 128, anchorX: 31, anchorY: 111 },
} as const satisfies Record<string, DawnkeepArtEntry>;

export type DawnkeepObjectId = keyof typeof DAWNKEEP_ART;
