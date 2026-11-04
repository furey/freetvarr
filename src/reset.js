import { TV_LOGIN_KEYS } from './tv-login.js'

export const OPEN_ENTRY_BACKUP_KEY = 'tvh_open_entry_backup'

export const SETTINGS_KEPT_ON_RESET = [...Object.values(TV_LOGIN_KEYS), OPEN_ENTRY_BACKUP_KEY]

export const resetFreetvarrData = (db) => db.transaction(async (trx) => {
  await trx('recordings').delete()
  await trx('syncs').delete()
  await trx('shows').delete()
  await trx('settings').whereNotIn('key', SETTINGS_KEPT_ON_RESET).delete()
})
