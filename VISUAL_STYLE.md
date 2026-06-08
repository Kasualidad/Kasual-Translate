# Kasual Translate V3 Visual Style

## Direction

Kasual Translate should feel like a rugged translation tablet from a Project Zomboid workshop: practical, worn, tactile, and slightly technical. Effects must support work clarity first.

## Themes

- Light theme: warm orange, workshop surface, worn plastic/metal, readable beige screen.
- Dark theme: cold blue, night terminal, lower background saturation, bright but controlled accents.
- Avoid pure neon, flat web cards, oversized marketing hero layouts, and single-color monotony.

## Materials

- Outer shell: scratched polymer/painted metal, subtle screws, rubber side rails.
- Screen: glass overlay, soft diagonal reflection, faint scratches, low scanlines.
- Panels: inset surfaces with top light, bottom shadow, and restrained glow.
- Buttons: tactile key/metal feel, small press movement, consistent icon size.

## Animation Rules

- Keep motion short: 160-360ms for UI transitions.
- Ambient motion can be slow: 4-10s loops.
- New keys use green pulse.
- Duplicates/errors use red alert pulse.
- Save uses a write sweep or check pulse.
- AI uses blue pulse/glow.
- Avoid continuous heavy movement in text-heavy areas.

## Interface Density

- Translator and Project Manager should share scale and rhythm.
- Document views get the most space.
- Metadata belongs in compact HUD/status surfaces.
- Do not add redundant bars if the same data already exists elsewhere.

## Internationalization

All visible UI text must use i18n keys in every locale. Only product names, file formats, provider names, and technical identifiers may remain literal.

## Asset Guidance

Future bitmap assets should be project-bound under `src/assets/` and referenced from CSS or components. Do not leave project assets only in generated-image folders.
