import { ref } from '/vendor/vue.esm-browser.prod.js'
import { holdAtLeast } from '/pending.js'

export const ConfirmDialog = {
  props: {
    open: Boolean,
    dialog: { type: Object, default: null },
    busy: Boolean,
    icon: { type: String, default: '' },
  },
  emits: ['confirm', 'cancel'],
  template: `
    <ui-sheet :open="open && Boolean(dialog)" :title="dialog?.title || ''" @close="cancel">
      <div v-if="dialog" class="confirm-dialog-body">
        <p v-if="dialog.lead" class="confirm-dialog-line"><rich-text :text="dialog.lead" /></p>
        <p v-for="(line, i) in dialog.body" :key="i" class="confirm-dialog-line"><rich-text :text="line" /></p>
        <div v-if="dialog.rows?.length" class="ui-group confirm-dialog-rows">
          <div v-for="row in dialog.rows" :key="row.label" :class="['ui-group-row', { 'is-tall': row.detail }]">
            <div class="ui-group-row-main">
              <span class="ui-group-row-title">{{ row.label }}</span>
              <span v-if="row.detail" class="ui-group-row-meta confirm-dialog-line"><rich-text :text="row.detail" /></span>
            </div>
            <span v-if="row.value" class="ui-group-row-value"><rich-text :text="row.value" /></span>
          </div>
        </div>
        <p v-if="dialog.note" class="confirm-dialog-line text-ink-mute text-sm"><rich-text :text="dialog.note" /></p>
      </div>
      <template v-if="dialog" #footer>
        <button type="button" :class="['ui-button', 'ui-button-block', dialog.danger ? 'ui-button-destructive' : 'ui-button-primary', { 'is-pending': busy }]"
          @click="$emit('confirm')" :disabled="busy" :aria-busy="busy">
          <template v-if="busy"><span class="spinner" aria-hidden="true"></span> {{ dialog.busyLabel }}</template>
          <template v-else><component v-if="icon" :is="icon" /> {{ dialog.confirmLabel }}</template>
        </button>
        <button type="button" class="ui-button ui-button-block" @click="cancel" :disabled="busy">Cancel</button>
      </template>
    </ui-sheet>
  `,
  setup(props, { emit }) {
    const cancel = () => {
      if (!props.busy) emit('cancel')
    }
    return { cancel }
  },
}

export const useConfirm = () => {
  const confirming = ref(null)
  const confirmBusy = ref(false)

  const askConfirm = ({ dialog, icon = '', run }) => {
    confirming.value = { dialog, icon, run }
  }

  const closeConfirm = () => { confirming.value = null }

  const runConfirmed = async () => {
    const { run } = confirming.value
    confirmBusy.value = true
    try {
      await holdAtLeast({ task: run })
    } finally {
      confirmBusy.value = false
      confirming.value = null
    }
  }

  return { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed }
}
