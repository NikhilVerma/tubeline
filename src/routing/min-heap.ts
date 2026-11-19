/**
 * Route finding repeatedly asks for the cheapest unexplored option. A `MinHeap`
 * answers that in logarithmic time, where scanning a list would make long
 * searches slow.
 */
export class MinHeap<T> {
  readonly #items: { priority: number; value: T }[] = []

  push(value: T, priority: number): void {
    const items = this.#items
    items.push({ priority, value })
    // The new item moves up until its parent is no more expensive than it.
    let index = items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (items[parent]!.priority <= items[index]!.priority) break
      ;[items[parent], items[index]] = [items[index]!, items[parent]!]
      index = parent
    }
  }

  /** `pop` removes the value with the lowest priority and returns it. An empty heap gives undefined. */
  pop(): T | undefined {
    const items = this.#items
    const top = items[0]
    const last = items.pop()
    if (top === undefined || last === undefined) return undefined
    if (items.length === 0) return top.value

    // The last item goes to the top, then moves down while a child is cheaper than it.
    items[0] = last
    let index = 0
    for (;;) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < items.length && items[left]!.priority < items[smallest]!.priority) smallest = left
      if (right < items.length && items[right]!.priority < items[smallest]!.priority) smallest = right
      if (smallest === index) break
      ;[items[smallest], items[index]] = [items[index]!, items[smallest]!]
      index = smallest
    }
    return top.value
  }
}
