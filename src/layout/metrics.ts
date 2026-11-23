/**
 * The map's sizes, in SVG units. Layout and rendering both read them. The
 * drawing then matches the space the layout left for it.
 *
 * The line width is a design choice. Most other sizes are measured: each is
 * the median of that size across the official London tube map, taken as a
 * multiple of the map's line width and multiplied by ours. A hand-drawn map
 * drifts a little from station to station, and a median over hundreds of
 * them gives the size its designers aim for. The comments say which sizes
 * are measured.
 */
export const METRICS = {
  /** The size of one grid unit of a station's position. */
  gridSize: 44,
  lineWidth: 8,
  /** The distance between the centres of two lines that share track. It is a quarter more than the line width, which leaves the thin gap a tube map shows between lines that run together. */
  lineSpacing: 10,
  /** The radius of every bend, along the middle of the line. Measured: 3.38 line widths, over 159 bends. */
  cornerRadius: 27,
  labelFontSize: 15,
  /** How far a station's tick reaches from the centre of its line. Measured: 1.18 line widths, over 175 ticks. */
  tickReach: 9.4,
  /** How thick a tick is. Measured: 0.66 line widths, over 175 ticks. It has to stay at least half the line width, so the bar at the end of a line covers the line's rounded end. */
  tickWidth: 5.3,
  /** The radius of the white disc at an interchange, before its outline. Measured: 1 line width, over 68 rings. */
  interchangeRadius: 8,
  /** The width of the dark ring round an interchange disc. Measured: half a line width, over 68 rings. */
  interchangeOutline: 4,
  /** The width of the bar that joins the discs of one interchange, outline included. A design choice: it leaves a white channel half a line width wide. */
  walkwayWidth: 12,
  /** The space between a station's marker and the letters of its name. Measured: 0.58 line widths, over 268 names. */
  labelGap: 4.6,
  /** Empty space kept round the whole map. */
  padding: 28,
  /** The smallest area the fitted view covers. It stops a map of a few stations being magnified to fill a large container. */
  minimumWidth: 760,
  minimumHeight: 440,
} as const
