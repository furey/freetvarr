import { getSetting, setSetting } from './db.js'

export const WELCOME_DISMISSED_KEY = 'welcome_dismissed'

export const isWelcomeDismissed = async () => (await getSetting(WELCOME_DISMISSED_KEY)) === 'true'

export const setWelcomeDismissed = (dismissed) =>
  setSetting(WELCOME_DISMISSED_KEY, dismissed ? 'true' : 'false')
