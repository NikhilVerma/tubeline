import { describe, expect, it } from 'vitest'
import { parseTubeMap, TubeMapDataError } from '../../src/index.ts'

describe('parseTubeMap', () => {
  it('reports every problem at once, so a broken file can be fixed in one pass', () => {
    const broken = {
      stations: [{ id: 'a', x: 0, y: 0 }, { id: 'b' }, { id: 'a' }],
      lines: [{ id: 'red', stations: ['a', 'missing'] }],
      connections: [{ from: 'a', to: 'b' }],
    }

    let issues: readonly string[] = []
    try {
      parseTubeMap(broken)
    } catch (error) {
      issues = (error as TubeMapDataError).issues
    }

    expect(issues).toEqual([
      'Station id "a" is used more than once.',
      'Give every station an "x" and "y", or none of them. A mix can\'t be laid out.',
      'Line "red" calls at unknown station "missing".',
      'Station "b" is not on any line.',
      'connections[0]: "a" and "b" are not next to each other on any line.',
    ])
  })

  it('reports a platform on top of the next stop, which would leave track with no direction to draw', () => {
    const data = {
      stations: [
        { id: 'a', x: 0, y: 0, platforms: { red: { x: 2, y: 0 } } },
        { id: 'b', x: 2, y: 0 },
      ],
      lines: [{ id: 'red', stations: ['a', 'b'] }],
    }

    expect(() => parseTubeMap(data)).toThrow('Line "red" stops at "a" and "b" in the same place, 2,0.')
  })

  it('reports optional fields of the wrong type, which would otherwise be dropped without a word', () => {
    const broken = {
      stations: [{ id: 'a', labelSide: 'left' }, { id: 'b', metadata: 'note' }],
      lines: [{ id: 'red', stations: ['a', 'b'], oneWay: 'true', branches: 5 }],
    }

    expect(() => parseTubeMap(broken)).toThrowError(TubeMapDataError)
    expect(() => parseTubeMap(broken)).toThrowError(/labelSide "left"[\s\S]*metadata must be an object[\s\S]*branches must be an array[\s\S]*oneWay must be a boolean/)
  })

  it('lets a connection price one direction and leave the other', () => {
    const network = parseTubeMap({
      stations: [{ id: 'a' }, { id: 'b' }],
      lines: [{ id: 'red', stations: ['a', 'b'] }],
      connections: [
        { from: 'a', to: 'b', cost: 5, metadata: { note: 'slow' } },
      ],
    })

    expect(network.hopsFrom.get('a')).toEqual([{ from: 'a', to: 'b', line: 'red', cost: 5, metadata: { note: 'slow' } }])
    expect(network.hopsFrom.get('b')).toEqual([{ from: 'b', to: 'a', line: 'red', cost: 1, metadata: {} }])
  })
})
