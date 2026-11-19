/**
 * Checks the built package, the files npm would publish, rather than the
 * source. It loads `dist/index.js` into a blank page the way a browser loads
 * any ES module, so a build that drops or breaks something is caught here.
 */
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('the built package draws a map and plans a journey', async ({ page }) => {
  const bundle = await readFile(new URL('../../dist/index.js', import.meta.url), 'utf8')
  await page.goto('/')
  await page.setContent('<div id="app" style="width: 800px; height: 600px"></div>')

  const journey = await page.evaluate(async (code) => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    const { createTubeMap } = await import(url)
    const map = createTubeMap(document.querySelector('#app'), {
      stations: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }],
      lines: [{ id: 'red', name: 'Red', stations: ['a', 'b', 'c'] }],
    })
    return map.showJourney('a', 'c')
  }, bundle)

  expect(journey.cost).toBe(2)
  await expect(page.locator('.station')).toHaveCount(3)
  await expect(page.locator('.journey')).toContainText('Alpha to Gamma')
})
