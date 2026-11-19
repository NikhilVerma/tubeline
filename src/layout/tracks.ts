import type { Network, Point } from '../model/network.ts'
import { direction, distance, joinOffsetSegments, move, roundedPath, routeBetween, type OffsetSegment } from './geometry.ts'
import { METRICS } from './metrics.ts'

/** The drawn piece of a line between two neighbouring stations. */
export interface SegmentLayout {
  from: string
  to: string
  /** SVG path data. */
  path: string
  /** The half-way point, and the direction of travel there from `from` to `to`. A one-way arrow is drawn here. */
  middle: { at: Point; along: Point }
}

export interface LineLayout {
  id: string
  segments: SegmentLayout[]
}

/** Where one line passes through one station. Station markers are drawn from these. */
export interface Pass {
  line: string
  at: Point
  /** The direction the line runs in here, as a vector of length 1. */
  along: Point
  /** True when the line ends at this station. */
  terminus: boolean
}

/**
 * A `Track` is the route between two neighbouring stations, shared by every
 * line that runs between them.
 *
 * Lines on the same track must follow the same route to stay side by side, so
 * the route belongs to the track and each line takes a slot across its width.
 */
export interface Track {
  /** The route's points, in the order `routeBetween` gives them. */
  points: Point[]
  /** The lines on this track, in slot order. */
  lines: string[]
}

/** A join further than this from the corner it rounds is a spike, so the line steps across instead. A few line widths covers every normal corner. */
const MAX_JOIN_REACH = METRICS.lineWidth * 4

/**
 * Lines at one station can stop a short way apart, so where a line stops
 * depends on the station and the line. A `StopLookup` answers that in SVG units.
 */
export type StopLookup = (station: string, line: string) => Point

/**
 * `buildTracks` works out the route between every pair of neighbouring stops,
 * and which lines share it. Lines share a track when they join the same two
 * points, so lines that stop apart at a station get tracks of their own.
 */
export function buildTracks(network: Network, stopAt: StopLookup): Map<string, Track> {
  const tracks = new Map<string, Track>()
  // Each stretch of each line as the tracks it travels, in order.
  const journeys: Step[][] = []
  for (const line of network.lines.values()) {
    for (const run of line.runs) {
      const steps: Step[] = []
      for (let i = 1; i < run.length; i++) {
        const from = stopAt(run[i - 1]!, line.id)
        const to = stopAt(run[i]!, line.id)
        const { key, reversed } = trackBetween(from, to)
        const track = tracks.get(key) ?? { points: routeBetween(from, to), lines: [] }
        tracks.set(key, track)
        if (!track.lines.includes(line.id)) track.lines.push(line.id)
        steps.push({ track, reversed })
      }
      journeys.push(steps)
    }
  }
  straightenThroughStations(tracks, journeys)
  return tracks
}

/** One track of a line's stretch. `reversed` is true when the line travels it against the order of its points. */
interface Step {
  track: Track
  reversed: boolean
}

/** Each pass can change what suits a neighbouring track, so the choice is made twice. More passes changed nothing on the maps tried. */
const STRAIGHTENING_PASSES = 2

/**
 * A track that needs a corner can turn near either of its two stations. On a
 * tube map a line runs straight through a station and turns between
 * stations. `straightenThroughStations` gives each track the corner that
 * makes the lines on it turn least where they meet the next track.
 */
function straightenThroughStations(tracks: Map<string, Track>, journeys: Step[][]): void {
  const travelled = (step: Step, points: Point[] = step.track.points) => (step.reversed ? points.toReversed() : points)

  // Every time a line travels each track, found once here so that a track doesn't search every line for itself.
  const visits = new Map<Track, { steps: Step[]; index: number }[]>()
  for (const steps of journeys) {
    for (const [index, step] of steps.entries()) {
      const ofTrack = visits.get(step.track)
      if (ofTrack === undefined) visits.set(step.track, [{ steps, index }])
      else ofTrack.push({ steps, index })
    }
  }

  /** How much the lines on `track` turn at its two ends when it follows `points`: 0 for straight on, up to 2 for doubling back. */
  const turningWith = (track: Track, points: Point[]): number => {
    let turning = 0
    for (const { steps, index } of visits.get(track) ?? []) {
      const route = travelled(steps[index]!, points)
      const before = steps[index - 1]
      const after = steps[index + 1]
      if (before !== undefined) turning += turnBetween(travelled(before).slice(-2), route.slice(0, 2))
      if (after !== undefined) turning += turnBetween(route.slice(-2), travelled(after).slice(0, 2))
    }
    return turning
  }

  for (let pass = 0; pass < STRAIGHTENING_PASSES; pass++) {
    for (const track of tracks.values()) {
      // Only a track with a corner has a choice to make.
      if (track.points.length !== 3) continue
      const [from, , to] = track.points
      const cornerAtEnd = routeBetween(from!, to!)
      const cornerAtStart = routeBetween(from!, to!, true)
      track.points = turningWith(track, cornerAtStart) < turningWith(track, cornerAtEnd) ? cornerAtStart : cornerAtEnd
    }
  }
}

/** How far the second straight piece turns away from the first: 0 for straight on, 2 for doubling back. */
function turnBetween(first: Point[], second: Point[]): number {
  const a = direction(first[0]!, first[1]!)
  const b = direction(second[0]!, second[1]!)
  return 1 - (a.x * b.x + a.y * b.y)
}

/**
 * `drawLines` draws every line along its tracks. It returns each line's
 * segments, and where each line passes each station.
 */
export function drawLines(
  network: Network,
  stopAt: StopLookup,
  tracks: Map<string, Track>,
): { lines: LineLayout[]; passes: Map<string, Pass[]> } {
  const passes = new Map<string, Pass[]>()
  const lines: LineLayout[] = []

  for (const line of network.lines.values()) {
    const neighbours = new Map<string, Set<string>>()
    const addNeighbour = (of: string, neighbour: string) => {
      neighbours.set(of, (neighbours.get(of) ?? new Set()).add(neighbour))
    }
    const addPass = (station: string, at: Point, along: Point) => {
      const atStation = passes.get(station) ?? []
      passes.set(station, atStation)
      if (atStation.some((pass) => pass.line === line.id)) return
      atStation.push({ line: line.id, at, along, terminus: false })
    }

    const segments = new Map<string, SegmentLayout>()
    for (const run of line.runs) {
      // Collect the run's straight pieces, noting which piece starts each station-to-station step.
      const pieces: OffsetSegment[] = []
      const stepStarts: number[] = []
      for (let i = 1; i < run.length; i++) {
        addNeighbour(run[i - 1]!, run[i]!)
        addNeighbour(run[i]!, run[i - 1]!)
        const { key, reversed } = trackBetween(stopAt(run[i - 1]!, line.id), stopAt(run[i]!, line.id))
        const track = tracks.get(key)!
        // Slots are spread evenly either side of the track's centre.
        const slot = track.lines.indexOf(line.id) - (track.lines.length - 1) / 2
        const offset = slot * METRICS.lineSpacing
        const route = reversed ? track.points.toReversed() : track.points
        stepStarts.push(pieces.length)
        for (let p = 1; p < route.length; p++) {
          // Travelling a track backwards swaps its sides, so the offset flips to stay in the same slot.
          pieces.push({ from: route[p - 1]!, to: route[p]!, offset: reversed ? -offset : offset })
        }
      }
      stepStarts.push(pieces.length)

      const { points, joins } = joinOffsetSegments(pieces, MAX_JOIN_REACH)
      for (let i = 1; i < run.length; i++) {
        const firstPiece = stepStarts[i - 1]!
        const lastPiece = stepStarts[i]! - 1
        const stepPoints = points.slice(joins[firstPiece]!, joins[lastPiece + 1]! + 1)
        addPass(run[i - 1]!, stepPoints[0]!, direction(pieces[firstPiece]!.from, pieces[firstPiece]!.to))
        addPass(run[i]!, stepPoints.at(-1)!, direction(pieces[lastPiece]!.from, pieces[lastPiece]!.to))
        // A branch can repeat a step the main stretch already drew.
        const { key } = trackBetween(stopAt(run[i - 1]!, line.id), stopAt(run[i]!, line.id))
        if (!segments.has(key)) {
          const path = roundedPath(stepPoints, METRICS.cornerRadius)
          segments.set(key, { from: run[i - 1]!, to: run[i]!, path, middle: middleOf(stepPoints) })
        }
      }
    }

    for (const [station, others] of neighbours) {
      const pass = passes.get(station)?.find((candidate) => candidate.line === line.id)
      if (pass !== undefined) pass.terminus = others.size === 1
    }
    lines.push({ id: line.id, segments: [...segments.values()] })
  }
  return { lines, passes }
}

/**
 * Two stops name the same track whichever way a line travels between them.
 * `trackBetween` returns the track's key. `reversed` is true when travelling
 * `start` to `end` goes against the direction `routeBetween` lays the track in.
 */
function trackBetween(start: Point, end: Point): { key: string; reversed: boolean } {
  const reversed = start.x > end.x || (start.x === end.x && start.y > end.y)
  const [first, second] = reversed ? [end, start] : [start, end]
  return { key: `${first.x},${first.y} ${second.x},${second.y}`, reversed }
}

/** `middleOf` finds the point half-way along a path's length. It also returns the direction the path runs in there. */
function middleOf(points: Point[]): { at: Point; along: Point } {
  let remaining = 0
  for (let i = 1; i < points.length; i++) remaining += distance(points[i - 1]!, points[i]!) / 2
  for (let i = 1; i < points.length; i++) {
    const length = distance(points[i - 1]!, points[i]!)
    if (length > 0 && (remaining <= length || i === points.length - 1)) {
      const along = direction(points[i - 1]!, points[i]!)
      return { at: move(points[i - 1]!, along, Math.min(remaining, length)), along }
    }
    remaining -= length
  }
  return { at: points[0]!, along: { x: 1, y: 0 } }
}
