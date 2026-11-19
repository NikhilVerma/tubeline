/**
 * The JSON a caller writes to describe a map.
 *
 * These types are the library's input format. They stay loose (optional names,
 * optional positions) so a small graph is quick to write by hand.
 * `parseTubeMap` checks the JSON and turns it into a `Network`, which is what
 * the rest of the library reads.
 */

/** Free-form data a caller attaches to a station, line or connection. The map shows it in tooltips and returns it with journeys. */
export type Metadata = Record<string, unknown>

/** The compass sides of a station where its name can be drawn. */
export const LABEL_SIDES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const

export type LabelSide = (typeof LABEL_SIDES)[number]

export interface StationData {
  id: string
  /** Shown on the map. Falls back to the id. */
  name?: string
  /**
   * The station's place on the map grid: `x` grows to the right and `y` grows
   * downwards. Either every station has a position or none does. With none,
   * the map places the stations itself.
   */
  x?: number
  y?: number
  /** Pins the name to one side. Without it the map picks the side with the most room. */
  labelSide?: LabelSide
  /**
   * Where single lines stop, for a station whose lines stop a short way apart
   * and are joined by a walkway. Keyed by line id, on the same grid as `x` and
   * `y`. A line left out stops at the station's own `x` and `y`.
   */
  platforms?: Record<string, { x: number; y: number }>
  metadata?: Metadata
}

export interface LineData {
  id: string
  /** Shown in the key and in journeys. Falls back to the id. */
  name?: string
  /** Any CSS colour. Falls back to a colour from the built-in palette. */
  color?: string
  /** Station ids in travel order. A line that ends on the station it started from is a loop. */
  stations: string[]
  /** Extra stretches of the same line, for a line that forks. Each one shares a station with the line. */
  branches?: string[][]
  /** Limits travel to the order the stations are listed in. Use it when the graph is directed, such as a workflow. */
  oneWay?: boolean
  metadata?: Metadata
}

/**
 * A `ConnectionData` describes travel in one direction between two stations
 * that are next to each other on a line.
 *
 * A line already joins its stations both ways at a cost of 1. A connection
 * changes that for one direction: it gives the direction its own cost or
 * metadata.
 */
export interface ConnectionData {
  from: string
  to: string
  /** Limits the connection to one line. Without it, it applies to every line that joins the two stations. */
  line?: string
  /** What this step adds to a journey's cost. Zero or more. */
  cost?: number
  metadata?: Metadata
}

export interface TubeMapData {
  name?: string
  stations: StationData[]
  lines: LineData[]
  connections?: ConnectionData[]
}
