import { LABEL_SIDES, type LabelSide, type Metadata, type TubeMapData } from './types.ts'

export interface Point {
  x: number
  y: number
}

export interface Station {
  id: string
  name: string
  /** In grid units. Missing when the JSON gave no positions, in which case the layout places the station. */
  position: Point | undefined
  /** The side the JSON pinned the name to, when it pinned one. */
  labelSide: LabelSide | undefined
  /** Where a line stops when that is not the station's own position, by line id and in grid units. */
  platforms: Map<string, Point>
  metadata: Metadata
  /** Ids of the lines that call here, in the order the lines were given. */
  lines: string[]
}

export interface Line {
  id: string
  name: string
  color: string
  /** True when journeys can only travel the line in the order its stations are listed. */
  oneWay: boolean
  /** Every stretch of the line as station ids: the main one first, then its branches. */
  runs: string[][]
  metadata: Metadata
}

/** One step a journey can take: from a station to the next one along a line, in that direction. */
export interface Hop {
  from: string
  to: string
  line: string
  cost: number
  metadata: Metadata
}

/**
 * A `Network` is a map's JSON after it has been checked and filled in.
 *
 * People write the JSON, so it leaves things out and can be wrong. Routing,
 * layout and rendering read a `Network` instead. None of them then has to
 * handle a missing name or an unknown station id.
 */
export interface Network {
  name: string
  stations: Map<string, Station>
  lines: Map<string, Line>
  /** The steps that leave each station. Closed directions are left out. */
  hopsFrom: Map<string, Hop[]>
}

/** Thrown when a map's JSON can't be used. `issues` lists every problem found, so they can be fixed in one pass. */
export class TubeMapDataError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`Invalid tube map data:\n- ${issues.join('\n- ')}`)
    this.name = 'TubeMapDataError'
    this.issues = issues
  }
}

/** Colours for lines that don't name one. A design choice: ten hues that stay distinct on white. */
const LINE_PALETTE = [
  '#d22630',
  '#0057b8',
  '#00843d',
  '#f2a900',
  '#7b3fa0',
  '#00a3ad',
  '#e56db1',
  '#8a5a2b',
  '#6c7a89',
  '#111111',
] as const

/** A step costs 1 unless a connection says otherwise, so a journey's cost defaults to its number of stops. */
const DEFAULT_HOP_COST = 1

/**
 * A map's JSON often comes from a file or an API, where TypeScript can't vouch
 * for it. `parseTubeMap` checks it at runtime and returns the `Network` the
 * rest of the library works from.
 *
 * It throws a `TubeMapDataError` listing every problem, rather than stopping
 * at the first.
 */
export function parseTubeMap(input: unknown): Network {
  const issues: string[] = []
  if (!isRecord(input) || !Array.isArray(input.stations) || !Array.isArray(input.lines)) {
    throw new TubeMapDataError(['The map must be an object with a "stations" array and a "lines" array.'])
  }
  const data = input as unknown as TubeMapData

  const stations = readStations(data, issues)
  const lines = readLines(data, stations, issues)
  for (const station of stations.values()) {
    if (station.lines.length === 0) issues.push(`Station "${station.id}" is not on any line.`)
    for (const lineId of station.platforms.keys()) {
      if (!station.lines.includes(lineId)) issues.push(`Station "${station.id}" has a platform for line "${lineId}", which doesn't call there.`)
    }
  }
  // Track between two stops in the same place has no direction, so it can't be drawn.
  const stopAt = (stationId: string, lineId: string) => stations.get(stationId)?.platforms.get(lineId) ?? stations.get(stationId)?.position
  for (const line of lines.values()) {
    for (const run of line.runs) {
      for (let i = 1; i < run.length; i++) {
        const from = stopAt(run[i - 1]!, line.id)
        const to = stopAt(run[i]!, line.id)
        if (from !== undefined && to !== undefined && from.x === to.x && from.y === to.y) {
          issues.push(`Line "${line.id}" stops at "${run[i - 1]}" and "${run[i]}" in the same place, ${from.x},${from.y}. Move one of the platforms.`)
        }
      }
    }
  }
  const hopsFrom = readHops(data, stations, lines, issues)
  const name = optional(data.name, 'string', 'The map name', issues) ?? 'Tube map'

  if (issues.length > 0) throw new TubeMapDataError(issues)
  return { name, stations, lines, hopsFrom }
}

function readStations(data: TubeMapData, issues: string[]): Map<string, Station> {
  const stations = new Map<string, Station>()
  const takenPositions = new Map<string, string>()
  let positioned = 0

  for (const [index, raw] of data.stations.entries()) {
    if (!isRecord(raw) || !isId(raw.id)) {
      issues.push(`stations[${index}] needs a non-empty string "id".`)
      continue
    }
    if (stations.has(raw.id)) {
      issues.push(`Station id "${raw.id}" is used more than once.`)
      continue
    }
    const where = `Station "${raw.id}"`
    if (raw.labelSide !== undefined && !LABEL_SIDES.includes(raw.labelSide)) {
      issues.push(`${where} has labelSide ${JSON.stringify(raw.labelSide)}. Use one of ${LABEL_SIDES.join(', ')}.`)
    }

    let position: Point | undefined
    if (raw.x !== undefined || raw.y !== undefined) {
      if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
        position = { x: raw.x as number, y: raw.y as number }
        positioned += 1
        const key = `${position.x},${position.y}`
        const other = takenPositions.get(key)
        if (other !== undefined) issues.push(`Stations "${other}" and "${raw.id}" share the position ${key}.`)
        takenPositions.set(key, raw.id)
      } else {
        issues.push(`Station "${raw.id}" needs both "x" and "y" as numbers, or neither.`)
      }
    }

    stations.set(raw.id, {
      id: raw.id,
      name: optional(raw.name, 'string', `${where} name`, issues) ?? raw.id,
      position,
      labelSide: raw.labelSide,
      platforms: readPlatforms(raw.platforms, position, where, issues),
      metadata: optionalMetadata(raw.metadata, where, issues),
      lines: [],
    })
  }

  if (stations.size === 0) issues.push('The map needs at least one station.')
  if (positioned > 0 && positioned < stations.size) {
    issues.push('Give every station an "x" and "y", or none of them. A mix can\'t be laid out.')
  }
  return stations
}

function readPlatforms(raw: unknown, position: Point | undefined, where: string, issues: string[]): Map<string, Point> {
  const platforms = new Map<string, Point>()
  if (raw === undefined) return platforms
  if (!isRecord(raw)) {
    issues.push(`${where} platforms must be an object keyed by line id.`)
    return platforms
  }
  // A platform is placed relative to the station, so a station the map places itself can't have one.
  if (position === undefined) issues.push(`${where} needs an "x" and "y" to have platforms.`)
  for (const [lineId, at] of Object.entries(raw)) {
    if (isRecord(at) && Number.isFinite(at.x) && Number.isFinite(at.y)) platforms.set(lineId, { x: at.x as number, y: at.y as number })
    else issues.push(`${where} platform "${lineId}" needs "x" and "y" as numbers.`)
  }
  return platforms
}

function readLines(data: TubeMapData, stations: Map<string, Station>, issues: string[]): Map<string, Line> {
  const lines = new Map<string, Line>()

  for (const [index, raw] of data.lines.entries()) {
    if (!isRecord(raw) || !isId(raw.id)) {
      issues.push(`lines[${index}] needs a non-empty string "id".`)
      continue
    }
    if (lines.has(raw.id)) {
      issues.push(`Line id "${raw.id}" is used more than once.`)
      continue
    }

    const where = `Line "${raw.id}"`
    if (raw.branches !== undefined && !Array.isArray(raw.branches)) issues.push(`${where} branches must be an array of station lists.`)
    const branches = Array.isArray(raw.branches) ? raw.branches : []

    const runs: string[][] = []
    for (const [runIndex, run] of [raw.stations, ...branches].entries()) {
      const runName = runIndex === 0 ? where : `${where} branch ${runIndex}`
      if (!Array.isArray(run) || run.length < 2) {
        issues.push(`${runName} needs at least two stations.`)
        continue
      }
      for (const [stopIndex, stationId] of run.entries()) {
        if (!stations.has(stationId)) issues.push(`${runName} calls at unknown station "${stationId}".`)
        if (stationId === run[stopIndex - 1]) issues.push(`${runName} lists "${stationId}" twice in a row.`)
      }
      // A branch that touches no earlier stretch would be a second, separate line under the same name.
      if (runIndex > 0 && !run.some((stationId) => runs.flat().includes(stationId))) {
        issues.push(`${runName} doesn't share a station with the rest of the line.`)
      }
      runs.push(run)
    }

    for (const stationId of new Set(runs.flat())) stations.get(stationId)?.lines.push(raw.id)
    lines.set(raw.id, {
      id: raw.id,
      name: optional(raw.name, 'string', `${where} name`, issues) ?? raw.id,
      color: optional(raw.color, 'string', `${where} color`, issues) ?? LINE_PALETTE[lines.size % LINE_PALETTE.length]!,
      oneWay: optional(raw.oneWay, 'boolean', `${where} oneWay`, issues) ?? false,
      runs,
      metadata: optionalMetadata(raw.metadata, where, issues),
    })
  }

  if (lines.size === 0) issues.push('The map needs at least one line.')
  return lines
}

/**
 * Builds the steps journeys can take. Every pair of neighbouring stations on a
 * line gives one step each way, or only forwards on a one-way line. The JSON's
 * connections then adjust or close single directions.
 */
function readHops(
  data: TubeMapData,
  stations: Map<string, Station>,
  lines: Map<string, Line>,
  issues: string[],
): Map<string, Hop[]> {
  // Keyed by line, then "from" station, then "to" station, so a branch that
  // repeats part of the main stretch doesn't add the same step twice.
  const hops = new Map<string, Map<string, Map<string, Hop>>>()
  const addHop = (line: string, from: string, to: string) => {
    const fromLine = hops.get(line) ?? new Map<string, Map<string, Hop>>()
    hops.set(line, fromLine)
    const fromStation = fromLine.get(from) ?? new Map<string, Hop>()
    fromLine.set(from, fromStation)
    if (!fromStation.has(to)) fromStation.set(to, { from, to, line, cost: DEFAULT_HOP_COST, metadata: {} })
  }
  for (const line of lines.values()) {
    for (const run of line.runs) {
      for (let i = 1; i < run.length; i++) {
        addHop(line.id, run[i - 1]!, run[i]!)
        if (!line.oneWay) addHop(line.id, run[i]!, run[i - 1]!)
      }
    }
  }

  const closed = new Set<Hop>()
  if (data.connections !== undefined && !Array.isArray(data.connections)) issues.push('"connections" must be an array.')
  for (const [index, raw] of (Array.isArray(data.connections) ? data.connections : []).entries()) {
    if (!isRecord(raw) || !isId(raw.from) || !isId(raw.to)) {
      issues.push(`connections[${index}] needs "from" and "to" station ids.`)
      continue
    }
    if (raw.cost !== undefined && !(Number.isFinite(raw.cost) && raw.cost >= 0)) {
      issues.push(`connections[${index}] has cost ${String(raw.cost)}. A cost is a number, zero or more.`)
      continue
    }
    const lineIds = raw.line === undefined ? [...hops.keys()] : [raw.line]
    const matches = lineIds.filter((lineId) => hops.get(lineId)?.get(raw.from)?.has(raw.to))
    if (matches.length === 0) {
      const where = raw.line === undefined ? 'any line' : `line "${raw.line}"`
      issues.push(`connections[${index}]: "${raw.from}" and "${raw.to}" are not next to each other on ${where}.`)
    }
    const where = `connections[${index}]`
    const isClosed = optional(raw.closed, 'boolean', `${where} closed`, issues) ?? false
    const metadata = raw.metadata === undefined ? undefined : optionalMetadata(raw.metadata, where, issues)
    for (const lineId of matches) {
      const hop = hops.get(lineId)!.get(raw.from)!.get(raw.to)!
      // A closed step stays in the table until every connection is read, so a later connection can still find it.
      if (isClosed) closed.add(hop)
      if (raw.cost !== undefined) hop.cost = raw.cost
      if (metadata !== undefined) hop.metadata = metadata
    }
  }

  const hopsFrom = new Map<string, Hop[]>()
  for (const stationId of stations.keys()) hopsFrom.set(stationId, [])
  for (const fromLine of hops.values()) {
    for (const [from, fromStation] of fromLine) {
      hopsFrom.get(from)?.push(...[...fromStation.values()].filter((hop) => !closed.has(hop)))
    }
  }
  return hopsFrom
}

/**
 * The JSON's optional fields are easy to get subtly wrong, such as `oneWay:
 * "true"`. Falling back to the default would hide that, so `optional` reports
 * a value of the wrong type and returns undefined for it.
 */
function optional(value: unknown, type: 'string', what: string, issues: string[]): string | undefined
function optional(value: unknown, type: 'boolean', what: string, issues: string[]): boolean | undefined
function optional(value: unknown, type: 'string' | 'boolean', what: string, issues: string[]): string | boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === type) return value as string | boolean
  issues.push(`${what} must be a ${type}.`)
  return undefined
}

function optionalMetadata(value: unknown, where: string, issues: string[]): Metadata {
  if (value === undefined) return {}
  if (isRecord(value)) return value
  issues.push(`${where} metadata must be an object.`)
  return {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
