/**
 * A made-up city for trying the library on a big map. No real network has
 * 10,000 stations, so this one is generated: stations on a grid, joined by
 * horizontal, vertical and diagonal lines.
 */
import type { TubeMapData } from '../../src/index.ts'

/** How many stations a horizontal or vertical line calls at. About what a long metro line has. */
const STOPS_PER_LINE = 25

export function gridCity(stationCount: number): TubeMapData {
  const side = Math.ceil(Math.sqrt(stationCount))
  const idAt = (column: number, row: number) => `s${row * side + column}`
  const exists = ([column, row]: [number, number]) => column >= 0 && column < side && row * side + column < stationCount

  const stations = Array.from({ length: stationCount }, (_, index) => {
    const row = Math.floor(index / side)
    // Every other row is shifted one unit, so vertical lines have to bend.
    return { id: `s${index}`, name: `Station ${index}`, x: (index % side) * 2 + (row % 2), y: row * 2 }
  })

  const lines: TubeMapData['lines'] = []
  const addLine = (cells: [number, number][]) => {
    const stops = cells.filter(exists).map(([column, row]) => idAt(column, row))
    if (stops.length > 1) lines.push({ id: `l${lines.length}`, name: `Line ${lines.length + 1}`, stations: stops })
  }
  const run = (length: number, cellAt: (step: number) => [number, number]) => addLine(Array.from({ length }, (_, step) => cellAt(step)))

  // Lines end on the station the next one starts at, so a journey can change between them.
  for (let row = 0; row < side; row++) {
    for (let start = 0; start < side; start += STOPS_PER_LINE - 1) run(STOPS_PER_LINE, (step) => [start + step, row])
  }
  // Every third column and every seventh diagonal has a line, which leaves some stations on one line only.
  for (let column = 0; column < side; column += 3) {
    for (let start = 0; start < side; start += STOPS_PER_LINE - 1) run(STOPS_PER_LINE, (step) => [column, start + step])
  }
  for (let offset = 0; offset < side; offset += 7) run(side, (step) => [offset + step, step])

  return { name: `Grid city, ${stationCount.toLocaleString('en')} stations`, stations, lines }
}
