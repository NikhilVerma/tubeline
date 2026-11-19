import { layoutNetwork } from './layout/layout.ts'
import { parseTubeMap, type Line, type Network, type Station } from './model/network.ts'
import type { TubeMapData } from './model/types.ts'
import { drawMap, segmentKey } from './render/draw-map.ts'
import { html } from './render/dom.ts'
import { createJourneyPanel, type JourneySelection } from './render/journey-panel.ts'
import { createLegend } from './render/legend.ts'
import { attachPanZoom, type WheelZoom } from './render/pan-zoom.ts'
import { STYLES } from './render/styles.ts'
import { attachViewCulling } from './render/view-culling.ts'
import { createTooltip, segmentTooltip, stationTooltip, TOOLTIP_ID } from './render/tooltip.ts'
import { findJourney, type Journey, type JourneyOptions } from './routing/find-journey.ts'

export interface TubeMapOptions extends JourneyOptions {
  /** Set to false to hide the key to the lines. */
  legend?: boolean
  /** Set to false to hide the panel that lists the planned journey. */
  journeyPanel?: boolean
  /** When the mouse wheel zooms the map: `always` (the default), or `with-modifier-key` to leave a plain scroll to the page. */
  wheelZoom?: WheelZoom
}

/**
 * Showing a journey fades every other station and piece of track. A browser
 * runs each fade on its own, and the time grows faster than the map: measured
 * in Chromium, 0.1 seconds at 1,000 stations and 17 seconds at 10,000. A map
 * with more stations than this changes at once instead.
 */
const MOST_STATIONS_TO_FADE = 1000

/** What a map reports, and the detail passed to listeners. */
export interface TubeMapEvents {
  /** A station was clicked, or pressed with the keyboard. */
  'station:select': { station: Station }
  /** The journey's start, destination or route changed. */
  'journey:change': JourneySelection
  /** A line was picked out from the key, or the pick was undone (null). */
  'line:focus': { line: Line | null }
}

export interface TubeMap {
  /** The checked form of the JSON the map was made from. */
  readonly network: Network
  /**
   * `showJourney` plans the journey between two stations, draws the journey on
   * the map and returns the journey. `showJourney` returns null when no route
   * joins the stations. An unknown station id makes `showJourney` throw.
   */
  showJourney(from: string, to: string): Journey | null
  clearJourney(): void
  /** `focusLine` picks one line out and fades the rest. Null shows every line again. */
  focusLine(lineId: string | null): void
  /** `resetView` goes back to the view that fits the whole map. */
  resetView(): void
  /** `on` listens for an event. It returns a function that stops listening. */
  on<K extends keyof TubeMapEvents>(type: K, listener: (detail: TubeMapEvents[K]) => void): () => void
  /** `destroy` takes the map off the page and drops its listeners. */
  destroy(): void
}

/**
 * `createTubeMap` draws an interactive tube map of `data` inside `container`.
 * It returns a handle for driving the map from code.
 *
 * People can pan and zoom, and hover a station or a piece of track to read
 * its details. They can pick a line out from the key, and plan a journey by
 * selecting two stations.
 *
 * The container sets the size, and the map fills it.
 *
 * It throws a `TubeMapDataError` when the data can't be used.
 */
export function createTubeMap(container: HTMLElement, data: TubeMapData, options: TubeMapOptions = {}): TubeMap {
  const network = parseTubeMap(data)
  const layout = layoutNetwork(network)
  const drawn = drawMap(network, layout)

  // One controller ends every listener the map adds, so destroy() can't miss any.
  const lifetime = new AbortController()
  const { signal } = lifetime

  const listeners: { [K in keyof TubeMapEvents]: Set<(detail: TubeMapEvents[K]) => void> } = {
    'station:select': new Set(),
    'journey:change': new Set(),
    'line:focus': new Set(),
  }
  const emit = <K extends keyof TubeMapEvents>(type: K, detail: TubeMapEvents[K]) => {
    for (const listener of listeners[type]) listener(detail)
  }

  // The map lives in a shadow root, which keeps its styles and the page's apart.
  const host = html('div', { class: 'tubeline-host' })
  const shadow = host.attachShadow({ mode: 'open' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(STYLES)
  shadow.adoptedStyleSheets = [sheet]

  const tooltip = createTooltip()
  const culling = attachViewCulling(drawn.svg, drawn.pieces, signal)
  const panZoom = attachPanZoom(drawn.svg, layout.bounds, signal, {
    wheelZoom: options.wheelZoom ?? 'always',
    onViewChange: culling.refresh,
  })
  // The stage holds the map and what floats over it. The sidebar holds the journey and the key.
  const stage = html('div', { class: 'stage' }, [drawn.svg, tooltip.element])
  const sidebar = html('aside', { class: 'sidebar' })
  const root = html('div', { class: 'tubeline' }, [stage])
  if (network.stations.size > MOST_STATIONS_TO_FADE) root.classList.add('no-fade')
  shadow.append(root)

  const controls = (
    [
      ['Zoom in', '+', panZoom.zoomIn],
      ['Zoom out', '−', panZoom.zoomOut],
      ['Reset view', '⟲', panZoom.reset],
    ] as const
  ).map(([label, symbol, action]) => {
    const button = html('button', { type: 'button', 'aria-label': label, title: label }, [symbol])
    button.addEventListener('click', action, { signal })
    return button
  })
  stage.append(html('div', { class: 'panel controls' }, controls))

  // The key picks one line out at a time.
  let focusedLine: string | null = null
  const focusLine = (lineId: string | null) => {
    if (lineId !== null && !network.lines.has(lineId)) throw new Error(`Unknown line "${lineId}".`)
    focusedLine = lineId
    root.classList.toggle('has-line-focus', lineId !== null)
    for (const [id, group] of drawn.lines) group.classList.toggle('is-focused', id === lineId)
    for (const [id, group] of drawn.stations) {
      group.classList.toggle('on-focused-line', lineId !== null && network.stations.get(id)!.lines.includes(lineId))
    }
    legend?.setFocusedLine(lineId)
    emit('line:focus', { line: lineId === null ? null : network.lines.get(lineId)! })
  }
  const legend =
    options.legend === false ? undefined : createLegend(network, (lineId) => focusLine(focusedLine === lineId ? null : lineId), signal)

  // The journey planner keeps the chosen start and destination, and the route found between them.
  let selection: JourneySelection = { from: undefined, to: undefined, journey: null }
  const journeyPanel = options.journeyPanel === false ? undefined : createJourneyPanel(network, () => setJourneyEnds(undefined, undefined), signal)
  if (journeyPanel) sidebar.append(journeyPanel.element)
  if (legend) sidebar.append(legend.element)
  // The sidebar goes first so Tab reaches the planner and the key before the stations.
  if (sidebar.childElementCount > 0) {
    root.prepend(sidebar)
    // Without this the map would be squeezed into the sidebar's column when both panels are turned off.
    root.classList.add('has-sidebar')
  }

  /** `setJourneyEnds` sets the journey's ends and finds the route when both are known. It then redraws everything that shows the journey. */
  const setJourneyEnds = (from: string | undefined, to: string | undefined): Journey | null => {
    const journey = from !== undefined && to !== undefined ? findJourney(network, from, to, options) : null
    selection = { from, to, journey }

    const onJourney = new Set<string>()
    const journeySegments = new Set<string>()
    for (const hop of journey?.legs.flatMap((leg) => leg.hops) ?? []) {
      onJourney.add(hop.from).add(hop.to)
      journeySegments.add(segmentKey(hop.line, hop.from, hop.to))
    }
    root.classList.toggle('has-journey', journey !== null && journey.legs.length > 0)
    for (const [key, piece] of drawn.segments) piece.classList.toggle('on-journey', journeySegments.has(key))
    for (const [id, group] of drawn.stations) {
      group.classList.toggle('on-journey', onJourney.has(id))
      group.classList.toggle('is-origin', id === from)
      group.classList.toggle('is-destination', id === to)
    }
    journeyPanel?.update(selection)
    emit('journey:change', selection)
    return journey
  }

  // Selecting a station plans a journey. Hovering or focusing one shows its details.
  for (const [id, group] of drawn.stations) {
    const station = network.stations.get(id)!
    const pickStation = () => {
      emit('station:select', { station })
      // The first pick is the start and the second is the destination. A third starts again.
      if (selection.from === undefined || selection.to !== undefined) setJourneyEnds(id, undefined)
      // Picking the start again takes the pick back, as a journey to the same station says nothing.
      else if (selection.from === id) setJourneyEnds(undefined, undefined)
      else setJourneyEnds(selection.from, id)
    }
    const showTooltip = () => {
      const marker = group.querySelector('.halo')!.getBoundingClientRect()
      const frame = stage.getBoundingClientRect()
      tooltip.show(stationTooltip(network, station), { x: marker.left + marker.width / 2 - frame.left, y: marker.top - frame.top + 8 })
      group.setAttribute('aria-describedby', TOOLTIP_ID)
    }
    const hideTooltip = () => {
      tooltip.hide()
      group.removeAttribute('aria-describedby')
    }
    group.addEventListener('click', pickStation, { signal })
    group.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        pickStation()
      },
      { signal },
    )
    group.addEventListener('pointerenter', showTooltip, { signal })
    group.addEventListener('focus', showTooltip, { signal })
    group.addEventListener('pointerleave', hideTooltip, { signal })
    group.addEventListener('blur', hideTooltip, { signal })
  }

  // Hovering a piece of track shows the line's details and the connection's.
  for (const [lineId, group] of drawn.lines) {
    const line = network.lines.get(lineId)!
    group.addEventListener(
      'pointermove',
      (event) => {
        const { from, to } = (event.target as SVGElement).closest<SVGElement>('.segment')?.dataset ?? {}
        if (from === undefined || to === undefined) return
        const frame = stage.getBoundingClientRect()
        tooltip.show(segmentTooltip(network, line, from, to), { x: event.clientX - frame.left, y: event.clientY - frame.top })
      },
      { signal },
    )
    group.addEventListener('pointerleave', () => tooltip.hide(), { signal })
  }

  root.addEventListener(
    'keydown',
    (event) => {
      // With nothing chosen there is nothing to clear, so listeners hear no change.
      if (event.key === 'Escape' && selection.from !== undefined) setJourneyEnds(undefined, undefined)
    },
    { signal },
  )

  container.append(host)

  return {
    network,
    showJourney(from, to) {
      return setJourneyEnds(from, to)
    },
    clearJourney() {
      setJourneyEnds(undefined, undefined)
    },
    focusLine,
    resetView: panZoom.reset,
    on(type, listener) {
      listeners[type].add(listener)
      return () => listeners[type].delete(listener)
    },
    destroy() {
      lifetime.abort()
      host.remove()
      // A caller may still hold the map, and nothing it does afterwards should reach the old subscribers.
      for (const subscribers of Object.values(listeners)) subscribers.clear()
    },
  }
}
