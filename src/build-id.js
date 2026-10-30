import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

export const BUILD_HEADER = 'X-Freetvarr-Build'

export const readBuildId = async ({ webRoot, version }) => {
  const names = (await fs.readdir(webRoot, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && SHIPPED_EXTENSIONS.includes(path.extname(entry.name)))
    .map((entry) => path.relative(webRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
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

export const stampIndexHtml = ({ html, build, preloads = [] }) => stampAssetUrls({
  text: withModulePreloads({ html: withBuildMeta({ html, build }), preloads }),
  build,
})

export const stampAssetUrls = ({ text, build }) => text.replace(STAMPED_ASSET_URL, `$1$2?v=${build}$1`)

export const cacheControlFor = ({ requestedBuild, build }) => requestedBuild === build
  ? 'public, max-age=31536000, immutable'
  : 'no-cache'

const withBuildMeta = ({ html, build }) => html.replace(
  '<meta charset="utf-8" />',
  `<meta charset="utf-8" />\n    <meta name="freetvarr-build" content="${build}" />`,
)

const withModulePreloads = ({ html, preloads }) => preloads.length
  ? html.replace(BOOT_MODULEPRELOAD, (_, indent) => preloads
    .map((url) => `${indent}<link rel="modulepreload" href="${url}" />`)
    .join('\n'))
  : html

const SHIPPED_EXTENSIONS = ['.html', '.js', '.css', '.woff2']
const BUILD_ID_LENGTH = 12
const BOOT_MODULEPRELOAD = /^([ \t]*)<link rel="modulepreload" href="\/app\.js" \/>$/m
const ABSOLUTE_ASSET_DIR = String.raw`\/(?:(?:vendor|views|components|shared|styles|fonts)\/)?`
const RELATIVE_ASSET_DIR = String.raw`\.\.?\/(?:\.\.\/)*(?:[\w-]+\/)*`
const STAMPED_ASSET_URL = new RegExp(
  String.raw`(["'])((?:${ABSOLUTE_ASSET_DIR}|${RELATIVE_ASSET_DIR})[\w.-]+\.(?:m?js|css|woff2))\1`,
  'g',
)
