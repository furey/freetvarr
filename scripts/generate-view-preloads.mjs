import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { staticImportGraph } from '../src/web-assets.js'
import { VIEW_ENTRIES } from '../src/web/view-modules.js'

const WEB_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'web')
const OUTPUT = path.join(WEB_ROOT, 'view-preloads.js')

export const viewPreloadsOf = async (webRoot = WEB_ROOT) => {
  const boot = new Set(await staticImportGraph({ webRoot, entry: '/app.js' }))
  const preloads = {}
  for (const [key, { url, components = {} }] of Object.entries(VIEW_ENTRIES)) {
    const graphs = await Promise.all([url, ...Object.keys(components)]
      .map((entry) => staticImportGraph({ webRoot, entry })))
    preloads[key] = [...new Set(graphs.flat())].filter((module) => !boot.has(module)).sort()
  }
  return preloads
}

export const viewPreloadsSource = (preloads) => {
  const entries = Object.entries(preloads).map(([key, urls]) => [
    `  ${key}: [`,
    ...urls.map((url) => `    '${url}',`),
    '  ],',
  ].join('\n'))
  return `export const VIEW_PRELOADS = {\n${entries.join('\n')}\n}\n`
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url)

if (isCli) {
  await fs.writeFile(OUTPUT, viewPreloadsSource(await viewPreloadsOf()))
  console.log(`wrote ${path.relative(process.cwd(), OUTPUT)}`)
}
