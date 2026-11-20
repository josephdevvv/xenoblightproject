# PixelLab sources (Zone 5 city wall, gate, bell tower)

Generated on 2026-11-20 with the user's approval for the "Zone 5 city wall gate" task. Everything the game
ships is rebuilt from these files by `node tools/compose-city-wall.mjs` into
`public/assets/environment/city_wall/` (+ `src/world/objects/handmadeArt.generated.json`).

| What | PixelLab call | Cost | Used for |
| --- | --- | --- | --- |
| `city_wall_kit/tile_*.png` | `create_building_kit` (isometric, tile_size 32 = the game's logical tile, 3-storey walls, grid layout, palette locked to the Xenoblight ash palette), id `ebda5e3a-5924-4c71-86b8-c84a58eeed32` | 10 generations | All stone of the city wall segments, towers, gatehouse and the bell tower (S / E wall faces and the flat top, stacked and assembled by the compose tool) |
| `city_gate/gate_inpaint.png` | `create_map_object`, style-matched inpainting into the composed gatehouse (`gate_ctx.png` + `gate_mask.png` are the exact context and mask sent), id `776c3db6-24f1-486d-8b90-6199ba70dd00` | 1 generation | The closed wooden double gate (oak planks, iron bands, ring handles); muted 25 % towards charred oak when composited |
| `city_gate/arch_inpaint.png` | same, ring mask around the doors (`arch_ctx.png`, `arch_mask.png`), id `609b0aa4-7036-43e2-b0e6-a7de2eef05ef` | 1 generation | **Rejected** - only a faint outline. The voussoir arch is drawn by the compose tool instead |
| `bell_tower/belfry_inpaint.png` | same, belfry openings mask (`belfry_ctx.png`, `belfry_mask.png`), id `69cf56b9-7c1b-450a-9a1e-60750e1dea6a` | 1 generation | **Rejected** - filled the openings with more wall. Openings and bell are drawn by the compose tool, using `belfry_mask.png` |
| (not kept) | `create_map_object` basic mode, gatehouse, id `2e6dfe9f-73ab-4637-a531-67c0ee1b85b9` | 1 generation | **Rejected** - drawn front-on, not on the map's 2:1 isometric wall line, and too clean |

Total: 14 generations.

`composed/` holds the intermediate sprites before the detail passes (`city_gate_base.png`,
`bell_tower_base.png`) and `anchors.json`; they are not shipped.

Notes for re-generation:

- The kit's floor diamond has its top corner at (26, 53) of every 52 x 74 piece; one wall piece is 48 px
  (3 storeys) tall. Tile 3 = S face (front edge, faces the camera), tile 2 = E face, tile 44 = flat top.
- Style-matched `create_map_object` follows the context closely: it is good for one new material in a
  well-defined area (the gate), poor at cutting openings into an existing material (arch, belfry).
