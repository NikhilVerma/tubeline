import type { Network } from '../model/network.ts'
import type { Journey } from '../routing/find-journey.ts'
import { html, swatch } from './dom.ts'

/** What the journey planner is showing: nothing yet, a chosen start, or a start and destination with the journey found between them. */
export interface JourneySelection {
  from: string | undefined
  to: string | undefined
  /** The route between the two ends. Null while an end is still to be chosen, and when no route joins them. */
  journey: Journey | null
}

export interface JourneyPanel {
  element: HTMLElement
  update(selection: JourneySelection): void
}

/**
 * The journey panel asks the person for a start station and then a
 * destination. When both are chosen, the panel lists each line the journey
 * rides, in order.
 *
 * It is a live region, so a screen reader announces each change.
 */
export function createJourneyPanel(network: Network, onClear: () => void, signal: AbortSignal): JourneyPanel {
  const element = html('section', { class: 'journey', 'aria-live': 'polite', 'aria-label': 'Journey planner' })
  const nameOf = (stationId: string) => network.stations.get(stationId)!.name

  const clearButton = () => {
    const button = html('button', { type: 'button', class: 'clear' }, ['Clear'])
    button.addEventListener('click', onClear, { signal })
    return button
  }

  const update = ({ from, to, journey }: JourneySelection) => {
    if (from === undefined) {
      element.replaceChildren(html('p', {}, ['Select a station to start a journey.']))
      return
    }
    if (to === undefined) {
      element.replaceChildren(
        html('h2', {}, [`From ${nameOf(from)}`]),
        html('p', {}, ['Select a destination.']),
        clearButton(),
      )
      return
    }
    const heading = html('h2', {}, [`${nameOf(from)} to ${nameOf(to)}`])
    if (journey === null) {
      element.replaceChildren(heading, html('p', {}, ['No route joins these stations.']), clearButton())
      return
    }

    const stops = journey.legs.reduce((total, leg) => total + leg.hops.length, 0)
    // A journey from a station to itself has no legs, and no changes either.
    const changes = Math.max(0, journey.legs.length - 1)
    const steps = journey.legs.flatMap((leg, index) => {
      const line = network.lines.get(leg.line)!
      const start = leg.hops[0]!.from
      const end = leg.hops.at(-1)!.to
      const ride = html('li', {}, [
        swatch(line.color),
        html('span', {}, [html('b', {}, [line.name]), html('br'), `${nameOf(start)} to ${nameOf(end)} · ${plural(leg.hops.length, 'stop')}`]),
      ])
      return index === 0 ? [ride] : [html('li', { class: 'change' }, [html('span'), `Change at ${nameOf(start)}`]), ride]
    })
    element.replaceChildren(
      heading,
      html('p', { class: 'summary' }, [`${plural(stops, 'stop')} · ${plural(changes, 'change')}`]),
      html('ol', {}, steps),
      clearButton(),
    )
  }

  update({ from: undefined, to: undefined, journey: null })
  return { element, update }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
