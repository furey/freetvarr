import { ref, onUnmounted } from '/vendor/vue.esm-browser.prod.js'

export const COPIED_FLASH_MS = 2000

export const copyText = async (text) => {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  const scratch = document.createElement('textarea')
  scratch.value = text
  scratch.setAttribute('readonly', '')
  scratch.style.position = 'fixed'
  scratch.style.opacity = '0'
  document.body.append(scratch)
  scratch.select()
  const copied = document.execCommand('copy')
  scratch.remove()
  if (!copied) throw new Error('Copy failed')
}

export const CopyRow = {
  props: {
    label: { type: String, required: true },
    value: { type: String, default: '' },
  },
  template: `
    <div class="copy-row">
      <span class="field-label">{{ label }}</span>
      <code class="copy-row-value">{{ value }}</code>
      <button type="button" class="ui-button ui-button-sm" @click="copy" :disabled="!value">
        <template v-if="state === 'copied'"><check-icon /> Copied</template>
        <template v-else-if="state === 'failed'"><cross-icon /> Copy failed</template>
        <template v-else><copy-icon /> Copy</template>
      </button>
    </div>
  `,
  setup(props) {
    const state = ref('')
    let timer = null
    const flash = (next) => {
      state.value = next
      clearTimeout(timer)
      timer = setTimeout(() => { state.value = '' }, COPIED_FLASH_MS)
    }
    const copy = async () => {
      try {
        await copyText(props.value)
        flash('copied')
      } catch {
        flash('failed')
      }
    }
    onUnmounted(() => clearTimeout(timer))
    return { state, copy }
  },
}
