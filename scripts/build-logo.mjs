/**
 * Turns the supplied logo art into app assets, one set per theme.
 *
 * The mark is mostly deep navy, which reads on a light ground and vanishes on
 * a dark one, so a single asset cannot serve both. `lightmode.png` and
 * `darkmode.png` are used when present; otherwise one source is shared.
 *
 * A source that already carries alpha is used as-is. Only an opaque source is
 * keyed, and that keying works on luminance with a soft edge rather than an
 * exact white match: JPEG compression leaves "white" ranging roughly 246-255
 * and speckles the boundary, so a hard threshold leaves a grey fringe.
 * Saturated pixels are skipped so the gold survives.
 */
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

// fileURLToPath, not .pathname: the project path contains a space, which stays
// percent-encoded in a URL pathname and fails to resolve on disk.
const resolve = name => fileURLToPath(new URL(`../${name}`, import.meta.url))
const OUT = fileURLToPath(new URL('../public/', import.meta.url))

/**
 * Outputs are named for the background they belong ON, not for the colour of
 * the artwork. "mark-on-light" is the mark you place on a light page, so it
 * contains the dark artwork. Naming these "light" and "dark" was ambiguous
 * enough to cost real time, because either reading is plausible.
 *
 * Source files follow the opposite convention: `darkmode.png` holds the dark
 * artwork. So the dark-artwork source feeds the on-light output.
 */
const VARIANTS = [
  { name: 'mark-on-light', candidates: ['darkmode.png', 'new_logo.png', 'new_logo.jpg', 'nimiq.png'] },
  { name: 'mark-on-dark', candidates: ['lightmode.png'] },
]

const BG_MIN = 243
const LOGO_EDGE = 228

async function keyOutBackground(source) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // A bright gold pixel has high luminance but high saturation; only
    // near-greys are background.
    if (Math.max(r, g, b) - Math.min(r, g, b) > 18) continue

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (luma >= BG_MIN) {
      data[i + 3] = 0
    }
    else if (luma > LOGO_EDGE) {
      const alpha = Math.round(255 * (BG_MIN - luma) / (BG_MIN - LOGO_EDGE))
      // Anything this sheer is vignette rather than artwork; leaving it in
      // defeats the trim and floats the mark inside its box.
      data[i + 3] = alpha < 24 ? 0 : alpha
    }
  }

  return sharp(Buffer.from(data), { raw: { width, height, channels } }).png().toBuffer()
}

let built = 0

for (const variant of VARIANTS) {
  const source = variant.candidates.map(resolve).find(existsSync)
  if (!source) {
    console.log(`skipping "${variant.name}": no source found`)
    continue
  }

  const label = variant.name
  console.log(`\n[${label}] source: ${source.split(/[\\/]/).pop()}`)

  const meta = await sharp(source).metadata()
  const prepared = meta.hasAlpha
    ? await sharp(source).png().toBuffer()
    : await keyOutBackground(source)
  console.log(meta.hasAlpha ? '  already transparent, keying skipped' : '  background keyed out')

  const trimmed = await sharp(prepared)
    .trim({ threshold: 10 })
    .extend({
      // A little breathing room, so the mark is not flush to its bounds.
      top: 10, bottom: 10, left: 10, right: 10,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer()

  const trimmedMeta = await sharp(trimmed).metadata()
  console.log(`  trimmed to ${trimmedMeta.width}x${trimmedMeta.height}`)

  const targets = [512, 192, 96, 48].map(size => [`${variant.name}-${size}.png`, size])
  // One favicon only, from the on-light mark: browser tab chrome is light far
  // more often than not, and there is no media query for a PNG favicon.
  if (variant.name === 'mark-on-light') targets.push(['favicon.png', 32])

  for (const [name, size] of targets) {
    await sharp(trimmed)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(OUT + name)
    console.log(`  wrote ${name}`)
  }
  built++
}

if (!built) {
  console.error('\nNo logo sources found at all. Expected lightmode.png / darkmode.png in the project root.')
  process.exit(1)
}
