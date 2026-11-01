export const RecordingsTabs = {
  props: {
    current: { type: String, required: true },
    scheduledCount: { type: Number, default: null },
    fill: Boolean,
  },
  template: `
    <ui-segmented tabs :fill="fill" :model-value="current" :options="tabs" aria-label="Recordings">
      <template #default="{ option }"><span class="recordings-tab-label" :data-room="option.room"><span>{{ option.label }}</span></span></template>
    </ui-segmented>
  `,
  computed: {
    tabs() {
      const count = this.scheduledCount == null ? '' : ` · ${this.scheduledCount}`
      return [
        { value: 'library', label: 'Library', href: '#/recordings' },
        { value: 'scheduled', label: `Scheduled${count}`, room: SCHEDULED_COUNT_ROOM, href: '#/recordings/scheduled' },
      ]
    },
  },
}

const SCHEDULED_COUNT_ROOM = 'Scheduled · 000'
