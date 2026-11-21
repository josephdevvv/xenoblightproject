# Xenoblight Passive Tree โ€” Minimal Layer Pack

This pack follows Passive Tree concept 5. All PNG files under `layers` are transparent 1780x883 overlays with the same top-left origin; draw them in the sequence in `node_positions.json`.

No passive-node icon is baked into the tree. That is intentional: create class-specific icons later and place them at the centers in `node_positions.json`. The iconless node frames work for any class.

Recommended runtime order:
1. render the dim game background;
2. render window and panel layers;
3. render class node icons inside their frames;
4. draw connector state, unlock state, text, costs and detail values from data;
5. overlay `05_selected_state.png` for the selected node;
6. draw mouse-hover and focus effects in code.

Components contains reusable iconless frames for regular, major and core nodes, plus connector segments and the unlock-button surface.
