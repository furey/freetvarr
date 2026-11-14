import { showKeyOf } from './show-key.js'

export const MAX_OVERRIDE_TOPICS = 2

export const CHANGE_CATEGORIES = { key: 'change-categories', label: 'Change categories', icon: 'tag' }

export const toggledTopicsOf = ({ topics = [], key, on }) => {
  const others = topics.filter((topic) => topic !== key)
  if (!on) return others
  return [...others, key].slice(-MAX_OVERRIDE_TOPICS)
}

export const originLineOf = (origin) => (origin?.name ? `Made in ${origin.name} (${origin.source})` : 'Origin not known')

export const categoriesPathOf = (title) => `/api/for-you/categories/show/${encodeURIComponent(showKeyOf(title))}`

export const overrideRequestOf = ({ title, format, topics }) => ({ title, format: format || null, topics })

export const canSaveCategoriesOf = ({ format, topics = [] }) => Boolean(format) || topics.length > 0

export const categoriesSavedTextOf = (title) => `Saved the categories for ${title}`

export const categoriesResetTextOf = (title) => `${title} uses automatic categories again`

export const sheetHintOf = ({ custom }) => (custom
  ? 'You chose these categories. For you uses them in place of the automatic ones.'
  : 'Freetvarr chose these categories. Change them to move the show to other rows in For you.')
