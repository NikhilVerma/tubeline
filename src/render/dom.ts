/**
 * Small helpers for building DOM.
 *
 * The map is built node by node, not from HTML strings. Station names and
 * metadata come from a caller's JSON, and this way the browser treats them as
 * text, so they can't inject markup. Colours go through `setLineColor` for
 * the same reason.
 */

/** A short bar in a line's colour, shown beside the line's name. */
export function swatch(color: string): HTMLElement {
  const element = html('span', { class: 'swatch' })
  setLineColor(element, color)
  return element
}

/**
 * A line's colour is any string from the caller's JSON. Setting it as one
 * property means the browser reads it as a single value, where writing it into
 * a `style` attribute would let it add declarations of its own.
 */
export function setLineColor(element: HTMLElement | SVGElement, color: string): void {
  element.style.setProperty('--line-color', color)
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

type Attributes = Record<string, string | number>

export function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  element.append(...children)
  return element
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: (Node | string)[] = [],
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  element.append(...children)
  return element
}
