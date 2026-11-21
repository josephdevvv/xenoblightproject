# Combat animations — Male Mohawk (Spike) Blonde Drifter

Exported from Xenoblight Sprite Forge (approved registry) on 2026-11-22 (impact VFX added the same day). **Assets only, no gameplay code yet.**
Do not edit the PNGs; re-export from the forge (`scripts/export_game_combat.mjs`).

## Files

`public/assets/characters/male/spike_blonde/drifter/combat/`

| Animation key | File | Sheet | Frames | Timing | Loop |
|---|---|---|---|---|---|
| `combat_idle` | `combat_idle.png` | 384×256 | 6 | 150 ms/frame (6.667 fps) | yes (`repeat: -1`) |
| `dagger_thrust` | `dagger_thrust.png` | 512×256 | 8 | 100 ms/frame (10 fps) | no (`repeat: 0`) |
| `self_heal_cast` | `self_heal_cast.png` | 512×256 | 8 | 100 ms/frame (10 fps) | no |
| `hit_reaction` | `hit_reaction.png` | 384×256 | 6 | 100 ms/frame (10 fps) | no |

Metadata: `male_spike_blonde_drifter_combat.json` (frame size, frames, `frameMs`/`frameRate`, `repeat`, events,
per-facing anchors, per-frame root/head anchors, forge provenance). The sprite id of this appearance is
`char_male_mohawk_blonde_drifter` (same as its static/walk entry in `src/assets/SpriteForgeCharacters.ts`).

## Sheet layout

- 64×64 frames, transparent, DB32 palette, binary alpha, pixel art (nearest-neighbour only).
- **Rows = facings in the order `SE`, `SW`, `NE`, `NW`** (same as the monster sheets / `MONSTER_FACINGS`).
- Columns = frames left to right. Frame index for Phaser: `row * frames + column`.
- Facings: SE and NE are original art; SW = exact mirror of SE, NW = exact mirror of NE (the dagger switches hands in
  SW/NW; accepted by design).
- Anchor: feet/root at **(31, 57)** in SE frame 1 (`anchors[facing]` in the JSON; SW/NW are mirrored: x' = 64 − x).
  Same root as the static/walk sprites, so the character does not jump when switching animations.

## Combat events (1-based frames)

| Animation | Event |
|---|---|
| `dagger_thrust` | `impactFrame: 5`, `hitCount: 1` — apply damage on frame 5 **if the attack connects**; `attackVFX: "thrust"`, `onHitVFX: "impact"` |
| `self_heal_cast` | `castFrame: 5`, `target: "self"`, `healAmount: "30% MaxHP"` (ratio 0.3), `cooldownMs: 30000` |
| `hit_reaction` | `reactionFrame: 2` (the flinch), `returnsTo: "combat_idle"` |
| `combat_idle` | loop while in combat and not acting |

`self_heal_cast` and `hit_reaction` also carry `previewFrameDurationsMs` (forge review timing only — the approved
playback timing is `frameMs`).

## State transitions (suggested)

```
combat_idle (loop)
  ├─ attack input ─────────► dagger_thrust ─(last frame)─► combat_idle      damage on frame 5 if hit
  ├─ heal input (cd 30 s) ─► self_heal_cast ─(last frame)► combat_idle      heal on frame 5
  └─ took damage ──────────► hit_reaction ─(last frame)──► combat_idle
```

Frame 1 and the last frame of `dagger_thrust`, `self_heal_cast` and `hit_reaction` are pixel-identical to
`combat_idle` frame 1 (the combat stance), so transitions do not pop.

## Attacks for this character

| Attack | Animation | Impact frame | Damage | On-hit VFX |
|---|---|---|---|---|
| Basic Attack | `dagger_thrust` | 5 (1-based) | normal attack | `impact` at scale **1.0** |
| Enhanced Lv.1 Attack Skill | `dagger_thrust` (same animation, reused) | 5 (1-based) | **200% ATK** | `impact` at scale **1.5** |

Play the on-hit VFX only when the server confirms the hit, synchronised to the attack animation's impact frame.

## VFX

Player VFX are separate, shared, grayscale assets (never baked into these sprites; usable on their own):

- **`impact` (on hit) — exported:** `public/assets/vfx/player/combat/impact.png` + `impact.json`
  - 256×64 spritesheet, 4 frames of 64×64 in one row (`frameWidth: 64`, `frameHeight: 64`), no direction, `loop: false`
  - timing from the approved asset: **60 / 60 / 70 / 80 ms** per frame (total 270 ms; `frameMs` base 60) — use the
    per-frame durations (`frames[i].duration` in Phaser)
  - anchor = frame centre (32, 32) → `setOrigin(0.5, 0.5)` at the target hit position
  - nearest-neighbour scaling only; scale 1.0 basic attack, 1.5 enhanced attack skill
  - grayscale palette (#ffffff, #cac9c8, #bebdbd, #f2f0f4), binary alpha
- **`thrust` (attack trail): PENDING** — not created yet; no placeholder art exists. The impact VFX works without it.
- Existing monster VFX (`public/assets/monsters/*/vfx_attack.png`) are monster-specific — do not reuse for the player.

## Provenance

All 16 directional animations (4 × SE/SW/NE/NW) are approved assets in the forge manifest
(`male_spike_blonde_drifter_<dir>_<animation>`), composed as: approved bald base animation → Drifter outfit base
(PixelLab transfer_outfit, registered separately) → Spike Blonde hair layer (per-frame head tracking, occlusion).
Changing the hairstyle later re-composes from the same bases; these files would then be re-exported.
