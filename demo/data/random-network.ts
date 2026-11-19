/**
 * A random network with no positions, for seeing how well the library places
 * stations by itself. The grid city gives every station a position, so it
 * only shows speed. This one leaves the whole layout to the library.
 */
import type { TubeMapData } from '../../src/index.ts'

/** The shortest and longest line, in stations. Roughly what metro lines have. */
const LINE_LENGTH = { shortest: 6, longest: 24 }

/** How often a line calls at a station another line already has, which makes an interchange. */
const INTERCHANGE_CHANCE = 0.12

/**
 * The same seed gives the same network, so a layout problem can be looked at
 * again. This is the mulberry32 generator, which is small and spreads well.
 */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function randomNetwork(stationCount: number, seed = 1): TubeMapData {
  const random = seededRandom(seed)
  const pick = <Item>(items: Item[]) => items[Math.floor(random() * items.length)]!
  const stations = Array.from({ length: stationCount }, (_, index) => ({ id: `s${index}`, name: `Station ${index}` }))

  const lines: TubeMapData['lines'] = []
  // Stations that already have a line. A new line starts at one of them, so the network stays in one piece.
  const served: string[] = []
  let nextUnserved = 0
  while (nextUnserved < stationCount) {
    const length = LINE_LENGTH.shortest + Math.floor(random() * (LINE_LENGTH.longest - LINE_LENGTH.shortest + 1))
    const stops = served.length > 0 ? [pick(served)] : []
    while (stops.length < length && nextUnserved < stationCount) {
      const shared = served.length > 0 && random() < INTERCHANGE_CHANCE ? pick(served) : undefined
      if (shared !== undefined && !stops.includes(shared)) {
        stops.push(shared)
      } else {
        stops.push(`s${nextUnserved++}`)
      }
    }
    served.push(...stops.filter((stop) => !served.includes(stop)))
    if (stops.length > 1) lines.push({ id: `l${lines.length}`, name: `Line ${lines.length + 1}`, stations: stops })
  }
  return { name: `Random network, ${stationCount.toLocaleString('en')} stations`, stations, lines }
}
