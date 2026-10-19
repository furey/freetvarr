export const PlayerInfoPanel = {
  props: {
    open: Boolean,
    panelId: { type: String, required: true },
  },
  template: `
    <transition name="live-info">
    <section v-if="open" :id="panelId" class="live-info" role="region" aria-label="Programme info">
      <div class="live-info-body">
        <slot name="image" />
        <div class="live-info-text"><slot /></div>
      </div>
    </section>
    </transition>
  `,
}
