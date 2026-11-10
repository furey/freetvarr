import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WEB_ROOT = fileURLToPath(new URL('../src/web', import.meta.url))
const VUE = fileURLToPath(new URL('../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url))

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    const fromWeb = context.parentURL?.startsWith(pathToFileURL(WEB_ROOT).href)
    if (!fromWeb || !specifier.startsWith('/')) return nextResolve(specifier, context)
    if (specifier === '/vendor/vue.esm-browser.prod.js') return nextResolve(pathToFileURL(VUE).href, context)
    return nextResolve(pathToFileURL(`${WEB_ROOT}${specifier}`).href, context)
  },
})

const { useConfirm } = await import('../src/web/components/dialogs.js')
const { stopMergedGuideDialogOf, useMergedGuideDialogOf } = await import('../src/web/guide-sources-text.js')

const REPOINT = { feedUrl: 'http://192.168.1.10:3733/guide/xmltv.xml', added: [], channels: 40, days: [] }
const PLAN = { sameUrl: true, grabberUrl: REPOINT.feedUrl, enabled: true, primaryChannelNames: [], restoresLinks: 0 }

test('guide switch dialogs: cancel runs nothing, and only the confirm button starts the change', async () => {
  for (const dialog of [useMergedGuideDialogOf({ repoint: REPOINT }), stopMergedGuideDialogOf({ plan: PLAN })]) {
    const { confirming, askConfirm, closeConfirm, runConfirmed } = useConfirm()
    let runs = 0
    askConfirm({ dialog, run: async () => { runs += 1 } })
    assert.equal(confirming.value.dialog.confirmLabel, dialog.confirmLabel)
    closeConfirm()
    assert.equal(runs, 0, `${dialog.title} cancelled`)
    assert.equal(confirming.value, null)
    askConfirm({ dialog, run: async () => { runs += 1 } })
    await runConfirmed()
    assert.equal(runs, 1, `${dialog.title} confirmed`)
  }
})

test('guide settings: both switch buttons open the dialog instead of calling the server', () => {
  const view = readFileSync(new URL('../src/web/views/guide-settings-view.js', import.meta.url), 'utf8')
  assert.match(view, /@click="askUse">Use the merged guide<\/button>/)
  assert.match(view, /@click="askStop">Stop using the merged guide<\/button>/)
  assert.doesNotMatch(view, /@click="confirm"|@click="confirmUnmerge"/)
  assert.match(view, /<confirm-dialog /)
})

test('the confirm dialog renders a lead, summary rows, and a muted note, and keeps body lines for every other dialog', async () => {
  const { ConfirmDialog } = await import('../src/web/components/dialogs.js')
  assert.match(ConfirmDialog.template, /v-if="dialog\.lead"/)
  assert.match(ConfirmDialog.template, /v-for="\(line, i\) in dialog\.body"/)
  assert.match(ConfirmDialog.template, /<div v-for="row in dialog\.rows"[^>]*'ui-group-row'/)
  assert.match(ConfirmDialog.template, /class="ui-group-row-meta[^"]*"><rich-text :text="row\.detail" \/>/)
  assert.match(ConfirmDialog.template, /class="confirm-dialog-line text-ink-mute text-sm"><rich-text :text="dialog\.note" \/>/)
})
