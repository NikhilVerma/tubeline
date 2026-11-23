/**
 * The drawing maths behind the tube-map look: routes that only run
 * horizontally, vertically or at 45°, lines drawn side by side on shared
 * track, and rounded corners.
 */
import type { Point } from '../model/network.ts'

/** Differences smaller than this are rounding noise, not real distances. */
const EPSILON = 1e-6

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** The direction from `a` to `b` as a vector of length 1. */
export function direction(a: Point, b: Point): Point {
  const length = distance(a, b)
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
}

/** `point` moved `amount` along `along`. */
export function move(point: Point, along: Point, amount: number): Point {
  return { x: point.x + along.x * amount, y: point.y + along.y * amount }
}

/** The direction a quarter turn clockwise from `along`, as seen on screen. It is the side that positive offsets shift a line towards. */
export function clockwiseNormal(along: Point): Point {
  return { x: -along.y, y: along.x }
}

/**
 * Tube maps only draw track horizontally, vertically or at 45°, and two
 * stations rarely line up that way. `routeBetween` joins them with a straight
 * stretch followed by a diagonal one, and returns the route's points.
 *
 * The route is the same whichever station is given first. It always runs from
 * the station further west, or further north when they are level. Two lines
 * that travel the same track in opposite directions then share one route.
 *
 * Stations that already line up get a direct route with no corner.
 *
 * `diagonalFirst` swaps the two stretches, which moves the corner to the
 * other end. The layout uses it to let a line run straight through a station.
 */
export function routeBetween(a: Point, b: Point, diagonalFirst = false): Point[] {
  const [from, to] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a]
  const dx = to.x - from.x
  const dy = to.y - from.y
  const acrossBy = Math.abs(dx)
  const downBy = Math.abs(dy)
  if (acrossBy < EPSILON || downBy < EPSILON || Math.abs(acrossBy - downBy) < EPSILON) return [from, to]

  // The straight stretch runs along the longer axis, and the 45° stretch covers the shorter one.
  const straight = acrossBy > downBy ? { x: Math.sign(dx) * (acrossBy - downBy), y: 0 } : { x: 0, y: Math.sign(dy) * (downBy - acrossBy) }
  const corner = diagonalFirst ? { x: to.x - straight.x, y: to.y - straight.y } : { x: from.x + straight.x, y: from.y + straight.y }
  return [from, corner, to]
}

/** A straight piece of a line, drawn `offset` to the side of where the track's centre runs. */
export interface OffsetSegment {
  from: Point
  to: Point
  offset: number
}

/**
 * Lines that share track are drawn side by side, so each is shifted sideways
 * from the track's centre, and the shift can differ from one piece to the
 * next. `joinOffsetSegments` shifts every piece and joins the results into
 * one continuous path.
 *
 * It returns the path's points. `joins[i]` is the index of the point where
 * piece `i` starts, and the last entry is where the final piece ends.
 */
export function joinOffsetSegments(segments: OffsetSegment[], maxJoinReach: number): { points: Point[]; joins: number[] } {
  const shifted = segments.map(({ from, to, offset }) => {
    const side = clockwiseNormal(direction(from, to))
    return { from: move(from, side, offset), to: move(to, side, offset) }
  })

  const points: Point[] = []
  const joins: number[] = []
  for (const [index, segment] of shifted.entries()) {
    const previous = shifted[index - 1]
    if (previous === undefined) {
      points.push(segment.from)
      joins.push(0)
      continue
    }
    // Where two pieces meet at an angle, extend both to the point they cross,
    // which keeps the line's width even round the corner.
    const corner = intersection(previous.from, previous.to, segment.from, segment.to)
    if (corner !== undefined && distance(corner, previous.to) <= maxJoinReach) {
      points.push(corner)
      joins.push(points.length - 1)
      continue
    }
    // Parallel pieces never cross, and at a very sharp turn the crossing is
    // far away. Step straight from one piece to the next instead.
    points.push(previous.to)
    joins.push(points.length - 1)
    if (distance(previous.to, segment.from) > EPSILON) points.push(segment.from)
  }
  const last = shifted.at(-1)
  if (last !== undefined) {
    points.push(last.to)
    joins.push(points.length - 1)
  }
  return { points, joins }
}

/** Where the infinite lines through a→b and c→d cross, or undefined when they are parallel. */
function intersection(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  const first = subtract(b, a)
  const second = subtract(d, c)
  const cross = first.x * second.y - first.y * second.x
  if (Math.abs(cross) < EPSILON) return undefined
  const along = ((c.x - a.x) * second.y - (c.y - a.y) * second.x) / cross
  return move(a, first, along)
}

/**
 * On a tube map, lines sweep round bends, and every bend has the same
 * radius whether it turns 45° or 90°. `roundedPath` turns points into SVG
 * path data and swaps each corner for an arc of a circle of that `radius`.
 *
 * A gentle turn needs less room than a sharp one, so the arc starts closer to
 * the corner. Where a neighbouring piece is too short to fit the arc, the arc
 * starts half-way along that piece and its radius shrinks to suit.
 */
export function roundedPath(points: Point[], radius: number): string {
  const first = points[0]
  if (first === undefined) return ''
  const commands = [`M${format(first)}`]
  for (let i = 1; i < points.length; i++) {
    const corner = points[i]!
    const before = points[i - 1]!
    const after = points[i + 1]
    if (after === undefined) {
      commands.push(`L${format(corner)}`)
      break
    }
    const arriving = direction(before, corner)
    const leaving = direction(corner, after)
    const cosine = arriving.x * leaving.x + arriving.y * leaving.y
    // A path that doubles back on itself has no arc to draw, so its corner is kept.
    if (cosine < EPSILON - 1) {
      commands.push(`L${format(corner)}`)
      continue
    }
    // An arc of radius r that turns through an angle starts r × tan(angle / 2) before the corner.
    const tanHalfTurn = Math.sqrt((1 - cosine) / (1 + cosine))
    const cut = Math.min(radius * tanHalfTurn, distance(before, corner) / 2, distance(corner, after) / 2)
    if (cut < EPSILON) continue
    const arcRadius = round(cut / tanHalfTurn)
    const clockwise = arriving.x * leaving.y - arriving.y * leaving.x > 0 ? 1 : 0
    commands.push(`L${format(move(corner, arriving, -cut))}`)
    commands.push(`A${arcRadius},${arcRadius} 0 0 ${clockwise} ${format(move(corner, leaving, cut))}`)
  }
  return commands.join('')
}

function format(point: Point): string {
  return `${round(point.x)},${round(point.y)}`
}

/** Two decimal places are finer than a screen pixel and keep path data short. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** The smallest box that holds every one of `points`. */
export function boxAround(points: Point[]): Box {
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  }
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

export function grow(box: Box, by: number): Box {
  return { left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by }
}

/** Whether any part of the straight piece from `a` to `b` lies inside `box`. */
export function segmentTouchesBox(a: Point, b: Point, box: Box): boolean {
  // Liang–Barsky clipping: narrow the part of the piece (0 to 1) that is
  // inside each side of the box. Nothing left means the piece misses the box.
  let start = 0
  let end = 1
  const delta = subtract(b, a)
  const sides: [number, number][] = [
    [-delta.x, a.x - box.left],
    [delta.x, box.right - a.x],
    [-delta.y, a.y - box.top],
    [delta.y, box.bottom - a.y],
  ]
  for (const [change, room] of sides) {
    if (Math.abs(change) < EPSILON) {
      if (room < 0) return false
      continue
    }
    const at = room / change
    if (change < 0) start = Math.max(start, at)
    else end = Math.min(end, at)
    if (start > end) return false
  }
  return true
}
