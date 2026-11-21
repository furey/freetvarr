import { api } from '/shared/api.js'
import { createTasteCache } from '/taste-cache.js'

export const forYouTastes = createTasteCache()

export const forYouWrite = async (method, url, body) => {
  forYouTastes.clear()
  try {
    return await api(method, url, body)
  } finally {
    forYouTastes.clear()
  }
}
