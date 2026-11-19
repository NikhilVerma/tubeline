/**
 * The demo page. It shows the two ways of using the library: a map with
 * hand-placed stations, and a plain graph that the library places itself. It
 * also has generated maps: grid cities for seeing how a very large map behaves,
 * and random networks for seeing how well the library places stations. The
 * end-to-end tests drive this page.
 */
import { createTubeMap, type TubeMap, type TubeMapData } from '../src/index.ts'
import { gridCity } from './data/grid-city.ts'
import { randomNetwork } from './data/random-network.ts'
import metro from './data/metro.json' with { type: 'json' }
import workflow from './data/workflow.json' with { type: 'json' }

// The big maps are only built when they are picked.
const datasets: Record<string, () => TubeMapData> = {
  metro: () => metro,
  workflow: () => workflow,
  'grid-1000': () => gridCity(1000),
  'grid-10000': () => gridCity(10000),
  'random-60': () => randomNetwork(60),
  'random-300': () => randomNetwork(300),
  'random-2000': () => randomNetwork(2000),
}

const container = document.querySelector<HTMLElement>('#map')!
const datasetSelect = document.querySelector<HTMLSelectElement>('#dataset')!
const fromSelect = document.querySelector<HTMLSelectElement>('#from')!
const toSelect = document.querySelector<HTMLSelectElement>('#to')!
const timing = document.querySelector<HTMLOutputElement>('#timing')!

let map: TubeMap | undefined

function show(datasetId: string): void {
  map?.destroy()
  const data = datasets[datasetId]!()
  const started = performance.now()
  map = createTubeMap(container, data)
  timing.value = `${data.stations.length.toLocaleString('en')} stations, laid out and drawn in ${Math.round(performance.now() - started)} ms`
  for (const select of [fromSelect, toSelect]) {
    select.replaceChildren(...[...map.network.stations.values()].map((station) => new Option(station.name, station.id)))
  }
  // Keep the form in step with stations picked on the map itself.
  map.on('journey:change', ({ from, to }) => {
    if (from !== undefined) fromSelect.value = from
    if (to !== undefined) toSelect.value = to
  })
}

datasetSelect.addEventListener('change', () => show(datasetSelect.value))
document.querySelector<HTMLFormElement>('#planner')!.addEventListener('submit', (event) => {
  event.preventDefault()
  map?.showJourney(fromSelect.value, toSelect.value)
})

show(datasetSelect.value)
