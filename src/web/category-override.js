import { showKeyOf } from './show-key.js'

export const MAX_OVERRIDE_TOPICS = 2

export const CHANGE_CATEGORIES = { key: 'change-categories', label: 'Change categories', icon: 'tag' }

export const toggledTopicsOf = ({ topics = [], key, on }) => {
  const others = topics.filter((topic) => topic !== key)
  if (!on) return others
  return [...others, key].slice(-MAX_OVERRIDE_TOPICS)
}

export const formatGroupsOf = (formats = []) => {
  const groups = []
  for (const choice of [...formats, { key: '', title: 'None', group: NONE_GROUP }]) {
    const label = choice.group || NONE_GROUP
    const group = groups.find((entry) => entry.label === label) ?? groups[groups.push({ label, choices: [] }) - 1]
    group.choices.push(choice)
  }
  return groups
}

export const originLineOf = (origin) => (origin?.name ? `Made in ${origin.name} (${origin.source})` : 'Origin not known')

export const categoriesPathOf = (title) => `/api/for-you/categories/show/${encodeURIComponent(showKeyOf(title))}`

export const SPORT_FORMAT = 'sport'

export const overrideRequestOf = ({ title, format, topics, sport = null }) => (format === SPORT_FORMAT
  ? { title, format, sport }
  : { title, format: format || null, topics })

export const canSaveCategoriesOf = ({ format, topics = [], sport = null }) => (format === SPORT_FORMAT ? Boolean(sport) : Boolean(format) || topics.length > 0)

export const categoriesSavedTextOf = (title) => `Saved the categories for ${title}`

export const categoriesResetTextOf = (title) => `${title} uses automatic categories again`

export const sheetHintOf = ({ custom }) => (custom
  ? 'You chose these categories. For you uses them in place of the automatic ones.'
  : 'Freetvarr chose these categories. Change them to move the show to other rows in For you.')

const NONE_GROUP = 'Other'
