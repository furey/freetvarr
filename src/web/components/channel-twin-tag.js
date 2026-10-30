import { computed, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { loadLineupOnce, twinFormatOf } from '/shared/channel-twins.js'

export const ChannelTwinTag = {
  props: { channelId: { type: [String, Number], default: null } },
  setup(props) {
    const format = computed(() => twinFormatOf(props.channelId))
    onMounted(loadLineupOnce)
    return { format }
  },
  template: `
    <span v-if="format" :class="['channels-format', 'channel-twin-tag', format === 'HD' ? 'is-hd' : 'is-sd']"
      :title="format === 'HD' ? 'High definition' : 'Standard definition'">{{ format }}</span>
  `,
}
