/**
 * These tests drive the demo page in a real browser.
 *
 * They cover what unit tests can't see: the drawing, pointer and keyboard
 * interaction, and the journey planner working from click to result.
 */
import { expect, test, type Page } from '@playwright/test'
import metro from '../../demo/data/metro.json' with { type: 'json' }

const station = (page: Page, id: string) => page.locator(`.station[data-station="${id}"]`)

test.beforeEach(async ({ page }) => {
  // Any error the page logs or throws fails the test that caused it.
  page.on('pageerror', (error) => {
    throw error
  })
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(message.text())
  })
  await page.goto('/')
})

test('plans a journey between two clicked stations', async ({ page }) => {
  await station(page, 'larkfield').click()
  await expect(page.locator('.journey')).toContainText('From Larkfield')

  await station(page, 'marsh-end').click()

  const journey = page.locator('.journey')
  await expect(journey.getByRole('heading')).toHaveText('Larkfield to Marsh End')
  await expect(journey).toContainText('9 stops · 1 change')
  await expect(journey.locator('li')).toHaveText([/Garden.*Larkfield to Exchange · 5 stops/, 'Change at Exchange', /Canal.*Exchange to Marsh End · 4 stops/])

  // The route is picked out on the map and everything else fades back.
  await expect(page.locator('.segment.on-journey')).toHaveCount(9)
  await expect(station(page, 'larkfield')).toHaveClass(/is-origin/)
  await expect(station(page, 'marsh-end')).toHaveClass(/is-destination/)

  // The demo's form follows the map through the journey:change event.
  await expect(page.locator('#from')).toHaveValue('larkfield')
  await expect(page.locator('#to')).toHaveValue('marsh-end')
  await expect(page.locator('.segment:not(.on-journey)').first()).toHaveCSS('opacity', '0.14')

  await journey.getByRole('button', { name: 'Clear' }).click()
  await expect(page.locator('.on-journey')).toHaveCount(0)
  await expect(journey).toHaveText('Select a station to start a journey.')
})

test('plans a journey with the keyboard alone', async ({ page }) => {
  await station(page, 'westmoor').focus()
  await page.keyboard.press('Enter')
  await station(page, 'fenwick').focus()
  await page.keyboard.press('Space')

  await expect(page.locator('.journey')).toContainText('Westmoor to Fenwick')
  await expect(page.locator('.journey')).toContainText('2 stops · 0 changes')

  await page.keyboard.press('Escape')
  await expect(page.locator('.journey')).toHaveText('Select a station to start a journey.')
})

test('shows a station\'s metadata in a tooltip', async ({ page }) => {
  await station(page, 'exchange').locator('.halo').hover()

  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toContainText('Exchange')
  await expect(tooltip.locator('dl')).toHaveText('zone1stepFreetrue')
  await expect(tooltip.locator('li')).toHaveText(['Meridian', 'Harbour', 'Garden', 'Canal'])
})

test('keeps a tooltip inside the map for a station at its edge', async ({ page }) => {
  // Drag the map until its first station is almost at the left side.
  const stage = await page.locator('.stage').boundingBox()
  const halo = await station(page, 'westmoor').locator('.halo').boundingBox()
  const emptySpot = { x: stage!.x + stage!.width / 2, y: stage!.y + 20 }
  await page.mouse.move(emptySpot.x, emptySpot.y)
  await page.mouse.down()
  await page.mouse.move(emptySpot.x - (halo!.x - stage!.x - 10), emptySpot.y, { steps: 5 })
  await page.mouse.up()
  await station(page, 'westmoor').locator('.halo').hover()

  const tooltip = await page.getByRole('tooltip').boundingBox()
  expect(tooltip!.x).toBeGreaterThanOrEqual(stage!.x)
  expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(stage!.x + stage!.width)
})

test('shows a connection\'s metadata for the direction it belongs to', async ({ page }) => {
  await page.locator('.line[data-line="meridian"] .segment[data-from="easterly"][data-to="ashdown"]').hover()

  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toContainText('Meridian')
  await expect(tooltip.locator('.direction')).toHaveText('Easterly → Ashdown')
  await expect(tooltip).toContainText('Eastbound only')
})

test('picks a line out from the key', async ({ page }) => {
  const orbital = page.locator('.legend').getByRole('button', { name: 'Orbital' })
  await orbital.click()

  await expect(orbital).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.line.is-focused')).toHaveAttribute('data-line', 'orbital')
  await expect(page.locator('.station.on-focused-line')).toHaveCount(8)
  await expect(page.locator('.line[data-line="harbour"] .segment').first()).toHaveCSS('opacity', '0.14')

  await orbital.click()
  await expect(orbital).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.is-focused')).toHaveCount(0)
})

test('zooms and pans, and resets to the whole map', async ({ page }) => {
  const map = page.locator('svg.map')
  const viewBox = async () => ((await map.getAttribute('viewBox')) ?? '').split(' ').map(Number)
  const [homeX, homeY, homeWidth] = await viewBox()

  await page.getByRole('button', { name: 'Zoom in' }).click()
  expect((await viewBox())[2]).toBeCloseTo(homeWidth! / 1.4)

  // Drag from an empty corner of the map: the view follows the pointer.
  const box = (await map.boundingBox())!
  const [beforeX, beforeY] = await viewBox()
  await page.mouse.move(box.x + 40, box.y + box.height - 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 140, box.y + box.height - 90, { steps: 5 })
  await page.mouse.up()
  const [afterX, afterY] = await viewBox()
  expect(afterX).toBeLessThan(beforeX!)
  expect(afterY).toBeGreaterThan(beforeY!)

  await map.hover()
  await page.mouse.wheel(0, -300)
  expect((await viewBox())[2]).toBeLessThan(homeWidth! / 1.4)

  await page.getByRole('button', { name: 'Reset view' }).click()
  expect((await viewBox()).slice(0, 3)).toEqual([homeX, homeY, homeWidth])
})

test('a drag that starts on a station pans the map instead of selecting it', async ({ page }) => {
  const box = (await station(page, 'pinewood').locator('.halo').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 })
  await page.mouse.up()

  await expect(page.locator('.journey')).toHaveText('Select a station to start a journey.')
})

test('places a graph that has no positions, and respects one-way lines', async ({ page }) => {
  await page.selectOption('#dataset', 'workflow')
  await expect(page.locator('.station')).toHaveCount(12)

  // No two stations are drawn on the same spot.
  const centres = await page.locator('.station .halo').evaluateAll((halos) => halos.map((halo) => `${halo.getAttribute('cx')},${halo.getAttribute('cy')}`))
  expect(new Set(centres).size).toBe(12)

  await station(page, 'cart').click()
  await station(page, 'refunded').click()
  await expect(page.locator('.journey')).toContainText('Cart to Refunded')
  await expect(page.locator('.journey li').first()).toContainText('Fulfilment')

  // The workflow only runs forwards, so there is no way back to the cart.
  await station(page, 'refunded').click()
  await station(page, 'cart').click()
  await expect(page.locator('.journey')).toContainText('No route joins these stations.')
})

test('stacks the journey and key under the map in a narrow container', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 })

  const map = (await page.locator('svg.map').boundingBox())!
  const sidebar = (await page.locator('.sidebar').boundingBox())!
  expect(sidebar.y).toBeGreaterThanOrEqual(map.y + map.height)
  expect(map.width).toBe(420)
})
