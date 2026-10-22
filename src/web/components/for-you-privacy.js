import { computed } from '/vendor/vue.esm-browser.prod.js'
import { SUGGESTIONS_HREF } from '/for-you.js'
import { PRIVACY_TITLE, REPO_HREF, privacyLookupTextOf } from '/for-you-privacy.js'

export const ForYouPrivacyInfo = {
  props: { genreLookup: { type: Boolean, default: true } },
  template: `
    <info-button title="For you" doc="guide/for-you#viewing-history">
      <p><strong>{{ title }}.</strong> Freetvarr picks these shows on this box, from what you watch and record here. Your viewing history stays in Freetvarr's database on this box and never leaves it.</p>
      <p>{{ lookupText }} No tracking, no analytics. Freetvarr is <a :href="repoHref" target="_blank" rel="noopener noreferrer">open source</a>, so anyone can read the code.</p>
      <p><strong>Pause history</strong> and <strong>Clear viewing history</strong> are in <a :href="settingsHref">For you settings</a>. The <strong>Genres</strong> switch is in <a href="#/settings/film-tv-info">Film and TV info</a>.</p>
    </info-button>
  `,
  setup: (props) => ({
    ...LINKS,
    lookupText: computed(() => privacyLookupTextOf({ genreLookup: props.genreLookup })),
  }),
}

const LINKS = { title: PRIVACY_TITLE, repoHref: REPO_HREF, settingsHref: SUGGESTIONS_HREF }
