export const ProgressBlock = {
  props: ['progress', 'caption', 'bar'],
  template: `
    <div class="progress">
      <div v-if="bar" class="progress-track">
        <div class="progress-fill" :class="{ indeterminate: progress.percent == null }"
          :style="progress.percent == null ? {} : { width: (progress.percent || 0) + '%' }"></div>
      </div>
      <span class="progress-caption">{{ caption }}</span>
    </div>
  `,
}
