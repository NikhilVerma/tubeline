import { createBoxIndex } from '../layout/box-index.ts'
import { grow, type Box } from '../layout/geometry.ts'
import { METRICS } from '../layout/metrics.ts'

/** A drawn station or piece of line, and the space it fills on the map. */
export interface DrawnPiece {
  element: SVGElement
  box: Box
}

/** The cell size of the index that finds the pieces in view. It changes speed, never the result. */
const INDEX_CELL_SIZE = METRICS.gridSize * 4

/**
 * How far past the edge of the view a piece still counts as in view. A name's
 * box is an estimate of its width, so the margin keeps a name that runs a
 * little wider from vanishing at the edge.
 */
const VIEW_MARGIN = METRICS.gridSize

/** A name drawn smaller than this many screen pixels can't be read, so it isn't drawn. A design choice. */
const SMALLEST_READABLE_NAME = 5

export interface ViewCulling {
  /** `refresh` checks the view again before the next frame. Call it whenever the view moves. */
  refresh(): void
}

/**
 * A browser redraws the whole SVG when the view moves, including everything
 * outside it. On a map of thousands of stations that makes panning slow, and
 * most of the time goes on station names.
 *
 * `attachViewCulling` keeps the drawing down to what can be seen, the way a
 * game engine does:
 *
 * - A piece outside the view is taken out of the SVG, and put back when it comes into view.
 * - Names aren't drawn while the map is zoomed out too far to read them.
 *
 * Hiding a piece with CSS isn't enough. Measured in Chromium on 10,000
 * stations, a frame of panning took 40 ms with the pieces out of view hidden
 * and 2 ms with them taken out.
 *
 * A piece that is out of the SVG can't be reached with Tab either. The whole map is
 * in view until someone zooms in, so every station starts out reachable.
 */
export function attachViewCulling(svg: SVGSVGElement, pieces: DrawnPiece[], signal: AbortSignal): ViewCulling {
  const index = createBoxIndex<DrawnPiece>(INDEX_CELL_SIZE)
  for (const piece of pieces) index.add(piece.box, piece)
  // Every piece starts in the SVG, so this is where each one goes back to.
  const parentOf = new Map(pieces.map((piece) => [piece, piece.element.parentNode!]))
  let drawn = new Set(pieces)

  const update = () => {
    const frame = svg.getBoundingClientRect()
    const screenToMap = svg.getScreenCTM()?.inverse()
    // A map that is hidden or not on the page yet has no view to work out.
    if (screenToMap === undefined || frame.width === 0 || frame.height === 0) return

    // The view is read from the screen, not the viewBox: a container of a different shape shows more of the map than the viewBox asks for.
    const topLeft = new DOMPoint(frame.left, frame.top).matrixTransform(screenToMap)
    const bottomRight = new DOMPoint(frame.right, frame.bottom).matrixTransform(screenToMap)
    const view = grow({ left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y }, VIEW_MARGIN)

    // `screenToMap.a` is how many map units one screen pixel covers.
    svg.classList.toggle('names-too-small', METRICS.labelFontSize / screenToMap.a < SMALLEST_READABLE_NAME)

    const inView = index.near(view)
    for (const piece of drawn) {
      if (!inView.has(piece)) piece.element.remove()
    }
    for (const piece of inView) {
      // A piece goes back on top of its siblings. Lines stay under stations, because each keeps its own parent.
      if (!drawn.has(piece)) parentOf.get(piece)!.appendChild(piece.element)
    }
    drawn = inView
  }

  // Several changes can land in one frame, such as each pointer move of a drag. One check per frame covers them all.
  let scheduled: number | undefined
  const refresh = () => {
    scheduled ??= requestAnimationFrame(() => {
      scheduled = undefined
      update()
    })
  }

  // Resizing the container changes what is in view without the view being moved. It also reports the first size, which draws the first view.
  const resizes = new ResizeObserver(refresh)
  resizes.observe(svg)
  signal.addEventListener('abort', () => {
    resizes.disconnect()
    if (scheduled !== undefined) cancelAnimationFrame(scheduled)
  })

  return { refresh }
}
