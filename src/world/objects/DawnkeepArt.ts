/**
 * Dawnkeep's hand-made sprites (public/assets/environment/dawnkeep, made with PixelLab - isometric, transparent,
 * drawn with a palette taken from the city wall set; source copies in art-source/environment/dawnkeep). Sizes and
 * footprint-centre anchors are measured from the images (image px; the buildings' render `scale` is below). A sprite whose baked-in
 * ground lot was sand or grass had only that lot recoloured to the ash ground's tones.
 *
 * Building scale - judged by the door: the building images are drawn at a reduced render `scale` so the main door is
 * ~1.15x the player's visible height (54 px): door x scale ~ 62 px (nearest-neighbour, the game runs in pixelArt mode;
 * the files are unchanged). Footprints follow the scaled art: burned house 6 x 6, cottage and shell 5 x 5, intact
 * house and keep 4 x 4, church 4 x 6. The burned house (door 60 px = 1.11x) and the church (tower door 50 px = 0.93x)
 * stay at 1x: they are only ever scaled down, never up.
 *
 *   keep, castle_tower, gate_tower   the intact citadel and the town gate (crimson banners)
 *   church                           the church with its bell tower (the landmark of its quarter)
 *   house_intact                     the few houses still standing
 *   ruin_burned, ruin_cottage            the ruined houses (burned on a flat stone slab / roof torn open). Every house
 *                                        stands on the map ground: the cottage's raised yard block (dirt sides, path,
 *                                        grass) was trimmed off its art and the house lowered onto the ground (21 px);
 *                                        the roofless stone shell that stood on a raised base was removed.
 *   market_stall, well, barricade, banner_pole, knight_statue   props
 */
export interface DawnkeepArtEntry {
  file: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  /** Buildings: the main door's height in the image (px) - the scale reference against the 54-px player. */
  door?: number;
  /**
   * Render scale (default 1): the image is drawn this much smaller so its door is ~1.15x the player (door x scale ~
   * 62 px). The file is unchanged; anchorX / anchorY stay in image pixels.
   */
  scale?: number;
  /**
   * Buildings: where the main door is - on the +x or +y face (every door in the art faces the viewer), `at` tiles from
   * the footprint's minimum corner along that face. The street a house fronts runs past that face.
   */
  entrance?: { face: 'x' | 'y'; at: number };
}

export const DAWNKEEP_ART_BASE = 'assets/environment/dawnkeep/';

export const DAWNKEEP_ART = {
  dk_keep: { file: 'keep.png', width: 336, height: 400, anchorX: 168, anchorY: 302, door: 90, scale: 0.69, entrance: { face: 'x', at: 1 } },
  dk_castle_tower: { file: 'castle_tower.png', width: 128, height: 208, anchorX: 63, anchorY: 167 },
  dk_gate_tower: { file: 'gate_tower.png', width: 128, height: 224, anchorX: 63, anchorY: 185 },
  dk_church: { file: 'church.png', width: 344, height: 400, anchorX: 158, anchorY: 316, door: 50, entrance: { face: 'x', at: 0 } },
  dk_house_intact: { file: 'house_intact.png', width: 324, height: 352, anchorX: 161, anchorY: 256, door: 88, scale: 0.7, entrance: { face: 'x', at: 1 } },
  dk_ruin_burned: { file: 'ruin_burned.png', width: 400, height: 332, anchorX: 199, anchorY: 232, door: 60, entrance: { face: 'x', at: 2 } },
  dk_ruin_cottage: { file: 'ruin_cottage.png', width: 400, height: 344, anchorX: 197, anchorY: 245, door: 73, scale: 0.85, entrance: { face: 'y', at: 2 } },
  // canopy raised 24 px over the player's head (posts and drape lengthened by repeating their own pixel rows; the
  // base, table and crates untouched - same ground position)
  dk_market_stall: { file: 'market_stall.png', width: 128, height: 120, anchorX: 63, anchorY: 87 },
  dk_well: { file: 'well.png', width: 64, height: 80, anchorX: 32, anchorY: 58 },
  dk_barricade: { file: 'barricade.png', width: 128, height: 80, anchorX: 64, anchorY: 47 },
  dk_banner: { file: 'banner_pole.png', width: 48, height: 112, anchorX: 24, anchorY: 103 },
  dk_knight_statue: { file: 'knight_statue.png', width: 64, height: 128, anchorX: 31, anchorY: 111 },
} as const satisfies Record<string, DawnkeepArtEntry>;

export type DawnkeepObjectId = keyof typeof DAWNKEEP_ART;
