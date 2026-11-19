# Xenoblight dungeon HUD layer pack

All files in `layers` are transparent PNGs on the same 1664x940 canvas. Draw them in the order in `hud_layout.json`.

## Bars

Yes: HP, MP and EXP should be code-driven individual bars, not baked color. Draw the colored fill rectangle first, crop it to `current / maximum`, then render the matching frame PNG above it. This keeps bar value changes, damage flashes and tween animations simple.

- HP fill: `#D74A51`
- MP fill: `#5699E2`
- EXP fill: `#AB71D5`

The three standalone frame PNGs in `components` are reusable for widgets that need to be resized or rebuilt independently. All labels, values, quest titles, minimap content, chat text and hotbar icons should be rendered by the game above the chrome.
