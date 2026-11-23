import type { Point } from '../model/network.ts'
import type { LabelSide } from '../model/types.ts'
import { createBoxIndex } from './box-index.ts'
import { boxAround, boxesOverlap, distance, grow, move, segmentTouchesBox, subtract, type Box } from './geometry.ts'
import { METRICS } from './metrics.ts'

export interface LabelLayout {
  /** The lines of text the name is drawn as. */
  lines: string[]
  /** Where the text is anchored. `y` is the vertical middle of the first line. */
  x: number
  y: number
  /** The distance from one line of text down to the next. */
  lineHeight: number
  anchor: 'start' | 'middle' | 'end'
  /** The space the text is expected to fill. */
  box: Box
  /** The side of the station the label sits on, as a vector of length 1. */
  side: Point
}

export interface LabelRequest {
  id: string
  name: string
  center: Point
  /** Where the station's lines stop. The marker covers these points, and the name starts past them. */
  stops: Point[]
  /** How far the marker reaches from each stop: the length of a tick, or the radius of an interchange ring. */
  markerReach: number
  /** The direction of each piece of track at the station, as vectors of length 1. A name avoids sitting in line with them. */
  tracks: Point[]
  /** How many lines call here. Busier stations choose their side first. */
  lineCount: number
  /** A side the caller asked for. It is used as given. */
  pinned: LabelSide | undefined
}

/** A straight piece of track that labels should keep off. */
export interface TrackObstacle {
  from: Point
  to: Point
  halfWidth: number
}

/**
 * The sides a label can take. `sidesFor` puts them in order for one station,
 * and this order settles the ties.
 *
 * The order is measured on the official London tube map: names sit below a
 * line more often than above it (82 to 55), and left of one more often than
 * right (83 to 67). Corners come last.
 */
const SIDES: readonly Side[] = [
  { name: 's', x: 0, y: 1 },
  { name: 'n', x: 0, y: -1 },
  { name: 'w', x: -1, y: 0 },
  { name: 'e', x: 1, y: 0 },
  { name: 'se', x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { name: 'ne', x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { name: 'sw', x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { name: 'nw', x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
]

interface Side {
  name: LabelSide
  x: number
  y: number
}

/**
 * Two rules order the sides a name can take at one station.
 *
 * The "square to the track" rule: a name sits across its line, not along it.
 * It is measured on the official London tube map. On horizontal track, 137
 * of 157 names are above or below the line. On vertical track, 150 of 169
 * are to its left or right.
 *
 * The "open side" rule: where track meets at a station from one side only,
 * such as a corner or the point of a branch, the name sits on the far side
 * of that point and carries on away from the track. It is a design choice,
 * not a measurement.
 *
 * `sidesFor` returns the sides best first. The best side has the least track
 * running out of the station towards it. Among equals, the best faces most
 * directly away from the track.
 */
function sidesFor(request: LabelRequest): Side[] {
  const facing = (side: Side, direction: Point) => side.x * direction.x + side.y * direction.y
  // Each of `tracks` points off the end of its piece, so the piece itself runs the opposite way.
  // The end of a line counts both ways, which keeps its name beside the line and not past its end.
  const lineEnds = request.tracks.length === 1
  const trackTowards = (side: Side) => Math.max(0, ...request.tracks.map((track) => (lineEnds ? Math.abs(facing(side, track)) : -facing(side, track))))

  // Track that passes straight through adds up to nothing, and so has no open side.
  const awayFromTrack = request.tracks.reduce((sum, track) => ({ x: sum.x + track.x, y: sum.y + track.y }), { x: 0, y: 0 })
  const hasOpenSide = !lineEnds && Math.hypot(awayFromTrack.x, awayFromTrack.y) > NO_OPEN_SIDE
  const openness = (side: Side) => (hasOpenSide ? facing(side, awayFromTrack) : 0)

  // Rounded so that sides at the same angle tie, and the order of `SIDES` decides between them.
  const rank = (side: Side) => Math.round(trackTowards(side) * 100) * 1000 - Math.round(openness(side) * 100)
  return SIDES.toSorted((a, b) => rank(a) - rank(b))
}

/** Track directions that add up to less than this cancel out. It allows for rounding. */
const NO_OPEN_SIDE = 0.01

/**
 * The "wrap above and below" rule: a name above or below its line goes on
 * two lines, and a name beside its line stays on one.
 *
 * It is measured on the official London tube map, over the names that have a
 * space to split at. Above or below a line, 87% are on two lines. Beside a
 * line, 36% are. A name beside a line is mostly split only when it is long:
 * 87% of names of 19 characters or more are split.
 *
 * `wrappingsFor` returns the ways to write a name on one side, best first.
 * The other way stays available for when the best one doesn't fit.
 */
function wrappingsFor(name: string, side: Side): string[][] {
  const split = splitName(name)
  if (split.length === 1) return [split]
  const longestSingleLine = side.x === 0 ? LONGEST_SINGLE_LINE_ABOVE_OR_BELOW : LONGEST_SINGLE_LINE_BESIDE
  return name.length > longestSingleLine ? [split, [name]] : [[name], split]
}

/**
 * Layout runs without a browser, so it can't measure text. This is the
 * average width of a character in a typical sans-serif font, as a share of
 * the font size. It only has to be close enough to keep labels apart.
 */
const AVERAGE_CHARACTER_WIDTH = 0.58

/** The height of one line of a label, as a multiple of its font size. Measured on the official London tube map: lines of a name are 1.95 line widths apart, over 200 pairs of lines. */
const LINE_HEIGHT = 1.04

/** The height of a capital letter, as a share of the font size, in a typical sans-serif font. A line of text is taller than its letters, and this says by how much. */
const CAPITAL_HEIGHT = 0.72

/** The longest name kept on one line above or below its track. Shorter names fit between the neighbouring stations as they are. A design choice. */
const LONGEST_SINGLE_LINE_ABOVE_OR_BELOW = 9

/** The longest name kept on one line beside its track. See `wrappingsFor` for the measurement. */
const LONGEST_SINGLE_LINE_BESIDE = 18

/**
 * What each kind of overlap costs a side. Two names on top of each other
 * can't be read at all, so that costs the most. A name over track is still
 * legible against its outline, and brushing another station's marker is only
 * untidy. Any overlap costs more than the preference between sides and
 * wrappings, which runs from 0 to 15.
 */
const TRACK_PENALTY = 100
const LABEL_PENALTY = 300
const MARKER_PENALTY = 40

/** The cell size of the indexes that find what is near a name. Two grid units is about the size of a name, so a name reads only a few cells. It changes speed, never the result. */
const INDEX_CELL_SIZE = METRICS.gridSize * 2

/**
 * Picks a side of each station for its name. It tries all eight sides and
 * takes the one that overlaps the least track, the fewest other stations and
 * the fewest names already placed.
 *
 * A long name is tried on two lines first and then on one. The one-line form
 * is wider and shorter, so it can fit where the two-line form would not.
 */
export function placeLabels(requests: LabelRequest[], tracks: TrackObstacle[]): Map<string, LabelLayout> {
  const labels = new Map<string, LabelLayout>()

  // Each name is only tested against the track, markers and names near it, so a large map stays quick.
  const nearbyTracks = createBoxIndex<TrackObstacle>(INDEX_CELL_SIZE)
  for (const track of tracks) {
    // A long diagonal's bounding box covers far more cells than the track crosses, so the track is filed a short stretch at a time.
    const stretches = Math.max(1, Math.ceil(distance(track.from, track.to) / INDEX_CELL_SIZE))
    for (let i = 0; i < stretches; i++) {
      const start = move(track.from, subtract(track.to, track.from), i / stretches)
      const end = move(track.from, subtract(track.to, track.from), (i + 1) / stretches)
      // Track counts when it comes within its own half width of a name, so it is filed under that wider box.
      nearbyTracks.add(grow(boxAround([start, end]), track.halfWidth), track)
    }
  }
  const nearbyMarkers = createBoxIndex<{ of: LabelRequest; box: Box }>(INDEX_CELL_SIZE)
  for (const request of requests) {
    const box = markerBox(request)
    nearbyMarkers.add(box, { of: request, box })
  }
  const nearbyLabels = createBoxIndex<LabelLayout>(INDEX_CELL_SIZE)

  // Busy stations have the fewest clear sides, so they choose first and quieter stations fit round them.
  const busiestFirst = requests.toSorted((a, b) => b.lineCount - a.lineCount)
  for (const request of busiestFirst) {
    const candidates = sidesFor(request).filter((side) => request.pinned === undefined || side.name === request.pinned)
    let best: { label: LabelLayout; penalty: number } | undefined

    for (const [rank, { side, lines }] of candidates.flatMap((side) => wrappingsFor(request.name, side).map((lines) => ({ side, lines }))).entries()) {
      const label = labelOnSide(request, side, lines)
      let penalty = rank
      for (const track of nearbyTracks.near(label.box)) {
        // Only track that the name would sit on counts. A name always starts close to its own station's track, and counting that would cost every side the same.
        if (segmentTouchesBox(track.from, track.to, grow(label.box, track.halfWidth))) penalty += TRACK_PENALTY
      }
      for (const marker of nearbyMarkers.near(label.box)) {
        if (marker.of !== request && boxesOverlap(label.box, marker.box)) penalty += MARKER_PENALTY
      }
      for (const placed of nearbyLabels.near(label.box)) {
        if (boxesOverlap(label.box, placed.box)) penalty += LABEL_PENALTY
      }
      if (best === undefined || penalty < best.penalty) best = { label, penalty }
    }
    if (best !== undefined) {
      labels.set(request.id, best.label)
      nearbyLabels.add(best.label.box, best.label)
    }
  }
  return labels
}

/** The space a station's marker fills: its stops, and the tick or disc drawn on each. */
function markerBox(request: LabelRequest): Box {
  return grow(boxAround([request.center, ...request.stops]), request.markerReach)
}

function labelOnSide(request: LabelRequest, side: Side, lines: string[]): LabelLayout {
  const lineHeight = METRICS.labelFontSize * LINE_HEIGHT
  const width = Math.max(...lines.map((line) => line.length)) * METRICS.labelFontSize * AVERAGE_CHARACTER_WIDTH
  const height = lines.length * lineHeight
  // The name starts past the furthest stop on its side, so a wide marker only pushes away the names beside its wide ends.
  const furthestStop = Math.max(0, ...request.stops.map((stop) => (stop.x - request.center.x) * side.x + (stop.y - request.center.y) * side.y))
  // The gap is measured to the letters. A line of text is taller than its letters, so above and below the text box starts closer.
  const spaceAroundLetters = ((lineHeight - METRICS.labelFontSize * CAPITAL_HEIGHT) / 2) * Math.abs(side.y)
  const clearance = furthestStop + request.markerReach + METRICS.labelGap - spaceAroundLetters
  const x = request.center.x + side.x * clearance
  const y = request.center.y + side.y * clearance

  // The label grows away from the station: to the right when it sits on the
  // right, downwards when it sits below, and centred on an axis it isn't pushed along.
  const left = side.x > 0 ? x : side.x < 0 ? x - width : x - width / 2
  const top = side.y > 0 ? y : side.y < 0 ? y - height : y - height / 2
  return {
    lines,
    x,
    y: top + lineHeight / 2,
    lineHeight,
    anchor: side.x > 0 ? 'start' : side.x < 0 ? 'end' : 'middle',
    box: { left, top, right: left + width, bottom: top + height },
    side: { x: side.x, y: side.y },
  }
}

/** Splits a name over two lines, at the space nearest its middle. A name with no space stays whole. */
function splitName(name: string): string[] {
  let best: number | undefined
  for (let i = name.indexOf(' '); i !== -1; i = name.indexOf(' ', i + 1)) {
    if (best === undefined || Math.abs(i - name.length / 2) < Math.abs(best - name.length / 2)) best = i
  }
  return best === undefined ? [name] : [name.slice(0, best), name.slice(best + 1)]
}
