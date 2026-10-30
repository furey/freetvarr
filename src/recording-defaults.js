import { getSetting, setSetting } from './db.js'

export const ADD_TO_LIBRARY_DEFAULT_KEY = 'add_to_library_default'

export const addToLibraryDefaultFrom = (stored) => stored !== 'false'

export const getAddToLibraryDefault = async () =>
  addToLibraryDefaultFrom(await getSetting(ADD_TO_LIBRARY_DEFAULT_KEY))

export const mountRecordingDefaults = ({ app, csrf }) => {
  app.get('/api/recording-defaults', async (req, res) => {
    res.json({ add_to_library: await getAddToLibraryDefault() })
  })

  app.put('/api/recording-defaults', csrf, async (req, res) => {
    const { add_to_library: addToLibrary } = req.body || {}
    if (typeof addToLibrary !== 'boolean') {
      return res.status(400).json({ error: 'add_to_library must be true or false' })
    }
    await setSetting(ADD_TO_LIBRARY_DEFAULT_KEY, addToLibrary ? 'true' : 'false')
    res.json({ ok: true, add_to_library: addToLibrary })
  })
}
