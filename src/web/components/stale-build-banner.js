import { staleBuild } from '/shared/api.js'

export const StaleBuildBanner = {
  template: `
    <div v-if="staleBuild" class="stale-build" role="status">
      <div class="ui-banner stale-build-banner">
        <span class="ui-dot is-ok"></span>
        <span class="ui-banner-text">A new version of Freetvarr is ready.</span>
        <button type="button" class="ui-button ui-button-primary ui-button-sm" @click="reloadPage"><refresh-icon /> Reload</button>
      </div>
    </div>
  `,

  setup() {
    const reloadPage = () => window.location.reload()
    return { staleBuild, reloadPage }
  },
}
