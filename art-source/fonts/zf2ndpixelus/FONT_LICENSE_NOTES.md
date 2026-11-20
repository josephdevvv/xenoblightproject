# ZF #2ndPixelus - source and licence notes

Files here are exactly as supplied in `ZF2ndPixelus.zip` (not modified):

- `ZF#2ndPixelus.ttf` - TrueType, version 1.02 (30/06/2005), 2048 units/em
- `Readme.txt` - the author's notes, encoded in TIS-620 / Windows-874 (Thai)

The game serves a byte-identical copy as `public/assets/fonts/zf2ndpixelus/ZF2ndPixelus.ttf`:
the `#` in the original file name is not served by the Vite dev server (it is a URL fragment
character), so only the served copy was renamed.

## What the font says about itself

From the font's `name` table:

| Field | Value |
| --- | --- |
| Copyright | Copyright (c) Chayanon Ruamcharoen, 2005. All rights reserved. |
| Trademark | ZF #2ndPixelus is a trademark of Chayanon Ruamcharoen. |
| Designer / Manufacturer | Chayanon Ruamcharoen |
| Vendor URL | http://www.f0nt.com/ |
| License description | "For educations used only." |
| License URL | http://not.available.com/ (none given) |
| OS/2 fsType | 8 (editable embedding allowed) |

From `Readme.txt` (by Zafire06), translated from Thai:

- Use the font at 14 pt with no anti-aliasing ("None").
- The Latin letters are capitals only.
- When used as Alias Text in Flash MX 2004, vowels disappear.
- **If you redistribute this font, please link to the download page.**

## Status for Xenoblight

The licence is unclear for a published game: the name table says "For educations used only", and
the readme only asks for a link to the download page when redistributing. Serving the font from a
public website (GitHub Pages) counts as redistribution.

Before publishing a build that contains this font:

1. Confirm the terms with the author / f0nt.com (or obtain permission), and
2. add the required download-page link to the game credits.

If permission cannot be obtained, delete the served copy: the game falls back to Thai-capable
system fonts automatically (`src/ui/text/PixelFont.ts`).
