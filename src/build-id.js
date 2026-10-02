import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

export const BUILD_HEADER = 'X-Freetvarr-Build'

export const readBuildId = async ({ webRoot, version }) => {
  const names = (await fs.readdir(webRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && SHIPPED_EXTENSIONS.includes(path.extname(entry.name)))
    .map((entry) => entry.name)
  const files = await Promise.all(names.map(async (name) => ({
    name,
    content: await fs.readFile(path.join(webRoot, name)),
  })))
  return computeBuildId({ version, files })
}

export const computeBuildId = ({ version, files }) => {
  const hash = crypto.createHash('sha256').update(String(version ?? ''))
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
  for (const { name, content } of sorted) hash.update(`\0${name}\0`).update(content)
  return hash.digest('hex').slice(0, BUILD_ID_LENGTH)
}

export const stampIndexHtml = ({ html, build }) => html
  .replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta name="freetvarr-build" content="${build}" />`)
  .replace(/(href|src)="\/(app\.js|styles\.css)"/g, `$1="/$2?v=${build}"`)

const SHIPPED_EXTENSIONS = ['.html', '.js', '.css']
const BUILD_ID_LENGTH = 12
