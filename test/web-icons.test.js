import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import express from 'express'
import sharp from 'sharp'

const WEB_ROOT = path.join(import.meta.dirname, '..', 'src', 'web')

const readManifest = async () =>
  JSON.parse(await fs.readFile(path.join(WEB_ROOT, 'manifest.webmanifest'), 'utf8'))

const headHrefs = async () => {
  const html = await fs.readFile(path.join(WEB_ROOT, 'index.html'), 'utf8')
  return [...html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)]
    .map(([, href]) => href)
}

test('manifest icons exist at their declared pixel sizes', async () => {
  const { icons } = await readManifest()
  for (const icon of icons) {
    const { width, height } = await sharp(path.join(WEB_ROOT, icon.src)).metadata()
    assert.equal(`${width}x${height}`, icon.sizes, icon.src)
  }
})

test('manifest declares any and maskable icons at 512 px', async () => {
  const { icons } = await readManifest()
  const purposesAt512 = icons.filter((icon) => icon.sizes === '512x512').map((icon) => icon.purpose)
  assert.ok(purposesAt512.includes('any'))
  assert.ok(purposesAt512.includes('maskable'))
  assert.ok(icons.some((icon) => icon.sizes === '192x192'))
})

test('apple touch icon is an opaque 180 px png', async () => {
  const { width, height, hasAlpha } = await sharp(path.join(WEB_ROOT, 'apple-touch-icon.png')).metadata()
  assert.deepEqual({ width, height, hasAlpha }, { width: 180, height: 180, hasAlpha: false })
})

test('maskable icon differs from the any icon', async () => {
  const [maskable, any] = await Promise.all(['icon-maskable-512.png', 'icon-512.png']
    .map((name) => fs.readFile(path.join(WEB_ROOT, name))))
  assert.notDeepEqual(maskable, any)
})

test('maskable icon content stays inside the 80 percent safe circle', async () => {
  const { data, info } = await sharp(path.join(WEB_ROOT, 'icon-maskable-512.png'))
    .raw()
    .toBuffer({ resolveWithObject: true })
  const centre = info.width / 2
  const safeRadius = info.width * 0.4
  const background = [0x0b, 0x11, 0x17]
  const outsideCircleDiffers = (index) => {
    const x = (index % info.width) + 0.5 - centre
    const y = Math.floor(index / info.width) + 0.5 - centre
    if (Math.hypot(x, y) <= safeRadius) return false
    return background.some((value, channel) => data[index * info.channels + channel] !== value)
  }
  const pixelCount = info.width * info.height
  const offenders = Array.from({ length: pixelCount }, (_, index) => index).filter(outsideCircleDiffers)
  assert.equal(offenders.length, 0)
})

test('every icon and manifest link in index.html points at a shipped file', async () => {
  const hrefs = await headHrefs()
  assert.ok(hrefs.includes('/favicon.ico'))
  assert.ok(hrefs.includes('/favicon.svg'))
  for (const href of hrefs) await fs.access(path.join(WEB_ROOT, href))
})

test('static serving maps icon and manifest extensions to the right types', () => {
  const { mime } = express.static
  assert.equal(mime.lookup('favicon.ico'), 'image/x-icon')
  assert.equal(mime.lookup('favicon.svg'), 'image/svg+xml')
  assert.equal(mime.lookup('manifest.webmanifest'), 'application/manifest+json')
})
