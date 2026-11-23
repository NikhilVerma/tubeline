# Changelog

All notable changes to `@nikhilverma/tubeline` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-23

### Changed

- Lines that share track keep a thin gap between them. They used to touch.
- A branch that meets its line at an angle curves onto it. It used to meet
  it at a sharp point.
- A line stops flat against the bar at its last station. Its rounded end used
  to show past the bar.
- Where a line turns at a station, the tick points at the station's name and
  sits level with the outside of the corner.

## [0.2.1] - 2026-11-19

### Added

- The `zoomButtons` option. Set it to `false` to hide the zoom and reset
  buttons, for a map that is only there to be looked at.

## [0.2.0] - 2026-11-19

### Added

- The `wheelZoom` option. `'with-modifier-key'` zooms only while Ctrl or ⌘ is
  held, so a map inside a scrolling page no longer stops the page scrolling.

### Removed

- `connections[].closed`. An edge that can't be travelled is an edge that isn't
  in the graph, so leave it out. For travel in one direction only, set `oneWay`
  on the line.

### Changed

- Zooming in stops when station names reach a set size on screen, so large
  and small maps zoom in equally close. The limit used to be 8 times the
  whole-map view.
- The map only draws what is in view. Stations and track outside the view are
  taken out of the page, and names are hidden while they are too small to
  read. Panning 10,000 stations went from about 10 frames a second to about 40
  zoomed out and 60 zoomed in.
- A station outside the view can't be reached with Tab until it is back in view.

## [0.1.1] - 2026-11-19

### Fixed

- Lines that share track no longer cross over each other where the track turns.
- A platform on top of the next stop is reported as a data error. It used to
  draw a broken map.
- Tooltips stay inside the map near its sides.
- `destroy` drops the map's event subscribers.
- A map name of the wrong type is reported.

### Changed

- Layout is much faster on large maps: 10,000 stations lay out in under half a
  second.
- Above 1,000 stations, showing a journey changes the map at once, without a
  fade.

## [0.1.0] - 2026-11-19

The first release.

### Added

- `createTubeMap` draws a JSON graph as an interactive tube map: pan, zoom,
  tooltips with metadata, a key that picks a line out, and keyboard support.
- `findJourney` plans the cheapest journey with A*, with a cost for each change
  of line. `parseTubeMap` checks the JSON and reports every problem together.
  Both run without a browser.
- Track runs horizontally, vertically or at 45°. Lines that share track run
  side by side, and bends move away from stations.
- Stations without positions are placed automatically.
- `platforms` lets single lines stop a short way apart inside one station.
- An agent skill in `skills/tubeline`.
