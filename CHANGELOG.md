# Changelog

All notable changes to `@nikhilverma/tubeline` are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
