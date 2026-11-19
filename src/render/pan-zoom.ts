import type { Box } from '../layout/geometry.ts'
import { METRICS } from '../layout/metrics.ts'

/**
 * The closest zoom is the one that draws station names this many screen
 * pixels tall. A design choice. The limit is a size on screen, so a map of
 * ten stations and a map of ten thousand zoom in to the same closeness.
 */
const LARGEST_NAME_ON_SCREEN = 48

/** How far the map can zoom out, relative to the view that fits the whole map. A design choice. */
const MIN_ZOOM = 0.6

/** How much one press of a zoom button magnifies. A design choice. */
const ZOOM_BUTTON_FACTOR = 1.4

/** Pixels a pointer must move before a press counts as a drag. Below it, the press is still a click on a station. */
const DRAG_THRESHOLD = 4

/** The share of wheel movement that becomes zoom. A design choice: one notch of a mouse wheel zooms by about 15%. */
const WHEEL_SENSITIVITY = 0.0015

/**
 * A page that scrolls and a map that zooms both want the mouse wheel. Which
 * should win depends on where the map sits, so the page chooses:
 *
 * - `always`: the wheel zooms the map. This suits a map that fills the screen.
 * - `with-modifier-key`: the wheel zooms only while Ctrl or ⌘ is held, and a
 *   plain scroll moves the page. This suits a map part-way down a page that
 *   scrolls. A pinch on a trackpad still zooms, because browsers report a
 *   pinch as a wheel turn with Ctrl held.
 */
export type WheelZoom = 'always' | 'with-modifier-key'

export interface PanZoomOptions {
  wheelZoom: WheelZoom
  /** Called after every change of view. */
  onViewChange: () => void
}

export interface PanZoom {
  /** One step in or out, about the middle of the view. The zoom buttons use these. */
  zoomIn(): void
  zoomOut(): void
  /** `reset` goes back to the view that fits the whole map. */
  reset(): void
}

/**
 * A map is often bigger than its container. `attachPanZoom` lets people move
 * round it: they drag to pan, and scroll or pinch to zoom.
 *
 * It changes the SVG's `viewBox`, so the drawing stays sharp at any zoom.
 */
export function attachPanZoom(svg: SVGSVGElement, bounds: Box, signal: AbortSignal, { wheelZoom, onViewChange }: PanZoomOptions): PanZoom {
  const home = { x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }
  let view = { ...home }
  const apply = () => {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`)
    onViewChange()
  }

  /** `toMap` converts a place on screen to the map's own coordinates. */
  const toMap = (clientX: number, clientY: number): DOMPoint => {
    const matrix = svg.getScreenCTM()
    return new DOMPoint(clientX, clientY).matrixTransform(matrix?.inverse())
  }

  /** `zoomAbout` zooms while keeping the map point `about` under the same place on screen. */
  const zoomAbout = (about: { x: number; y: number }, factor: number) => {
    // How many screen pixels one map unit covers. A map that isn't on the page has no size on screen, so nothing limits it.
    const scale = svg.getScreenCTM()?.a
    const closest = scale ? LARGEST_NAME_ON_SCREEN / METRICS.labelFontSize / scale : Infinity
    const furthest = (MIN_ZOOM * view.width) / home.width
    // A small map in a large container can start closer than the limit. Zooming in then does nothing, rather than jumping out.
    const clamped = factor > 1 ? Math.min(factor, Math.max(1, closest)) : Math.max(factor, Math.min(1, furthest))
    view = {
      x: about.x - (about.x - view.x) / clamped,
      y: about.y - (about.y - view.y) / clamped,
      width: view.width / clamped,
      height: view.height / clamped,
    }
    apply()
  }

  const middle = () => ({ x: view.x + view.width / 2, y: view.y + view.height / 2 })

  const pointers = new Map<number, { x: number; y: number }>()
  let dragging = false

  svg.addEventListener(
    'pointerdown',
    (event) => {
      // Only the main button pans. A right-click belongs to the browser's menu.
      if (event.button === 0) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    },
    { signal },
  )

  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
    if (pointers.size === 0) {
      dragging = false
      svg.classList.remove('is-dragging')
    }
  }
  svg.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId)
      if (previous === undefined) return
      // A press released outside the map never sends its pointerup here. No
      // button held means that press is over, so the map must not follow the pointer.
      if (event.buttons === 0) {
        release(event)
        return
      }
      const current = { x: event.clientX, y: event.clientY }

      if (!dragging) {
        if (Math.hypot(current.x - previous.x, current.y - previous.y) < DRAG_THRESHOLD) return
        dragging = true
        // Capturing keeps the drag going when the pointer leaves the map. It
        // also stops this press from ending as a click on a station.
        svg.setPointerCapture(event.pointerId)
        svg.classList.add('is-dragging')
      }

      const [other] = [...pointers].filter(([id]) => id !== event.pointerId).map(([, point]) => point)
      if (other !== undefined) {
        // Two fingers: zoom by how much they moved apart, about the point between them.
        const spreadBefore = Math.hypot(previous.x - other.x, previous.y - other.y)
        const spreadNow = Math.hypot(current.x - other.x, current.y - other.y)
        if (spreadBefore > 0) zoomAbout(toMap((current.x + other.x) / 2, (current.y + other.y) / 2), spreadNow / spreadBefore)
      } else {
        const from = toMap(previous.x, previous.y)
        const to = toMap(current.x, current.y)
        view.x -= to.x - from.x
        view.y -= to.y - from.y
        apply()
      }
      pointers.set(event.pointerId, current)
    },
    { signal },
  )

  svg.addEventListener('pointerup', release, { signal })
  svg.addEventListener('pointercancel', release, { signal })

  svg.addEventListener(
    'wheel',
    (event) => {
      // Left alone, the wheel turn scrolls the page as usual.
      if (wheelZoom === 'with-modifier-key' && !event.ctrlKey && !event.metaKey) return
      // The map takes the scroll for itself. The listener is not passive so it can stop the page scrolling too.
      event.preventDefault()
      zoomAbout(toMap(event.clientX, event.clientY), Math.exp(-event.deltaY * WHEEL_SENSITIVITY))
    },
    { signal, passive: false },
  )

  return {
    zoomIn: () => zoomAbout(middle(), ZOOM_BUTTON_FACTOR),
    zoomOut: () => zoomAbout(middle(), 1 / ZOOM_BUTTON_FACTOR),
    reset: () => {
      view = { ...home }
      apply()
    },
  }
}
