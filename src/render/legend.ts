import type { Network } from '../model/network.ts'
import { html, swatch } from './dom.ts'

export interface Legend {
  element: HTMLElement
  /** Marks which line is picked out, or none. */
  setFocusedLine(lineId: string | null): void
}

/**
 * The key to the map's lines. Each entry is a toggle button: pressing it
 * picks that line out on the map, and pressing it again shows everything.
 */
export function createLegend(network: Network, onToggle: (lineId: string) => void, signal: AbortSignal): Legend {
  const buttons = new Map<string, HTMLButtonElement>()
  for (const line of network.lines.values()) {
    const button = html('button', { type: 'button', 'data-line': line.id, 'aria-pressed': 'false' }, [swatch(line.color), line.name])
    button.addEventListener('click', () => onToggle(line.id), { signal })
    buttons.set(line.id, button)
  }
  const element = html(
    'ul',
    { class: 'legend', 'aria-label': 'Key to lines' },
    [...buttons.values()].map((button) => html('li', {}, [button])),
  )
  return {
    element,
    setFocusedLine(lineId) {
      for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === lineId))
    },
  }
}
