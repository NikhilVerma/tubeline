import type { Hop, Network, Point } from '../model/network.ts'
import { MinHeap } from './min-heap.ts'

/** A stretch of a journey that stays on one line. */
export interface JourneyLeg {
  line: string
  /** The steps taken, in order. Each carries its own cost and metadata. */
  hops: Hop[]
}

export interface Journey {
  from: string
  to: string
  /** The cost of every step, plus the interchange cost for each change of line. */
  cost: number
  /** One leg per line used. A journey from a station to itself has none. */
  legs: JourneyLeg[]
}

export interface JourneyOptions {
  /**
   * What changing lines adds to a journey's cost. Raise it to prefer staying
   * on one line, or set it to 0 to count only the steps.
   */
  interchangeCost?: number
}

/** A design choice: a change of line counts as two stops, so a slightly longer direct ride wins over a change. */
export const DEFAULT_INTERCHANGE_COST = 2

/** Where a search has got to: at a station, having arrived on a line. The line matters because leaving on another one costs a change. */
interface Visit {
  station: string
  line: string
  cost: number
  /** The step that got here, and the visit before it. Missing at the start. */
  via: { hop: Hop; previous: Visit } | undefined
}

/**
 * Finds the cheapest journey between two stations, or returns null when the
 * network doesn't join them.
 *
 * It uses A*. When the stations have positions, the straight-line distance to
 * the destination steers the search towards it. Without positions there is
 * nothing to steer by, and the same search behaves as Dijkstra's algorithm.
 * Both find a cheapest journey.
 */
export function findJourney(network: Network, from: string, to: string, options: JourneyOptions = {}): Journey | null {
  for (const id of [from, to]) {
    if (!network.stations.has(id)) throw new Error(`Unknown station "${id}".`)
  }
  if (from === to) return { from, to, cost: 0, legs: [] }

  const interchangeCost = options.interchangeCost ?? DEFAULT_INTERCHANGE_COST
  // A negative cost would let the search loop between two lines for ever, each lap cheaper than the last.
  if (!(Number.isFinite(interchangeCost) && interchangeCost >= 0)) {
    throw new Error(`interchangeCost is ${String(interchangeCost)}. It must be a number, zero or more.`)
  }
  const estimateToGoal = remainingCostEstimate(network, to)

  const cheapest = new Map<string, number>()
  const queue = new MinHeap<Visit>()
  // The journey may start on any line at the origin, with no change to pay for.
  for (const line of network.stations.get(from)!.lines) {
    queue.push({ station: from, line, cost: 0, via: undefined }, estimateToGoal(from))
  }

  for (let visit = queue.pop(); visit !== undefined; visit = queue.pop()) {
    if (visit.station === to) return toJourney(from, to, visit)

    // A visit already reached more cheaply was queued before the cheaper way was found.
    const key = JSON.stringify([visit.station, visit.line])
    if ((cheapest.get(key) ?? Infinity) < visit.cost) continue

    for (const hop of network.hopsFrom.get(visit.station) ?? []) {
      const cost = visit.cost + hop.cost + (hop.line === visit.line ? 0 : interchangeCost)
      const nextKey = JSON.stringify([hop.to, hop.line])
      if (cost >= (cheapest.get(nextKey) ?? Infinity)) continue
      cheapest.set(nextKey, cost)
      queue.push({ station: hop.to, line: hop.line, cost, via: { hop, previous: visit } }, cost + estimateToGoal(hop.to))
    }
  }
  return null
}

/**
 * A* needs a guess of the cost still to pay from a station, and the guess must
 * never be too high or the search can miss the cheapest journey.
 *
 * Costs are not distances, so this finds the cheapest any step is per unit of
 * distance and prices the straight line to the destination at that rate. No
 * real journey can beat it. The guess is 0 when a station has no position.
 */
function remainingCostEstimate(network: Network, to: string): (station: string) => number {
  const positions = new Map<string, Point>()
  for (const station of network.stations.values()) {
    if (station.position === undefined) return () => 0
    positions.set(station.id, station.position)
  }
  const distance = (a: string, b: string) => {
    const from = positions.get(a)!
    const target = positions.get(b)!
    return Math.hypot(target.x - from.x, target.y - from.y)
  }

  let cheapestRate = Infinity
  for (const hops of network.hopsFrom.values()) {
    for (const hop of hops) cheapestRate = Math.min(cheapestRate, hop.cost / distance(hop.from, hop.to))
  }
  if (!Number.isFinite(cheapestRate)) return () => 0
  return (station) => cheapestRate * distance(station, to)
}

/** Walks back from the destination to the start, then groups the steps into one leg per line. */
function toJourney(from: string, to: string, last: Visit): Journey {
  const hops: Hop[] = []
  for (let visit = last; visit.via !== undefined; visit = visit.via.previous) hops.unshift(visit.via.hop)

  const legs: JourneyLeg[] = []
  for (const hop of hops) {
    const leg = legs.at(-1)
    if (leg?.line === hop.line) leg.hops.push(hop)
    else legs.push({ line: hop.line, hops: [hop] })
  }
  return { from, to, cost: last.cost, legs }
}
