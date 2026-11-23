import { describe, expect, it } from 'vitest'
import workflow from '../../demo/data/workflow.json' with { type: 'json' }
import { autoPosition } from '../../src/layout/auto-position.ts'
import { direction, routeBetween } from '../../src/layout/geometry.ts'
import { placeLabels } from '../../src/layout/labels.ts'
import { layoutNetwork } from '../../src/layout/layout.ts'
import { METRICS } from '../../src/layout/metrics.ts'
import { buildTracks } from '../../src/layout/tracks.ts'
import { parseTubeMap } from '../../src/index.ts'

describe('routeBetween', () => {
  it('only runs horizontally, vertically or at 45°', () => {
    const route = routeBetween({ x: 0, y: 0 }, { x: 5, y: 2 })

    const angles = route.slice(1).map((point, index) => {
      const previous = route[index]!
      return (Math.atan2(point.y - previous.y, point.x - previous.x) * 180) / Math.PI
    })
    expect(angles).toEqual([0, 45])
  })

  it('gives the same route in both directions, so lines sharing track stay side by side', () => {
    expect(routeBetween({ x: 5, y: 2 }, { x: 0, y: 0 })).toEqual(routeBetween({ x: 0, y: 0 }, { x: 5, y: 2 }))
  })
})

describe('autoPosition', () => {
  it('gives every station its own cell and keeps track from running through other stations', () => {
    const network = parseTubeMap(workflow)
    const positions = autoPosition(network)

    const cells = [...positions.values()].map((cell) => `${cell.x},${cell.y}`)
    expect(new Set(cells).size).toBe(network.stations.size)

    // Track through a station would read as the line calling there.
    for (const line of network.lines.values()) {
      for (const run of line.runs) {
        for (let i = 1; i < run.length; i++) {
          const route = routeBetween(positions.get(run[i - 1]!)!, positions.get(run[i]!)!)
          for (const [id, cell] of positions) {
            const onTrack =
              route.slice(1, -1).some((corner) => corner.x === cell.x && corner.y === cell.y) ||
              route.slice(1).some((point, index) => strictlyBetween(cell, route[index]!, point))
            expect(onTrack, `${run[i - 1]} to ${run[i]} runs through ${id}`).toBe(false)
          }
        }
      }
    }
  })
})

/** Whether `point` lies on the straight piece from `a` to `b`, away from its two ends. Positions are whole numbers, so the maths is exact. */
function strictlyBetween(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const along = { x: b.x - a.x, y: b.y - a.y }
  const toPoint = { x: point.x - a.x, y: point.y - a.y }
  if (along.x * toPoint.y - along.y * toPoint.x !== 0) return false
  const share = toPoint.x * along.x + toPoint.y * along.y
  return share > 0 && share < along.x * along.x + along.y * along.y
}

describe('placeLabels', () => {
  it('keeps a name off a long diagonal that passes beside its station', () => {
    // The track starts and ends far away, and crosses the place a name to the west would take.
    const diagonal = { from: { x: 960, y: -1000 }, to: { x: -1040, y: 1000 }, halfWidth: 4 }
    // The station is on vertical track, so its name goes beside it: to the west first.
    const station = {
      id: 'bank',
      name: 'Bank',
      center: { x: 0, y: 0 },
      stops: [{ x: 0, y: 0 }],
      tracks: [{ x: 0, y: 1 }, { x: 0, y: -1 }],
      markerReach: 9,
      lineCount: 1,
      pinned: undefined,
    }

    expect(placeLabels([station], []).get('bank')!.side).toEqual({ x: -1, y: 0 })
    expect(placeLabels([station], [diagonal]).get('bank')!.side).toEqual({ x: 1, y: 0 })
  })
})

describe('layoutNetwork', () => {
  it('stops a line at its platform, and the other lines at the station', () => {
    const network = parseTubeMap({
      stations: [
        { id: 'west', name: 'West', x: 0, y: 0 },
        { id: 'hub', name: 'Hub', x: 4, y: 0, platforms: { deep: { x: 4, y: 1 } } },
        { id: 'south', name: 'South', x: 4, y: 4 },
      ],
      lines: [
        { id: 'surface', name: 'Surface', color: '#c00', stations: ['west', 'hub'] },
        { id: 'deep', name: 'Deep', color: '#00c', stations: ['hub', 'south'] },
      ],
    })

    const hub = layoutNetwork(network).stations.find((station) => station.id === 'hub')!

    const stops = Object.fromEntries(hub.passes.map((pass) => [pass.line, pass.at]))
    expect(stops).toEqual({
      surface: { x: 4 * METRICS.gridSize, y: 0 },
      deep: { x: 4 * METRICS.gridSize, y: METRICS.gridSize },
    })
  })
  it('keeps two lines on the same sides of each other round a turn, so they never cross', () => {
    const network = parseTubeMap({
      stations: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 2, y: 0 },
        { id: 'c', x: 2, y: -2 },
        { id: 'd', x: 2, y: -4 },
      ],
      lines: [
        { id: 'first', stations: ['a', 'b', 'c', 'd'] },
        { id: 'second', stations: ['a', 'b', 'c', 'd'] },
      ],
    })
    const layout = layoutNetwork(network)
    const passAt = (stationId: string, lineId: string) =>
      layout.stations.find((station) => station.id === stationId)!.passes.find((pass) => pass.line === lineId)!.at

    // Heading east and then north, the line on the north side has to end up on the west side.
    const firstIsNorth = passAt('a', 'first').y < passAt('a', 'second').y
    const firstIsWest = passAt('c', 'first').x < passAt('c', 'second').x
    expect(firstIsWest).toBe(firstIsNorth)
  })
})

describe('buildTracks', () => {
  it('moves a bend away from a station so the line runs straight through it', () => {
    // Each hop needs one bend. Left alone, both bends follow the same rule and the line turns at the middle station.
    const network = parseTubeMap({
      stations: [
        { id: 'a', name: 'A', x: 0, y: 0 },
        { id: 'b', name: 'B', x: 5, y: 2 },
        { id: 'c', name: 'C', x: 10, y: 4 },
      ],
      lines: [{ id: 'line', name: 'Line', color: '#c00', stations: ['a', 'b', 'c'] }],
    })
    const tracks = [...buildTracks(network, (stationId) => network.stations.get(stationId)!.position!).values()]

    const [into, outOf] = tracks.map((track) => track.points)
    expect(direction(into!.at(-2)!, into!.at(-1)!)).toEqual(direction(outOf![0]!, outOf![1]!))
  })
})
