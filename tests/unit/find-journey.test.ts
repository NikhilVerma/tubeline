import { describe, expect, it } from 'vitest'
import metro from '../../demo/data/metro.json' with { type: 'json' }
import { findJourney, parseTubeMap, type TubeMapData } from '../../src/index.ts'

/** The stations a journey passes, in order, to make expected routes easy to read. */
function stationsOf(journey: ReturnType<typeof findJourney>): string[] {
  const hops = journey?.legs.flatMap((leg) => leg.hops) ?? []
  return hops.length === 0 ? [] : [hops[0]!.from, ...hops.map((hop) => hop.to)]
}

/**
 * Two ways from `a` to `d`: three stops direct on the red line, or two stops
 * with a change from blue to green at `x`.
 */
const TWO_WAYS: TubeMapData = {
  stations: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'x' }],
  lines: [
    { id: 'red', stations: ['a', 'b', 'c', 'd'] },
    { id: 'blue', stations: ['a', 'x'] },
    { id: 'green', stations: ['x', 'd'] },
  ],
}

describe('findJourney', () => {
  it('stays on one line when a change would cost more than the stops it saves', () => {
    const journey = findJourney(parseTubeMap(TWO_WAYS), 'a', 'd')

    expect(stationsOf(journey)).toEqual(['a', 'b', 'c', 'd'])
    expect(journey?.cost).toBe(3)
  })

  it('takes the shorter route with a change when changing is free', () => {
    const journey = findJourney(parseTubeMap(TWO_WAYS), 'a', 'd', { interchangeCost: 0 })

    expect(journey?.legs.map((leg) => leg.line)).toEqual(['blue', 'green'])
    expect(journey?.cost).toBe(2)
  })

  it('goes round a closed direction', () => {
    const network = parseTubeMap(metro)

    // Ashdown to Easterly is closed, so the one-stop ride back is not allowed.
    expect(stationsOf(findJourney(network, 'easterly', 'ashdown'))).toEqual(['easterly', 'ashdown'])
    const detour = findJourney(network, 'ashdown', 'easterly')
    expect(detour?.legs.flatMap((leg) => leg.hops)).not.toContainEqual(expect.objectContaining({ from: 'ashdown', to: 'easterly' }))
    // Seven stops and three changes: the long way round through Highmere.
    expect(detour?.cost).toBe(13)
  })

  it('refuses an interchange cost that would stop the search ending', () => {
    const network = parseTubeMap(TWO_WAYS)

    expect(() => findJourney(network, 'a', 'd', { interchangeCost: -1 })).toThrow(/interchangeCost/)
    expect(() => findJourney(network, 'a', 'd', { interchangeCost: Number.NaN })).toThrow(/interchangeCost/)
  })

  it('still finds the cheapest journey when a long step is priced below its distance', () => {
    // A cheap long step lowers the rate the distance guess is priced at. A
    // guess that ignored it would send the search down the short row instead.
    const network = parseTubeMap({
      stations: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 1, y: 0 },
        { id: 'c', x: 2, y: 0 },
        { id: 'far', x: 1, y: 40 },
      ],
      lines: [
        { id: 'row', stations: ['a', 'b', 'c'] },
        { id: 'detour', stations: ['a', 'far', 'c'] },
      ],
      connections: [
        { from: 'a', to: 'far', cost: 0.1 },
        { from: 'far', to: 'c', cost: 0.1 },
      ],
    })

    const journey = findJourney(network, 'a', 'c', { interchangeCost: 0 })

    expect(stationsOf(journey)).toEqual(['a', 'far', 'c'])
    expect(journey?.cost).toBeCloseTo(0.2)
  })

  it('returns null when no route joins the stations', () => {
    const network = parseTubeMap({
      stations: [{ id: 'a' }, { id: 'b' }],
      lines: [{ id: 'red', oneWay: true, stations: ['a', 'b'] }],
    })

    expect(findJourney(network, 'a', 'b')?.cost).toBe(1)
    expect(findJourney(network, 'b', 'a')).toBeNull()
  })

  it('finds journeys just as cheap when station positions steer the search', () => {
    // With positions the search is A*; without them it is Dijkstra's algorithm.
    // A* is only correct while its distance guess never overestimates, so every
    // pair of stations must cost the same both ways.
    const withPositions = parseTubeMap(metro)
    const withoutPositions = parseTubeMap({
      ...metro,
      stations: metro.stations.map(({ id, name }) => ({ id, name })),
    })

    const ids = [...withPositions.stations.keys()]
    for (const from of ids) {
      for (const to of ids) {
        expect(findJourney(withPositions, from, to)?.cost, `${from} to ${to}`).toBe(findJourney(withoutPositions, from, to)?.cost)
      }
    }
  })
})
