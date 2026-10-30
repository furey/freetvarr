import { ref, onMounted } from '/vendor/vue.esm-browser.prod.js'
import { createSettingBaseline } from '/setting-baseline.js'
import { api } from '/shared/api.js'

export const PlexLibrarySetting = {
  template: `
    <div class="settings-group" data-setting="plex-whole-library">
      <h3 class="ui-group-label">Your whole library</h3>
      <div class="ui-group">
        <div class="settings-row" data-setting="plex-whole-library-switch">
          <toggle-switch v-model="enabled" :pending="!loaded" class="settings-toggle">
            <span class="settings-toggle-text">
              <span class="settings-row-title">Show your whole Plex library</span>
              <span class="settings-row-meta">Recordings also lists what Sonarr, Radarr, and you added to Plex. Freetvarr does not import or move these files.</span>
            </span>
          </toggle-switch>
        </div>
        <div v-if="enabled && sections?.length" class="settings-row" data-setting="plex-library-sections">
          <h4 class="settings-row-title plex-library-sections-label" id="plex-library-sections-label">Libraries to show</h4>
          <div class="ui-chip-row" role="group" aria-labelledby="plex-library-sections-label">
            <button v-for="section in sections" :key="section.id" type="button" class="ui-chip" :aria-pressed="String(sectionIds.includes(section.id))"
              @click="toggleSection(section.id)">{{ section.title }}</button>
          </div>
        </div>
        <p v-else-if="enabled && sections === null && loaded" class="settings-row settings-row-meta">Plex did not answer, so its libraries are not listed. Set the Plex URL and token above.</p>
      </div>
    </div>
  `,
  setup(_, { expose }) {
    const enabled = ref(true)
    const sectionIds = ref([])
    const sections = ref([])
    const loaded = ref(false)
    const enabledBaseline = createSettingBaseline()
    const sectionsBaseline = createSettingBaseline()

    const use = (body) => {
      enabled.value = body.enabled
      sectionIds.value = [...body.sectionIds]
      sections.value = body.sections
      enabledBaseline.remember(body.enabled)
      sectionsBaseline.remember(body.sectionIds.join(','))
      loaded.value = true
    }

    const load = async () => {
      const body = await api('GET', '/api/plex/whole-library').catch(() => null)
      if (body) use(body)
    }

    const toggleSection = (id) => {
      sectionIds.value = sectionIds.value.includes(id)
        ? sectionIds.value.filter((entry) => entry !== id)
        : [...sectionIds.value, id]
    }

    const save = async () => {
      const body = {}
      if (enabledBaseline.isChanged(enabled.value)) body.enabled = enabled.value
      if (sectionsBaseline.isChanged(sectionIds.value.join(','))) body.section_ids = sectionIds.value
      if (!Object.keys(body).length) return
      use(await api('PUT', '/api/plex/whole-library', body))
    }

    onMounted(load)
    expose({ save, load })
    return { enabled, sectionIds, sections, loaded, toggleSection }
  },
}
