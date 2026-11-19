/**
 * The map's sizes, in SVG units. They are design choices, picked to match a
 * tube map's proportions: thick lines, tight corners and small station names.
 * Layout and rendering both read them. The drawing then matches the space
 * the layout left for it.
 */
export const METRICS = {
  /** The size of one grid unit of a station's position. */
  gridSize: 44,
  lineWidth: 8,
  /** The distance between the centres of two lines that share track. It equals the line width, so the lines touch as they do on a tube map. */
  lineSpacing: 8,
  cornerRadius: 16,
  labelFontSize: 15,
  /** How far a station's tick reaches from the centre of its line. */
  tickReach: 11,
  /** The radius of the white disc at an interchange, before its outline. */
  interchangeRadius: 8,
  /** The width of the dark ring round an interchange disc. */
  interchangeOutline: 3,
  /** The width of the bar that joins the discs of one interchange, outline included. */
  walkwayWidth: 11,
  /** The space between a station's marker and its name. */
  labelGap: 3,
  /** Empty space kept round the whole map. */
  padding: 28,
  /** The smallest area the fitted view covers. It stops a map of a few stations being magnified to fill a large container. */
  minimumWidth: 760,
  minimumHeight: 440,
} as const
