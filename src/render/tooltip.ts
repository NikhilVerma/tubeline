import type { Line, Network, Station } from '../model/network.ts'
import type { Metadata } from '../model/types.ts'
import { html, swatch } from './dom.ts'

export interface Tooltip {
  element: HTMLElement
  /** `show` puts `content` above a point, given in pixels from the map's top-left corner. */
  show(content: Node[], at: { x: number; y: number }): void
  hide(): void
}

/** The id stations point at with `aria-describedby`, so a screen reader reads the tooltip with the station. */
export const TOOLTIP_ID = 'tubeline-tooltip'

/** The space between a tooltip and the point it describes. The stylesheet shifts the tooltip by the same amount. */
export const TOOLTIP_GAP = 14

export function createTooltip(): Tooltip {
  const element = html('div', { class: 'tooltip', role: 'tooltip', id: TOOLTIP_ID, hidden: '' })
  return {
    element,
    show(content, at) {
      element.replaceChildren(...content)
      element.style.left = `${at.x}px`
      element.style.top = `${at.y}px`
      element.hidden = false
      // The tooltip sits above its point, and drops below when the top of the map would cut it off.
      element.classList.toggle('is-below', at.y < element.offsetHeight + TOOLTIP_GAP)
    },
    hide() {
      element.hidden = true
    },
  }
}

/** `stationTooltip` builds a station's tooltip: its name, the lines that call there, and its metadata. */
export function stationTooltip(network: Network, station: Station): Node[] {
  const lines = station.lines.map((lineId) => {
    const line = network.lines.get(lineId)!
    return html('li', {}, [swatch(line.color), line.name])
  })
  return [html('strong', {}, [station.name]), html('ul', {}, lines), ...metadataList(station.metadata)]
}

/**
 * `segmentTooltip` builds the tooltip for a piece of a line between two
 * stations. It shows the line and its metadata, then the metadata of each
 * direction of travel that has any.
 */
export function segmentTooltip(network: Network, line: Line, from: string, to: string): Node[] {
  const content: Node[] = [html('strong', {}, [line.name]), ...metadataList(line.metadata)]
  for (const [start, end] of [
    [from, to],
    [to, from],
  ] as const) {
    const hop = network.hopsFrom.get(start)?.find((candidate) => candidate.to === end && candidate.line === line.id)
    if (hop === undefined || Object.keys(hop.metadata).length === 0) continue
    const title = `${network.stations.get(start)!.name} → ${network.stations.get(end)!.name}`
    content.push(html('div', { class: 'direction' }, [title]), ...metadataList(hop.metadata))
  }
  return content
}

function metadataList(metadata: Metadata): HTMLElement[] {
  const entries = Object.entries(metadata)
  if (entries.length === 0) return []
  return [
    html(
      'dl',
      {},
      entries.flatMap(([key, value]) => [
        html('dt', {}, [key]),
        // Metadata is free-form, so anything that isn't plain text is shown as JSON.
        html('dd', {}, [typeof value === 'string' ? value : JSON.stringify(value)]),
      ]),
    ),
  ]
}
