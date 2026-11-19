---
name: tubeline
description: Draw a graph as an interactive tube map with @nikhilverma/tubeline, and plan cheapest routes across it. Use when asked to visualise a workflow, state machine, pipeline, service map or transit network as a tube/metro/subway map, when a graph has a few named paths people follow end to end, or when editing or debugging code that calls createTubeMap, parseTubeMap or findJourney.
license: MIT
---

# tubeline

tubeline renders a graph as a tube map: nodes are stations, named paths are lines, a node on
several paths is an interchange. Browser, SVG, zero dependencies, ESM only.

**The whole model, one sentence:** you describe stations and the lines through them as JSON;
tubeline lays them out on an eight-direction grid, draws them, and plans journeys with A*.

## Reach for it when

- The graph has a handful of named paths (happy path, retry path, refund path).
- A reader should be able to trace a path and see where paths meet.
- You want route planning between two nodes for free.

Do not reach for it for graphs far beyond 10,000 nodes (10,000 draws in under a second and pans at about 40 fps zoomed out), graphs with no paths (use a general
graph library), or diagrams people must edit by dragging.

## Set it up

Match the repository's package manager.

```bash
npm install @nikhilverma/tubeline
```

```ts
import { createTubeMap } from '@nikhilverma/tubeline'

const map = createTubeMap(document.querySelector('#map')!, {
  name: 'Order workflow',
  stations: [
    { id: 'cart', name: 'Cart' },
    { id: 'checkout', name: 'Checkout' },
    { id: 'paid', name: 'Paid', metadata: { owner: 'billing' } },
    { id: 'cancelled', name: 'Cancelled' },
  ],
  lines: [
    { id: 'happy', name: 'Happy path', color: '#dc241f', stations: ['cart', 'checkout', 'paid'], oneWay: true },
    { id: 'cancel', name: 'Cancellation', stations: ['checkout', 'cancelled'], oneWay: true },
  ],
})
```

Give the container a height. The map fills it; with no height the map is 320px tall.

## Data rules

```ts
interface TubeMapData {
  name?: string                 // read out to screen readers
  stations: StationData[]
  lines: LineData[]
  connections?: ConnectionData[]
}
interface StationData {
  id: string                    // unique, non-empty
  name?: string                 // falls back to id
  x?: number; y?: number        // grid position, y grows downwards
  labelSide?: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
  platforms?: Record<string, { x: number; y: number }>  // per-line stop, keyed by line id
  metadata?: Record<string, unknown>                     // shown in the tooltip
}
interface LineData {
  id: string
  name?: string
  color?: string                // any CSS colour; a palette is used otherwise
  stations: string[]            // station ids in order; repeat the first id last for a loop
  branches?: string[][]         // extra stretches; each shares a station with the line
  oneWay?: boolean              // directed: travel only in listed order
  metadata?: Record<string, unknown>
}
interface ConnectionData {      // overrides ONE direction of ONE step between neighbours
  from: string; to: string
  line?: string                 // omit to apply to every line joining the two
  cost?: number                 // default 1, must be >= 0
  metadata?: Record<string, unknown>
}
```

- Positions are all-or-nothing: give `x` and `y` on every station, or on none.
- Two stations may not share a position. Every station must be on a line.
- With positions, keep neighbours horizontal, vertical or at 45° for straight track. Other
  offsets get one bend. Space neighbours 2 grid units apart so names fit.
- Without positions the layout is a heuristic. Fine for under ~20 stations. Lines may cross.
- A directed graph: set `oneWay: true` on each line. An edge in both directions with different
  weights: leave `oneWay` off and add one `connections` entry per direction.
- `platforms` needs the station to have `x` and `y`, and the line must call at the station.

## API

```ts
createTubeMap(container: HTMLElement, data: TubeMapData, options?): TubeMap
// options: { interchangeCost?: number (default 2), legend?: boolean, journeyPanel?: boolean,
//            wheelZoom?: 'always' (default) | 'with-modifier-key' }
// wheelZoom 'with-modifier-key': use when the map sits in a scrolling page; plain wheel scrolls the page, Ctrl/Cmd+wheel zooms.
// Off-view stations are removed from the DOM and names hide when under 5px on screen; query `map.network`, not the DOM, for data.

map.showJourney(from, to): Journey | null   // null = no route; throws on unknown id
map.clearJourney()
map.focusLine(lineId | null)
map.resetView()
map.on('station:select' | 'journey:change' | 'line:focus', listener): () => void  // returns unsubscribe
map.destroy()
map.network                                  // the checked data

parseTubeMap(json): Network                  // throws TubeMapDataError; .issues lists every problem
findJourney(network, from, to, { interchangeCost? }): Journey | null
// Journey: { from, to, cost, legs: [{ line, hops: [{ from, to, line, cost, metadata }] }] }
```

`parseTubeMap` and `findJourney` do not touch the DOM. Use them in Node, in tests and on a
server. `createTubeMap` needs a browser.

Journey cost = sum of hop costs + `interchangeCost` per change of line.

## Common mistakes

- **The map is a short 320px strip.** The container has no height.
- **Updating a map.** There is no update call. `map.destroy()`, then `createTubeMap` again.
- **React.** Create the map in a ref callback or an effect tied to the container, and call
  `destroy()` on cleanup. Do not create it during render.
- **Server rendering.** Import is safe on the server; calling `createTubeMap` is not.
- **Styling from the page.** The map is in a shadow root. Page CSS does not reach it. Theme it
  with custom properties on the container: `--tubeline-background`, `--tubeline-ink`,
  `--tubeline-accent`, `--tubeline-panel-background`, `--tubeline-font`.
- **CommonJS.** The package is ESM only. Use `import`, or `await import()` from CommonJS.
- **Catching bad data.** Catch `TubeMapDataError` and read `error.issues`; fix all of them in
  one pass rather than one per run.

## Check your work

Call `parseTubeMap(data)` in a unit test: it validates the whole graph without a browser. For
a routing rule that matters, assert `findJourney(...).cost` and the lines of its legs.
