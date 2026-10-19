export const OFF_AIR_MESSAGE = "This channel isn't broadcasting right now."

export const ChannelIdentity = {
  props: { channel: { type: Object, required: true }, hasLogo: Boolean, number: { type: String, default: '' } },
  emits: ['pin'],
  setup: () => ({ OFF_AIR_MESSAGE }),
  template: `
    <button type="button" :class="['epg-pin', { pinned: channel.pinned }]" :aria-pressed="Boolean(channel.pinned)"
      :title="channel.pinned ? 'Remove from favourites' : 'Add to favourites'"
      :aria-label="channel.pinned ? 'Remove ' + channel.name + ' from favourites' : 'Add ' + channel.name + ' to favourites'"
      @click="$emit('pin')"><star-icon /></button>
    <span class="channel-logo"><channel-logo :channel-id="channel.id" :has-logo="hasLogo" /></span>
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
