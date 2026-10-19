import { ref } from '/vendor/vue.esm-browser.prod.js'

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
        <p v-for="(line, i) in dialog.body" :key="i" class="confirm-dialog-line">{{ line }}</p>
      </div>
      <template v-if="dialog" #footer>
        <button type="button" :class="['ui-button', 'ui-button-block', dialog.danger ? 'ui-button-destructive' : 'ui-button-primary']"
          @click="$emit('confirm')" :disabled="busy">
          <template v-if="busy">{{ dialog.busyLabel }}</template>
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
      await run()
    } finally {
      confirmBusy.value = false
      confirming.value = null
    }
  }

  return { confirming, confirmBusy, askConfirm, closeConfirm, runConfirmed }
}
