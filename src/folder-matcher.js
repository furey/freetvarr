import fs from 'fs/promises'
import path from 'path'
import Fuse from 'fuse.js'

const MEDIA_ROOT_DEFAULT = '/media/tv'

export const listShowFolders = async (mediaRoot = MEDIA_ROOT_DEFAULT) => {
  const entries = await fs.readdir(mediaRoot, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

export const matchShowFolder = async (
  showTitle,
  { mediaRoot = MEDIA_ROOT_DEFAULT, threshold = 0.4 } = {},
) => {
  const folders = await listShowFolders(mediaRoot)
  if (folders.length === 0) return null
  const fuse = new Fuse(folders, { includeScore: true, threshold })
  const [best] = fuse.search(showTitle)
  if (!best) return null
  return { folder: best.item, fullPath: path.join(mediaRoot, best.item), score: best.score }
}
