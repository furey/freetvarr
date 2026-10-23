import { computed } from '/vendor/vue.esm-browser.prod.js'

export const OFF_AIR_MESSAGE = "This channel isn't broadcasting right now."

export const ChannelIdentity = {
  props: {
    channel: { type: Object, required: true },
    hasLogo: Boolean,
    number: { type: String, default: '' },
    starred: { type: Boolean, default: null },
  },
  emits: ['pin'],
  setup: (props) => ({ OFF_AIR_MESSAGE, isOn: computed(() => props.starred ?? Boolean(props.channel.pinned)) }),
  template: `
    <button type="button" :class="['epg-pin', { pinned: isOn }]" :aria-pressed="isOn"
      :title="isOn ? 'Remove from favourites' : 'Add to favourites'"
      :aria-label="isOn ? 'Remove ' + channel.name + ' from favourites' : 'Add ' + channel.name + ' to favourites'"
      @click="$emit('pin', $event)"><star-icon /></button>
    <span class="channel-logo"><channel-logo :channel-id="channel.id" :has-logo="hasLogo" /><channel-twin-tag :channel-id="channel.id" /></span>
    <span class="channel-name" :title="channel.offAir ? OFF_AIR_MESSAGE : channel.name">
      <span v-if="number" class="channel-number">{{ number }}</span>
      {{ channel.name }}
      <span v-if="channel.offAir" class="off-air-note">OFF AIR</span>
    </span>
  `,
}

export const channelGroupLabel = ({ pinned, anyPinned }) => {
  if (pinned) return 'Favourites'
  return anyPinned ? 'Other channels' : 'Channels'
}
