# EMBR Brand Assets

Internal. How the EMBR logo is built, where it lives, and how to use it.
Positioning, voice and language are in `docs/BRAND-FOUNDATION.md`.

## One source of truth

Every logo file is generated from one definition:

```
scripts/brand/build-brand-assets.cjs   ← the definition (font, tracking, colours, mark geometry)
assets/brand/                          ← the master files
```

Never redraw, retype or trace the logo. Change the definition, rerun the
script, commit the output. The script writes:

| Output                                                     | Used by                            |
| ---------------------------------------------------------- | ---------------------------------- |
| `assets/brand/embr-wordmark.svg`                           | Inline use; takes the text colour  |
| `assets/brand/embr-wordmark-dark.svg`                      | Plum wordmark for light grounds    |
| `assets/brand/embr-wordmark-light.svg`                     | Pearl wordmark for dark grounds    |
| `assets/brand/embr-mark.svg`, `-dark`, `-light`            | Compact mark, same three variants  |
| `assets/brand/embr-favicon.svg`                            | Browser tabs, small avatars        |
| `apps/web/src/app/icon.svg`, `apps/admin/src/app/icon.svg` | App favicons                       |
| `apps/{web,admin,api}/src/lib/brand-wordmark.ts`           | Web and admin headers, BRIEF PDF   |
| `apps/mobile/assets/*.png`                                 | App icon, Android adaptive, splash |
| `docs/content/field-guide/embr-wordmark-*.svg`             | Field Guide PDF                    |
| `landingpage/assets/brand/` (copy of `assets/brand/`)      | Website                            |

The website lives in a separate repository, so copy `assets/brand/` into
`landingpage/assets/brand/` after each rebuild.

## The system

**Primary wordmark.** `EMBR` in Instrument Serif Regular, letter spacing
0.32 em, outlined (no font needed to display it). This is the identity
everywhere the space allows it.

**Compact mark.** A serif E inside a very fine square frame. For the
favicon, app icon, social avatar and small UI placements only. The frame
is deliberately quiet: a house identifier, not an ornament. Small sizes
(favicon, app icon) use a slightly heavier frame so it survives
rendering; that variant is generated, never adjusted by hand.

**Descriptor.** Set separately, never part of the artwork. Typeset in
Inter, uppercase, letter spacing 0.16 em, at about 22% of the wordmark
height, placed below the wordmark at one wordmark height of space. Today:
"Evidence infrastructure for menopause". Because it is live text, it can
change (for example to "Signals", if the naming review lands there)
without touching the logo.

## Clear space and size

- **Clear space:** keep at least the height of the E free on every side of
  the wordmark, and 10% of the mark's width around the compact mark.
- **Minimum size:** wordmark 12 px tall on screen, 4 mm in print. Compact
  mark 16 px. Below that, use the mark, not the wordmark.
- **Headers:** 15 px tall in app and website navigation; 20 px in footers.

## Colour

| Ground          | Logo colour   |
| --------------- | ------------- |
| Pearl, white    | Plum #2A1F39  |
| Plum, graphite  | Pearl #FAF7FB |
| Gradient panels | Pearl #FAF7FB |

Mostly monochrome. The lilac and plum world belongs to the website and the
product, not the logo.

## Do not

- Add a leaf, flower, body, uterus, molecule, heartbeat or any other symbol.
- Put a gradient, shadow, outline or texture inside the logo.
- Use gold or brass as the logo colour.
- Bake a descriptor ("Signals", "Healthcare", a tagline) into the artwork.
- Retype the wordmark in a font, change its spacing, or stretch it.
- Make the E or its frame ornamental, rounded or heavier.
- Create a separate logo for any surface (website, app, PDF, deck, social).

## Regenerating

```
npm i --no-save --prefix /tmp/embr-brand opentype.js@1.3.4
NODE_PATH=/tmp/embr-brand/node_modules node scripts/brand/build-brand-assets.cjs
node docs/content/field-guide/build.cjs   # rebuilds the Field Guide PDF
cp assets/brand/* ../landingpage/assets/brand/
```

Playwright (used for the PNGs) must be available, as it is for the Field
Guide build.
