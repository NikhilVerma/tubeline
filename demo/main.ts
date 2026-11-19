/**
 * The demo page. It shows the two ways of using the library: a map with
 * hand-placed stations, and a plain graph that the library places itself. The
 * end-to-end tests drive this page.
 */
import { createTubeMap, type TubeMap, type TubeMapData } from '../src/index.ts'
import metro from './data/metro.json' with { type: 'json' }
import workflow from './data/workflow.json' with { type: 'json' }

const datasets: Record<string, TubeMapData> = { metro, workflow }

const container = document.querySelector<HTMLElement>('#map')!
const datasetSelect = document.querySelector<HTMLSelectElement>('#dataset')!
const fromSelect = document.querySelector<HTMLSelectElement>('#from')!
const toSelect = document.querySelector<HTMLSelectElement>('#to')!

let map: TubeMap | undefined

function show(datasetId: string): void {
  map?.destroy()
  map = createTubeMap(container, datasets[datasetId]!)
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
