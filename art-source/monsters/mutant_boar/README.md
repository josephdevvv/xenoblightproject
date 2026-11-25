# Mutant Boar | Xenoblight

Each direction has Idle (1 frame), Walk (6), Stomp (8), Hit (4), and Death (6).
Each action folder contains the individual 64×64 RGBA frames, a horizontal sheet,
and animation metadata. Animated actions also have a 4× WebP preview.
Idle and Walk loop. Play Stomp, Hit, and Death once. Retain the last Death pose.

The shared Idle sheet is ordered SW, SE, NW, NE from left to right.
The four-frame ground-spike VFX is reusable for any direction. Position the VFX's
(32, 38) origin at the point of impact and trigger it at Stomp frame 6 (1-based).

Frame positions are preserved from the source PNGs. Use ground_y in each
animation.json to align actions: Idle, Walk and other actions may have different
ground coordinates inside their 64×64 cells.
