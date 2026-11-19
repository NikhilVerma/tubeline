import type { Box } from './geometry.ts'

/**
 * A `BoxIndex` answers "what is near this box?" without looking at everything
 * on the map.
 *
 * Layout asks that for every station name, against every piece of track and
 * every other station. Checking each pair makes a map of thousands of
 * stations take minutes. The index sorts items into square cells, so a
 * question only reads the cells its box covers.
 */
export interface BoxIndex<Item> {
  add(box: Box, item: Item): void
  /** Every item whose box shares a cell with `box`. Some may not overlap it, so the caller still tests each one. */
  near(box: Box): Set<Item>
}

export function createBoxIndex<Item>(cellSize: number): BoxIndex<Item> {
  const cells = new Map<string, Item[]>()

  const cellsCovering = (box: Box): string[] => {
    const keys: string[] = []
    for (let column = Math.floor(box.left / cellSize); column <= Math.floor(box.right / cellSize); column++) {
      for (let row = Math.floor(box.top / cellSize); row <= Math.floor(box.bottom / cellSize); row++) {
        keys.push(`${column},${row}`)
      }
    }
    return keys
  }

  return {
    add(box, item) {
      for (const key of cellsCovering(box)) {
        const cell = cells.get(key)
        if (cell === undefined) cells.set(key, [item])
        else cell.push(item)
      }
    },
    near(box) {
      // An item that covers several cells is found once per cell, and the set keeps one of it.
      const found = new Set<Item>()
      for (const key of cellsCovering(box)) {
        for (const item of cells.get(key) ?? []) found.add(item)
      }
      return found
    },
  }
}
