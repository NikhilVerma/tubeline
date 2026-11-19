import type { Network, Point } from '../model/network.ts'
import { routeBetween } from './geometry.ts'

/** The eight directions track may run in, as grid steps, clockwise from east. */
const COMPASS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
]

/** Grid units between neighbouring stations. A design choice: two leaves room for names between stations. */
const STEP = 2

/** How many rings of cells round a target are searched for a clash-free cell before settling for the least bad one. */
const SEARCH_RINGS = 3

/** A clash outweighs any amount of turning or distance, so a cell with fewer clashes always wins. */
const CLASH_COST = 1000

/**
 * A graph written without positions still has to be drawn somewhere.
 * `autoPosition` gives every station a grid position, aiming for the long
 * straight runs a tube map has.
 *
 * It lays the longest line out in a straight row, then grows every other line
 * out of the stations already placed, one station at a time. Each station
 * takes the cell that keeps its line straightest without running track
 * through another station.
 *
 * It is a quick heuristic. Lines may still cross, and a map that needs an
 * exact look should give positions.
 */
export function autoPosition(network: Network): Map<string, Point> {
  const neighbours = new Map<string, Set<string>>()
  for (const line of network.lines.values()) {
    for (const run of line.runs) {
      for (let i = 1; i < run.length; i++) {
        neighbours.set(run[i - 1]!, (neighbours.get(run[i - 1]!) ?? new Set()).add(run[i]!))
        neighbours.set(run[i]!, (neighbours.get(run[i]!) ?? new Set()).add(run[i - 1]!))
      }
    }
  }

  const placed = new Map<string, Point>()
  const taken = new Set<string>()
  // How many stretches of track between placed neighbours run through each cell. Kept as stations are placed, so a clash is looked up rather than searched for.
  const trackThrough = new Map<string, number>()
  // The sum of every placed position. The middle of the map is worked out from it.
  const placedSum = { x: 0, y: 0 }
  const keyOf = (cell: Point) => `${cell.x},${cell.y}`
  const isFree = (cell: Point) => !taken.has(keyOf(cell))
  const place = (id: string, cell: Point) => {
    for (const neighbourId of neighbours.get(id) ?? []) {
      const neighbour = placed.get(neighbourId)
      if (neighbour === undefined) continue
      for (const between of cellsBetween(routeBetween(cell, neighbour))) {
        trackThrough.set(keyOf(between), (trackThrough.get(keyOf(between)) ?? 0) + 1)
      }
    }
    placed.set(id, cell)
    taken.add(keyOf(cell))
    placedSum.x += cell.x
    placedSum.y += cell.y
  }

  /**
   * `clashesAt` counts what would go wrong with station `id` at `cell`.
   *
   * A clash is track to a placed neighbour that runs through some other
   * station. Existing track that runs through the cell is a clash too.
   */
  const clashesAt = (id: string, cell: Point): number => {
    let clashes = trackThrough.get(keyOf(cell)) ?? 0
    for (const neighbourId of neighbours.get(id) ?? []) {
      const neighbour = placed.get(neighbourId)
      if (neighbour === undefined) continue
      for (const between of cellsBetween(routeBetween(cell, neighbour))) {
        if (!isFree(between)) clashes++
      }
    }
    return clashes
  }

  /** `placeNear` puts `id` on the free cell with the fewest clashes, choosing the one closest to `target`. */
  const placeNear = (id: string, target: Point) => {
    let best: { cell: Point; cost: number } | undefined
    for (let ring = 0; best === undefined || (ring <= SEARCH_RINGS && best.cost >= CLASH_COST); ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
          const cell = { x: target.x + dx * STEP, y: target.y + dy * STEP }
          if (!isFree(cell)) continue
          const cost = clashesAt(id, cell) * CLASH_COST + ring
          if (best === undefined || cost < best.cost) best = { cell, cost }
        }
      }
    }
    place(id, best!.cell)
  }

  /**
   * `walkFrom` places `ids` one after another, leading away from the placed
   * station `anchorId`.
   *
   * `heading` is the compass index the line arrived on, when it has one. The
   * walk uses it to carry straight on.
   */
  const walkFrom = (anchorId: string, ids: string[], heading: number | undefined) => {
    let previousId = anchorId
    for (const id of ids) {
      if (placed.has(id)) {
        // The line is back at a station it already has, so the next station leads on from there.
        previousId = id
        heading = undefined
        continue
      }
      const previous = placed.get(previousId)!
      const centre = { x: placedSum.x / placed.size, y: placedSum.y / placed.size }
      // Directions that already carry track out of the previous station.
      const used = [...(neighbours.get(previousId) ?? [])]
        .map((neighbourId) => placed.get(neighbourId))
        .filter((point) => point !== undefined)
        .map((point) => compassIndex(previous, point))

      let best: { index: number; cell: Point; cost: number } | undefined
      for (const [index, step] of COMPASS.entries()) {
        const cell = { x: previous.x + step.x * STEP, y: previous.y + step.y * STEP }
        if (!isFree(cell)) continue
        // Carrying straight on is best. A line with no heading leaves at the
        // widest angle from the track already here.
        const turn =
          heading === undefined
            ? 4 - Math.min(4, ...used.map((usedIndex) => turnsBetween(index, usedIndex)))
            : turnsBetween(index, heading) + (used.includes(index) ? 4 : 0)
        // When two directions tie, the walk heads away from the middle of the map.
        const outward = step.x * Math.sign(previous.x - centre.x) + step.y * Math.sign(previous.y - centre.y)
        const cost = clashesAt(id, cell) * CLASH_COST + turn * 10 - outward
        if (best === undefined || cost < best.cost) best = { index, cell, cost }
      }

      if (best !== undefined && best.cost < CLASH_COST) {
        place(id, best.cell)
        heading = best.index
      } else {
        // Every cell next door is taken or clashes, so look further out and start a fresh heading.
        placeNear(id, previous)
        heading = undefined
      }
      previousId = id
    }
  }

  /** The compass index a line arrives at `anchorId` on, when the station before it on the line is placed. */
  const headingInto = (anchorId: string, cameFromId: string | undefined): number | undefined => {
    const cameFrom = cameFromId === undefined ? undefined : placed.get(cameFromId)
    return cameFrom === undefined ? undefined : compassIndex(cameFrom, placed.get(anchorId)!)
  }

  const runs = [...network.lines.values()].flatMap((line) => line.runs).sort((a, b) => b.length - a.length)
  for (const run of runs) {
    // A loop with nothing placed yet goes round a ring, so it reads as a loop rather than a row that doubles back.
    if (run[0] === run.at(-1) && run.every((id) => !placed.has(id))) {
      const ids = run.slice(0, -1)
      const corner = startCell(placed)
      const radius = Math.max(STEP, (ids.length * STEP) / (2 * Math.PI))
      for (const [index, id] of ids.entries()) {
        const angle = (index / ids.length) * 2 * Math.PI
        placeNear(id, snap({ x: corner.x + radius * (1 + Math.cos(angle)), y: corner.y + radius * (1 + Math.sin(angle)) }))
      }
      continue
    }

    for (let i = 0; i < run.length; ) {
      if (placed.has(run[i]!)) {
        i++
        continue
      }
      // run[i..end) is a stretch of stations with no position yet.
      let end = i
      while (end < run.length && !placed.has(run[end]!)) end++
      const stretch = run.slice(i, end)
      const before = run[i - 1]
      const after = run[end]

      if (before !== undefined && after !== undefined) {
        // Both neighbours are placed: space the stretch out along the straight line between them.
        const from = placed.get(before)!
        const to = placed.get(after)!
        for (const [index, id] of stretch.entries()) {
          if (placed.has(id)) continue
          const share = (index + 1) / (stretch.length + 1)
          placeNear(id, snap({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }))
        }
      } else if (before !== undefined) {
        walkFrom(before, stretch, headingInto(before, run[i - 2]))
      } else if (after !== undefined) {
        walkFrom(after, stretch.reverse(), headingInto(after, run[end + 1]))
      } else {
        // Nothing on this line is placed: start a fresh row, heading east.
        const first = stretch[0]!
        place(first, startCell(placed))
        walkFrom(first, stretch.slice(1), 0)
      }
      i = end
    }
  }
  return placed
}

/**
 * Stations sit on whole grid cells, and a route only runs straight or at 45°,
 * so a route passes through a known list of cells. `cellsBetween` returns the
 * ones strictly between its two end stations. A station on any of them would
 * have track drawn through it.
 */
function cellsBetween(route: Point[]): Point[] {
  const cells: Point[] = []
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!
    const to = route[i]!
    const step = { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) }
    const count = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))
    for (let n = 1; n < count; n++) cells.push({ x: from.x + step.x * n, y: from.y + step.y * n })
    // The route's corner is the end of this piece, and it lies between the stations too.
    if (i < route.length - 1) cells.push(to)
  }
  return cells
}

function snap(at: Point): Point {
  return { x: Math.round(at.x / STEP) * STEP, y: Math.round(at.y / STEP) * STEP }
}

/** Where a part of the map that joins nothing placed so far begins: the origin, or a clear cell under everything else. */
function startCell(placed: Map<string, Point>): Point {
  if (placed.size === 0) return { x: 0, y: 0 }
  const points = [...placed.values()]
  return {
    x: Math.min(...points.map((point) => point.x)),
    y: Math.max(...points.map((point) => point.y)) + STEP * 2,
  }
}

/** The compass direction that best matches travelling from `from` to `to`. */
function compassIndex(from: Point, to: Point): number {
  const eighths = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4))
  return (eighths + 8) % 8
}

/** How many 45° turns separate two compass directions: 0 for the same way, 4 for opposite. */
function turnsBetween(a: number, b: number): number {
  const apart = Math.abs(a - b)
  return Math.min(apart, 8 - apart)
}
