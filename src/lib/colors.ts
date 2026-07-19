/**
 * Categorical fill colours for the trial map (colour-by treatment / rep / block).
 * The first eight hues are the dataviz categorical order (chosen to maximize adjacent
 * colour-blind separation); beyond eight, hues are golden-angle spaced. Cells always
 * show a text label too, so colour is a secondary encoding, not the sole identifier.
 * Returned as light tints so the dark cell text stays legible.
 */
const BASE_HUES = [212, 158, 40, 120, 249, 1, 338, 16]

export function categoryColor(index: number): string {
  const hue = index < BASE_HUES.length ? BASE_HUES[index] : Math.round((index * 137.508) % 360)
  return `hsl(${hue} 62% 86%)`
}

/**
 * Saturated stroke colour sharing `categoryColor`'s hue — for lines and marks where the light map
 * tint would be invisible. Keeps a treatment's identity consistent between the map and the report chart.
 */
export function categoryStroke(index: number): string {
  const hue = index < BASE_HUES.length ? BASE_HUES[index] : Math.round((index * 137.508) % 360)
  return `hsl(${hue} 60% 42%)`
}
