import type { Network, Point } from '../model/network.ts'
import { autoPosition } from './auto-position.ts'
import { distance, move, clockwiseNormal, type Box } from './geometry.ts'
import { placeLabels, type LabelLayout, type TrackObstacle } from './labels.ts'
import { METRICS } from './metrics.ts'
import { buildTracks, drawLines, type LineLayout, type Pass, type StopLookup } from './tracks.ts'

export interface StationLayout {
  id: string
  center: Point
  /** Where each line passes through the station. */
  passes: Pass[]
  /** True where lines meet, which is drawn as joined white discs. Other stations are drawn as ticks. */
  interchange: boolean
  /** The places lines stop: the station's own position, and each platform. An interchange has a disc on each. */
  stops: Point[]
  /** The tick marks of a station that isn't an interchange. */
  ticks: { from: Point; to: Point; line: string }[]
  label: LabelLayout
}

/**
 * A `MapLayout` is a map worked out as plain geometry: where every line runs,
 * where every station and name sits, and how big the whole drawing is.
 *
 * It holds no DOM, so it can be computed and checked without a browser. The
 * renderer turns it into SVG.
 */
export interface MapLayout {
  bounds: Box
  lines: LineLayout[]
  stations: StationLayout[]
}

/**
 * Lays a network out as a tube map. The steps:
 *
 * 1. Take each station's position, or place the stations when none are given.
 * 2. Route the track between neighbouring stations and draw each line along it.
 * 3. Pick a side for every station's name.
 * 4. Add each station's tick marks, on the side its name is on.
 */
export function layoutNetwork(network: Network): MapLayout {
  const gridPositions = [...network.stations.values()].every((station) => station.position !== undefined)
    ? new Map([...network.stations.values()].map((station) => [station.id, station.position!]))
    : autoPosition(network)
  const positions = new Map<string, Point>()
  for (const [id, at] of gridPositions) positions.set(id, { x: at.x * METRICS.gridSize, y: at.y * METRICS.gridSize })

  const toSvgUnits = (at: Point) => ({ x: at.x * METRICS.gridSize, y: at.y * METRICS.gridSize })
  const stopAt: StopLookup = (stationId, lineId) => {
    const platform = network.stations.get(stationId)!.platforms.get(lineId)
    return platform === undefined ? positions.get(stationId)! : toSvgUnits(platform)
  }
  const tracks = buildTracks(network, stopAt)
  const { lines, passes } = drawLines(network, stopAt, tracks)

  const obstacles: TrackObstacle[] = []
  for (const track of tracks.values()) {
    // Half of what the track's lines cover: the first and last line are a spacing apart for each line between them, and each reaches half its width further out.
    const halfWidth = ((track.lines.length - 1) * METRICS.lineSpacing + METRICS.lineWidth) / 2
    for (let i = 1; i < track.points.length; i++) obstacles.push({ from: track.points[i - 1]!, to: track.points[i]!, halfWidth })
  }

  const stations = [...network.stations.values()].map((station) => {
    const center = positions.get(station.id)!
    const stationPasses = passes.get(station.id) ?? []
    return { station, center, passes: stationPasses }
  })
  const labels = placeLabels(
    stations.map(({ station, center, passes: stationPasses }) => ({
      id: station.id,
      name: station.name,
      center,
      stops: stationPasses.map((pass) => pass.at),
      lineCount: station.lines.length,
      pinned: station.labelSide,
    })),
    obstacles,
  )

  const stationLayouts = stations.map(({ station, center, passes: stationPasses }): StationLayout => {
    const label = labels.get(station.id)!
    const interchange = !runSideBySide(stationPasses)
    // Lines side by side share one tick, on the line nearest the name. A bar crosses its line, so every line keeps its own.
    const towardsName = (pass: Pass) => pass.at.x * label.side.x + pass.at.y * label.side.y
    const nearestName = Math.max(...stationPasses.map(towardsName))
    const ticked = stationPasses.filter((pass) => isBar(pass, label.side) || towardsName(pass) >= nearestName - SAME_PLACE)
    return {
      id: station.id,
      center,
      passes: stationPasses,
      interchange,
      stops: uniquePoints(station.lines.map((lineId) => stopAt(station.id, lineId))),
      ticks: interchange ? [] : ticked.map((pass) => ({ ...tickFor(pass, label.side), line: pass.line })),
      label,
    }
  })

  return { bounds: boundsOf(stationLayouts), lines, stations: stationLayouts }
}

function uniquePoints(points: Point[]): Point[] {
  return [...new Map(points.map((point) => [`${point.x},${point.y}`, point])).values()]
}

/** Distances smaller than this are rounding noise. */
const SAME_PLACE = 0.01

/**
 * A station is an interchange where its lines cross or stop apart. Lines that
 * run through side by side on shared track are one stop, which a tube map
 * marks with a tick. `runSideBySide` tells the two apart.
 */
function runSideBySide(passes: Pass[]): boolean {
  const first = passes[0]
  if (first === undefined) return true
  const widest = (passes.length - 1) * METRICS.lineSpacing + SAME_PLACE
  return passes.every((pass) => {
    const parallel = Math.abs(first.along.x * pass.along.y - first.along.y * pass.along.x) < SAME_PLACE
    const apart = { x: pass.at.x - first.at.x, y: pass.at.y - first.at.y }
    const alongTrack = Math.abs(apart.x * first.along.x + apart.y * first.along.y)
    return parallel && alongTrack < SAME_PLACE && distance(first.at, pass.at) <= widest
  })
}

/** A tick becomes a bar across the line at the end of a line, or when the name sits in line with the track. */
function isBar(pass: Pass, labelSide: Point): boolean {
  const across = clockwiseNormal(trackUnderTick(pass, labelSide))
  return pass.terminus || Math.abs(across.x * labelSide.x + across.y * labelSide.y) < 0.1
}

/**
 * A tick sticks out of the line towards the station's name. A bar crosses the line instead.
 *
 * Where a piece of track stops at a station, at the end of a line or at a
 * turn, it is drawn with a rounded end that reaches half the line's width
 * past the station. A tick is thinner than the line, so one left on the
 * station would stick out of the middle of that rounded end. There the tick
 * moves out until its edge is level with the end of the track, which gives
 * the track a flat end.
 */
function tickFor(pass: Pass, labelSide: Point): { from: Point; to: Point } {
  const track = trackUnderTick(pass, labelSide)
  const across = clockwiseNormal(track)
  const reach = (Math.sign(across.x * labelSide.x + across.y * labelSide.y) || 1) * METRICS.tickReach
  // The track carries on when another piece of the line leaves the station the opposite way.
  const trackStopsHere = !pass.alsoAlong.some((other) => other.x * track.x + other.y * track.y < SAME_PLACE - 1)
  const middle = trackStopsHere ? move(pass.at, track, (METRICS.lineWidth - METRICS.tickWidth) / 2) : pass.at
  return { from: isBar(pass, labelSide) ? move(middle, across, -reach) : middle, to: move(middle, across, reach) }
}

/**
 * A tick stands square to its line. Where the line turns at a station there
 * is more than one piece of track to stand square to, and the wrong one
 * leaves the tick pointing past the station's name.
 *
 * `trackUnderTick` returns the direction of the piece whose tick points most
 * nearly at the name.
 */
function trackUnderTick(pass: Pass, labelSide: Point): Point {
  const towardsName = (track: Point) => Math.abs(track.x * labelSide.y - track.y * labelSide.x)
  let best = pass.along
  for (const track of pass.alsoAlong) {
    if (towardsName(track) > towardsName(best) + SAME_PLACE) best = track
  }
  return best
}

function boundsOf(stations: StationLayout[]): Box {
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  const include = (box: Box) => {
    bounds.left = Math.min(bounds.left, box.left)
    bounds.top = Math.min(bounds.top, box.top)
    bounds.right = Math.max(bounds.right, box.right)
    bounds.bottom = Math.max(bounds.bottom, box.bottom)
  }
  for (const station of stations) {
    include(station.label.box)
    for (const point of [station.center, ...station.passes.map((pass) => pass.at)]) {
      include({ left: point.x, top: point.y, right: point.x, bottom: point.y })
    }
  }
  // A small map is given extra space round it, so fitting it to a large container doesn't blow it up.
  const spareWidth = Math.max(0, METRICS.minimumWidth - (bounds.right - bounds.left)) / 2
  const spareHeight = Math.max(0, METRICS.minimumHeight - (bounds.bottom - bounds.top)) / 2
  return {
    left: bounds.left - METRICS.padding - spareWidth,
    top: bounds.top - METRICS.padding - spareHeight,
    right: bounds.right + METRICS.padding + spareWidth,
    bottom: bounds.bottom + METRICS.padding + spareHeight,
  }
}
