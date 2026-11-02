import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const baseUrl = process.argv[2] ?? 'http://localhost:3864/freetvarr/'
const widths = [390, 768]
const playwrightDir = process.env.PLAYWRIGHT_DIR ?? resolve(import.meta.dirname, '.cache/playwright-1.49.0/node_modules/playwright')
const selector = 'p, li, td, th, h1, h2, h3, h4, h5, h6'

const main = async () => {
  const { chromium } = createRequire(import.meta.url)(playwrightDir)
  const browser = await chromium.launch()
  const paths = await listPagePaths()
  const failures = []
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 800 } })
    const page = await context.newPage()
    for (const path of paths) failures.push(...await checkPage({ page, path, width }))
    await context.close()
  }
  await browser.close()
  report(failures)
  process.exit(failures.length ? 1 : 0)
}

const listPagePaths = async () => {
  const xml = await (await fetch(new URL('sitemap.xml', baseUrl))).text()
  const basePath = new URL(baseUrl).pathname
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(([, loc]) => new URL(loc).pathname.slice(basePath.length))
}

const checkPage = async ({ page, path, width }) => {
  await page.goto(new URL(path, baseUrl).href, { waitUntil: 'networkidle' })
  const found = await page.evaluate(findRunts, selector)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const runts = found.map((runt) => ({ ...runt, path, width }))
  return overflow > 0 ? [...runts, { tag: 'page', word: '(horizontal overflow)', text: `${overflow}px`, path, width }] : runts
}

const findRunts = (selector) => {
  const nestedBlocks = 'pre, ul, ol, p, table, div, svg, script, style, blockquote'
  const isOwnText = (element, node) => {
    const block = node.parentElement.closest(nestedBlocks)
    return !block || !element.contains(block) || block === element
  }
  const isFlowText = (element, node) => {
    const parent = node.parentElement
    return parent === element || getComputedStyle(parent).display === 'inline'
  }
  const lastLineWords = (element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const words = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!isOwnText(element, node) || !isFlowText(element, node)) continue
      let previousEnd = -1
      for (const match of node.data.matchAll(/\S+/g)) {
        const range = document.createRange()
        range.setStart(node, match.index)
        range.setEnd(node, match.index + match[0].length)
        const rects = range.getClientRects()
        const rect = rects[rects.length - 1]
        if (!rect || !rect.width) continue
        const continuesPrevious = match.index === 0 && words.length && words.at(-1).open
          && Math.abs(rect.left - words.at(-1).right) < 1.5
        const word = { word: match[0], top: rect.top, bottom: rect.bottom, right: rect.right, open: false }
        if (continuesPrevious) words[words.length - 1] = { ...word, word: words.at(-1).word + match[0] }
        else words.push(word)
        previousEnd = match.index + match[0].length
      }
      if (words.length) words.at(-1).open = previousEnd === node.data.length
    }
    return words
  }
  return [...document.querySelectorAll(selector)]
    .filter((element) => element.offsetParent && !element.closest('.VPNav, .VPSidebar, .VPDocAside, .mermaid'))
    .flatMap((element) => {
      const words = lastLineWords(element)
      if (words.length < 2) return []
      const last = words.at(-1)
      const sameLine = words.filter((w) => Math.abs(w.top - last.top) < last.bottom - last.top - 2)
      const hasEarlierLine = words.some((w) => w.bottom <= last.top + 2)
      return sameLine.length === 1 && hasEarlierLine
        ? [{ tag: element.tagName.toLowerCase(), word: last.word, text: element.textContent.trim().slice(0, 60) }]
        : []
    })
}

const report = (failures) => {
  if (!failures.length) return console.log('No runts or overflow.')
  const counts = Map.groupBy(failures, ({ path, width }) => `${width}px ${path || '(home)'}`)
  for (const [key, items] of counts) {
    console.log(`${key}: ${items.length}`)
    for (const { tag, word, text } of items) console.log(`  <${tag}> "${word}" in "${text}"`)
  }
  console.log(`\n${failures.length} problems on ${counts.size} page widths`)
}

await main()
