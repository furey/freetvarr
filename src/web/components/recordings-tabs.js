export const RecordingsTabs = {
  props: {
    current: { type: String, required: true },
    scheduledCount: { type: Number, default: null },
    fill: Boolean,
  },
  template: `
    <nav :class="['ui-segmented', { 'is-fill': fill }]" aria-label="Recordings">
      <a href="#/recordings" class="ui-segment" :aria-current="current === 'library' ? 'page' : null">Library</a>
      <a href="#/recordings/scheduled" class="ui-segment" :aria-current="current === 'scheduled' ? 'page' : null">Scheduled<template v-if="scheduledCount != null"> · {{ scheduledCount }}</template></a>
    </nav>
  `,
}
