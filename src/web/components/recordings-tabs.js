export const RecordingsTabs = {
  props: {
    current: { type: String, required: true },
    scheduledCount: { type: Number, default: null },
    fill: Boolean,
  },
  template: `
    <ui-segmented tabs :fill="fill" :model-value="current" :options="tabs" aria-label="Recordings" />
  `,
  computed: {
    tabs() {
      const count = this.scheduledCount == null ? '' : ` · ${this.scheduledCount}`
      return [
        { value: 'library', label: 'Library', href: '#/recordings' },
        { value: 'scheduled', label: `Scheduled${count}`, href: '#/recordings/scheduled' },
      ]
    },
  },
}
