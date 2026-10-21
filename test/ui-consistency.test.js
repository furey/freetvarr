import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { nextSegmentIndex } from '../src/web/segment-keys.js'

const WEB_ROOT = path.join(import.meta.dirname, '..', 'src', 'web')

const sourceFilesIn = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? sourceFilesIn(full) : [full]
  }))
  return nested.flat().filter((file) => /\.(js|css)$/.test(file) && !file.includes('vendor') && !file.endsWith('tailwind.css'))
}

const read = (relative) => fs.readFile(path.join(WEB_ROOT, relative), 'utf8')

const scriptsAndStyles = async () => {
  const files = await sourceFilesIn(WEB_ROOT)
  return Promise.all(files.map(async (file) => ({ file, source: await fs.readFile(file, 'utf8') })))
}

test('every on/off switch is the shared toggle switch', async () => {
  for (const { file, source } of await scriptsAndStyles()) {
    assert.doesNotMatch(source, /ui-switch|guide-images-toggle|guide-switch|live-images-track/, file)
  }
  const forms = await read('components/forms.js')
  assert.match(forms, /role="switch"/)
  assert.match(forms, /:aria-checked="String\(modelValue\)"/)
  assert.match(forms, /'is-compact': compact/)
  for (const view of ['views/live-view.js', 'views/epg-view.js']) {
    assert.match(await read(view), /<toggle-switch compact[^>]*>Images<\/toggle-switch>/, view)
  }
})

test('Live TV shows favourites with one chip, like the library Unwatched chip', async () => {
  const live = await read('views/live-view.js')
  assert.match(live, /<button type="button" class="ui-chip live-scope" :aria-pressed="String\(pinnedOnly\)" @click="pinnedOnly = !pinnedOnly">Favourites<\/button>/)
  assert.doesNotMatch(live, />All channels</)
})

test('every button uses the shared ui-button styles', async () => {
  for (const { file, source } of await scriptsAndStyles()) {
    assert.doesNotMatch(source, /(^|[\s"'.([{])btn(-sm|-primary|-danger|-icon|-watch)?(?![\w-])/m, file)
  }
})

test('segmented controls come from one component with one pattern per job', async () => {
  const component = await read('components/ui-segmented.js')
  assert.match(component, /:role="tabs \? 'tablist' : 'radiogroup'"/)
  assert.match(component, /:role="tabs \? 'tab' : 'radio'"/)
  assert.match(component, /:aria-selected="tabs \?/)
  assert.match(component, /:aria-checked="tabs \? null :/)
  assert.match(component, /'is-fill': fill/)
  assert.match(await read('components/recordings-tabs.js'), /<ui-segmented tabs /)
  const handWritten = []
  for (const { file, source } of await scriptsAndStyles()) {
    if (!file.endsWith('.js') || file.endsWith('ui-segmented.js')) continue
    const segments = [...source.matchAll(/class="ui-segment"/g)].length
    if (segments) handWritten.push([path.relative(WEB_ROOT, file), segments])
  }
  assert.deepEqual(handWritten, [['views/epg-view.js', 2]])
  assert.match(await read('components/programme-sheet-host.js'), /<ui-segmented v-if="sheetStrengths\.length > 1" fill [^>]*aria-label="What to record"/)
})

test('arrow keys move through the enabled segments and wrap', () => {
  const enabled = [true, false, true, true]
  assert.equal(nextSegmentIndex({ key: 'ArrowRight', from: 0, enabled }), 2)
  assert.equal(nextSegmentIndex({ key: 'ArrowLeft', from: 0, enabled }), 3)
  assert.equal(nextSegmentIndex({ key: 'ArrowDown', from: 3, enabled }), 0)
  assert.equal(nextSegmentIndex({ key: 'Home', from: 3, enabled }), 0)
  assert.equal(nextSegmentIndex({ key: 'End', from: 0, enabled }), 3)
  assert.equal(nextSegmentIndex({ key: 'Enter', from: 0, enabled }), -1)
  assert.equal(nextSegmentIndex({ key: 'ArrowRight', from: -1, enabled }), 0)
  assert.equal(nextSegmentIndex({ key: 'ArrowRight', from: 0, enabled: [false, false] }), -1)
})

test('drawers share the drawer card', async () => {
  assert.match(await read('views/scheduled-view.js'), /class="drawer-card scheduled-watch-drawer"/)
  assert.match(await read('views/setup-settings-view.js'), /class="drawer-card setup-drawer"/)
  assert.match(await read('styles.css'), /\n\.drawer-card \{\n  padding: 16px;\n  border-radius: var\(--radius-card\);\n  background: var\(--color-surface-2\);/)
})

test('every more menu uses the one more glyph', async () => {
  for (const { file, source } of await scriptsAndStyles()) {
    assert.doesNotMatch(source, /MoreDotsIcon|SortDotsIcon|more-dots-icon|sort-dots-icon/, file)
  }
  for (const component of ['player-chrome', 'player-mini', 'multi-view', 'channels-modal']) {
    assert.match(await read(`components/${component}.js`), /<more-glyph/, component)
  }
})

test('toasts sit above every sheet', async () => {
  const css = await read('styles/base.css')
  const overlays = await read('overlay-stack.js')
  const toastZ = Number(css.match(/--z-toast: (\d+);/)[1])
  const overlayBase = Number(overlays.match(/BASE_Z_INDEX = (\d+)/)[1])
  assert.match(css, /\.ui-toast-region \{[^}]*z-index: var\(--z-toast\);/)
  assert.ok(toastZ > overlayBase + 50)
  assert.ok(toastZ < 1000)
})
