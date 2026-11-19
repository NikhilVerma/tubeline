import { boxAround, grow } from '../layout/geometry.ts'
import type { MapLayout, StationLayout } from '../layout/layout.ts'
import { METRICS } from '../layout/metrics.ts'
import type { Network } from '../model/network.ts'
import { setLineColor, svg } from './dom.ts'
import type { DrawnPiece } from './view-culling.ts'

/** The drawn map, with the elements the interactive layer needs to find again. */
export interface DrawnMap {
  svg: SVGSVGElement
  stations: Map<string, SVGGElement>
  lines: Map<string, SVGGElement>
  /** Each drawn piece of a line, keyed by `segmentKey`. */
  segments: Map<string, SVGGElement>
  /** Every station and piece of line with the space it fills, so the ones out of view can be skipped. */
  pieces: DrawnPiece[]
}

/**
 * A journey can travel a piece of a line either way, and the map draws that
 * piece once. `segmentKey` gives both directions the same key.
 */
export function segmentKey(line: string, a: string, b: string): string {
  return JSON.stringify([line, ...[a, b].sort()])
}

/** A small arrowhead pointing right, sized to sit inside a line's width. */
const ARROW_PATH = 'M-2.6,-2.9L2.8,0L-2.6,2.9Z'

/** How far a station's hover and focus halo reaches past its marker. */
const HALO_MARGIN = 5

/**
 * Turns a layout into SVG. Lines go underneath and stations on top, so
 * interchange discs cover the places where lines meet.
 */
export function drawMap(network: Network, layout: MapLayout): DrawnMap {
  const { bounds } = layout
  const segments = new Map<string, SVGGElement>()
  const canTravel = (line: string, from: string, to: string) =>
    network.hopsFrom.get(from)?.some((hop) => hop.to === to && hop.line === line) ?? false
  const lines = new Map<string, SVGGElement>()
  const stations = new Map<string, SVGGElement>()
  const pieces: DrawnPiece[] = []

  for (const lineLayout of layout.lines) {
    const line = network.lines.get(lineLayout.id)!
    const group = svg('g', { class: 'line', 'data-line': line.id })
    setLineColor(group, line.color)
    for (const segment of lineLayout.segments) {
      const piece = svg('g', { class: 'segment', 'data-from': segment.from, 'data-to': segment.to }, [
        svg('path', { class: 'track', d: segment.path }),
      ])
      // Track that can only be travelled one way gets an arrow showing which.
      const forwards = canTravel(line.id, segment.from, segment.to)
      const backwards = canTravel(line.id, segment.to, segment.from)
      if (forwards !== backwards) {
        const { at, along } = segment.middle
        const angle = (Math.atan2(along.y, along.x) * 180) / Math.PI + (forwards ? 0 : 180)
        piece.append(svg('path', { class: 'arrow', d: ARROW_PATH, transform: `translate(${at.x} ${at.y}) rotate(${angle})` }))
      }
      segments.set(segmentKey(line.id, segment.from, segment.to), piece)
      pieces.push({ element: piece, box: segment.box })
      group.append(piece)
    }
    lines.set(line.id, group)
  }

  for (const stationLayout of layout.stations) {
    const station = network.stations.get(stationLayout.id)!
    const lineNames = station.lines.map((lineId) => network.lines.get(lineId)!.name).join(', ')
    const { center, label } = stationLayout
    const reach = Math.max(0, ...stationLayout.passes.map((pass) => Math.hypot(pass.at.x - center.x, pass.at.y - center.y)))
    const haloRadius = reach + METRICS.tickReach + HALO_MARGIN

    const group = svg(
      'g',
      {
        class: stationLayout.interchange ? 'station is-interchange' : 'station',
        'data-station': station.id,
        // A station is a button: Tab reaches it and Enter presses it.
        tabindex: 0,
        role: 'button',
        'aria-label': `${station.name}. ${station.lines.length > 1 ? 'Lines' : 'Line'}: ${lineNames}.`,
      },
      [
        svg('circle', { class: 'halo', cx: center.x, cy: center.y, r: haloRadius }),
        ...drawMarker(network, stationLayout),
        svg(
          'text',
          { class: 'label', 'text-anchor': label.anchor },
          label.lines.map((line, index) => svg('tspan', { x: label.x, y: label.y + index * label.lineHeight }, [line])),
        ),
      ],
    )
    stations.set(station.id, group)
    // A station fills its halo, which covers the marker, and its name.
    const halo = grow(boxAround([center]), haloRadius)
    const corners = [halo, label.box].flatMap((box) => [
      { x: box.left, y: box.top },
      { x: box.right, y: box.bottom },
    ])
    pieces.push({ element: group, box: boxAround(corners) })
  }

  const root = svg(
    'svg',
    {
      class: 'map',
      viewBox: `${bounds.left} ${bounds.top} ${bounds.right - bounds.left} ${bounds.bottom - bounds.top}`,
      role: 'group',
      'aria-label': network.name,
    },
    [svg('g', { class: 'lines' }, [...lines.values()]), svg('g', { class: 'stations' }, [...stations.values()])],
  )
  return { svg: root, stations, lines, segments, pieces }
}

function drawMarker(network: Network, station: StationLayout): SVGElement[] {
  if (!station.interchange) {
    return station.ticks.map((tick) =>
      svg('path', {
        class: 'tick',
        d: `M${tick.from.x},${tick.from.y}L${tick.to.x},${tick.to.y}`,
        stroke: network.lines.get(tick.line)!.color,
      }),
    )
  }
  // An interchange is a disc at each place lines stop. A narrower bar joins the
  // station's centre to each disc. A stroke of no length with round ends draws as a disc. The
  // dark outlines go down first and the white fills on top, so the shapes merge.
  const { x, y } = station.center
  const discs = station.stops.map((stop) => `M${stop.x},${stop.y}L${stop.x},${stop.y}`).join('')
  const walkways = station.stops.map((stop) => `M${x},${y}L${stop.x},${stop.y}`).join('')
  return [
    svg('path', { class: 'walkway-outline', d: walkways }),
    svg('path', { class: 'interchange-outline', d: discs }),
    svg('path', { class: 'walkway-fill', d: walkways }),
    svg('path', { class: 'interchange-fill', d: discs }),
  ]
}
