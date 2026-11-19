import { METRICS } from '../layout/metrics.ts'
import { TOOLTIP_GAP } from './tooltip.ts'

/**
 * The map's stylesheet. It lives in the map's shadow root, so it can't leak
 * into the page and the page's styles can't break the map.
 *
 * A page themes the map by setting the `--tubeline-*` custom properties on
 * the container. A shadow root inherits custom properties from outside.
 */
export const STYLES: string = /* css */ `
:host {
  display: block;
  container-type: inline-size;
  width: 100%;
  height: 100%;
  min-height: 320px;
}
.tubeline {
  --ink: var(--tubeline-ink, #14235a);
  --background: var(--tubeline-background, #ffffff);
  --panel: var(--tubeline-panel-background, rgb(255 255 255 / 0.94));
  --accent: var(--tubeline-accent, #0b6bcb);
  --rule: color-mix(in srgb, var(--ink) 18%, transparent);
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  min-height: inherit;
  background: var(--background);
  color: var(--ink);
  font: 13px/1.4 var(--tubeline-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
}
.stage { position: relative; overflow: hidden; min-height: 0; }
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* The sidebar comes first in the page so Tab reaches it first. On a narrow map it is shown under the map. */
  order: 1;
  max-height: 220px;
  padding: 12px;
  overflow: auto;
  background: var(--panel);
  border-top: 1px solid var(--rule);
}
/* With room to spare, the journey and the key sit beside the map instead of under it. */
@container (min-width: 640px) {
  .tubeline.has-sidebar { grid-template-rows: minmax(0, 1fr); grid-template-columns: 240px minmax(0, 1fr); }
  .sidebar { order: 0; max-height: none; border-top: 0; border-right: 1px solid var(--rule); }
  .legend { margin-top: auto; }
}
.map {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
  user-select: none;
}
.map.is-dragging { cursor: grabbing; }

.segment { transition: opacity 0.2s; }
.track {
  fill: none;
  stroke: var(--line-color);
  stroke-width: ${METRICS.lineWidth};
  stroke-linecap: round;
  stroke-linejoin: round;
}
.arrow { fill: var(--background); }
.tick {
  fill: none;
  stroke-width: ${METRICS.lineWidth * 0.6};
  stroke-linecap: butt;
}
.interchange-outline,
.interchange-fill,
.walkway-outline,
.walkway-fill {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.interchange-outline { stroke: var(--ink); stroke-width: ${(METRICS.interchangeRadius + METRICS.interchangeOutline) * 2}; }
.interchange-fill { stroke: var(--background); stroke-width: ${METRICS.interchangeRadius * 2}; }
.walkway-outline { stroke: var(--ink); stroke-width: ${METRICS.walkwayWidth}; }
.walkway-fill { stroke: var(--background); stroke-width: ${METRICS.walkwayWidth - METRICS.interchangeOutline * 2}; }

.station { cursor: pointer; outline: none; transition: opacity 0.2s; }
.station .halo { fill: transparent; stroke: none; }
.station:hover .halo { fill: color-mix(in srgb, var(--accent) 14%, transparent); }
.station:focus-visible .halo { stroke: var(--accent); stroke-width: 2.5; }
.station.is-origin .halo,
.station.is-destination .halo {
  fill: color-mix(in srgb, var(--accent) 22%, transparent);
  stroke: var(--accent);
  stroke-width: 2.5;
}
.label {
  fill: var(--ink);
  font-size: ${METRICS.labelFontSize}px;
  font-weight: 500;
  dominant-baseline: central;
  paint-order: stroke;
  stroke: var(--background);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.station.is-origin .label,
.station.is-destination .label { font-weight: 700; }

/* While a journey or a single line is picked out, everything else fades back. */
.has-journey .segment:not(.on-journey),
.has-line-focus .line:not(.is-focused) .segment { opacity: 0.14; }
.has-journey .station:not(.on-journey),
.has-line-focus .station:not(.on-focused-line) { opacity: 0.3; }

.panel {
  position: absolute;
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 8px;
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.08);
}
button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
button:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
button:focus-visible { outline: 2.5px solid var(--accent); outline-offset: 1px; }

.controls { top: 12px; right: 12px; display: flex; flex-direction: column; padding: 2px; }
.controls button { width: 32px; height: 32px; font-size: 18px; line-height: 1; }

.legend { margin: 0; padding: 0; list-style: none; }
.legend button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 3px 6px; text-align: left; }
.legend button[aria-pressed='true'] { background: color-mix(in srgb, var(--ink) 12%, transparent); font-weight: 700; }
.swatch {
  flex: none;
  display: inline-block;
  width: 22px;
  height: 6px;
  border-radius: 3px;
  background: var(--line-color);
}

.journey h2 { margin: 0 0 2px; font-size: 14px; }
.journey p { margin: 0; }
.journey .summary { opacity: 0.75; }
.journey ol { margin: 8px 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.journey li { display: grid; grid-template-columns: 22px 1fr; column-gap: 8px; align-items: baseline; }
.journey li .swatch { align-self: center; }
.journey li.change { font-style: italic; opacity: 0.75; }
.journey .clear { margin-left: -8px; padding: 3px 8px; color: var(--accent); font-weight: 600; }

.tooltip {
  position: absolute;
  z-index: 1;
  width: max-content;
  max-width: 260px;
  padding: 8px 10px;
  background: var(--ink);
  color: var(--background);
  border-radius: 6px;
  pointer-events: none;
  transform: translate(-50%, calc(-100% - ${TOOLTIP_GAP}px));
}
.tooltip.is-below { transform: translate(-50%, ${TOOLTIP_GAP * 2}px); }
.tooltip[hidden] { display: none; }
.tooltip strong { display: block; font-size: 14px; }
.tooltip ul { margin: 4px 0 0; padding: 0; list-style: none; }
.tooltip li { display: flex; align-items: center; gap: 6px; }
.tooltip .swatch { outline: 1px solid rgb(255 255 255 / 0.5); }
.tooltip dl { display: grid; grid-template-columns: auto 1fr; gap: 1px 8px; margin: 6px 0 0; }
.tooltip dt { opacity: 0.7; }
.tooltip dd { margin: 0; overflow-wrap: anywhere; }
.tooltip .direction { margin-top: 6px; font-weight: 600; }

@media (prefers-reduced-motion: reduce) {
  .segment, .station { transition: none; }
}
/* A big map changes without fading. See MOST_STATIONS_TO_FADE. */
.no-fade .segment, .no-fade .station { transition: none; }
`
