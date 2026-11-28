const PROBE_HEIGHTS = ['100dvh', '100svh', '100lvh', '100vh', '100%']
const WATCHED_ELEMENTS = ['.ui-sheet', '.pl-backdrop', '.pl-frame', '.app-tabbar']
const READOUT_STYLE = [
  'position:fixed', 'top:calc(env(safe-area-inset-top,0px) + 60px)', 'left:8px', 'z-index:2147483647',
  'padding:8px 10px', 'font:11px/1.4 ui-monospace,monospace', 'color:#fff', 'background:rgba(0,0,0,.75)',
  'border-radius:8px', 'pointer-events:none', 'white-space:pre', 'margin:0',
].join(';')
const HIDDEN_STYLE = 'position:fixed;top:0;left:0;width:1px;visibility:hidden;pointer-events:none'

export const isViewportDebugOn = (search) => new URLSearchParams(search).get('debug') === 'viewport'

export const showViewportDebug = (doc = document, win = window) => {
  const panel = createElement(doc, 'pre', READOUT_STYLE)
  const insets = createElement(doc, 'div', `${HIDDEN_STYLE};padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)`)
  const probes = PROBE_HEIGHTS.map((height) => ({ height, el: createElement(doc, 'div', `${HIDDEN_STYLE};height:${height}`) }))
  doc.body.append(panel, insets, ...probes.map((probe) => probe.el))
  const render = () => {
    panel.textContent = readoutLinesOf({ doc, win, insets, probes }).join('\n')
  }
  render()
  win.addEventListener('resize', render)
  win.visualViewport?.addEventListener('resize', render)
  win.visualViewport?.addEventListener('scroll', render)
  win.setInterval(render, 500)
}

const readoutLinesOf = ({ doc, win, insets, probes }) => {
  const insetStyle = win.getComputedStyle(insets)
  const rootStyle = win.getComputedStyle(doc.documentElement)
  const viewport = win.visualViewport
  return [
    `screen ${win.screen.width}x${win.screen.height}`,
    `inner ${win.innerWidth}x${win.innerHeight}`,
    `visual h ${Math.round(viewport?.height ?? 0)} top ${Math.round(viewport?.offsetTop ?? 0)}`,
    `docEl ${doc.documentElement.clientHeight}`,
    ...probes.map((probe) => `${probe.height} ${Math.round(probe.el.getBoundingClientRect().height)}`),
    `safe top ${insetStyle.paddingTop} bottom ${insetStyle.paddingBottom}`,
    `--visible-viewport-bottom ${rootStyle.getPropertyValue('--visible-viewport-bottom') || 'unset'}`,
    ...WATCHED_ELEMENTS.map((selector) => rectLineOf(doc, selector)),
    `body ${doc.body.className || '-'}`,
    `html bg ${win.getComputedStyle(doc.documentElement).backgroundColor}`,
    `body bg ${win.getComputedStyle(doc.body).backgroundColor}`,
    `theme-color ${doc.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '-'}`,
    `bar tint ${doc.querySelector('.player-bar-tint') ? 'on' : 'off'}`,
    `standalone ${win.matchMedia('(display-mode: standalone)').matches}`,
    `page scroll ${doc.documentElement.dataset.pageScroll ?? '-'} window ${Math.round(win.scrollY)} #app ${Math.round(doc.getElementById('app')?.scrollTop ?? 0)}`,
  ]
}

const rectLineOf = (doc, selector) => {
  const element = [...doc.querySelectorAll(selector)].find((candidate) => candidate.getClientRects().length > 0)
  if (!element) return `${selector} -`
  const rect = element.getBoundingClientRect()
  return `${selector} top ${Math.round(rect.top)} bottom ${Math.round(rect.bottom)}`
}

const createElement = (doc, tag, style) => {
  const element = doc.createElement(tag)
  element.setAttribute('aria-hidden', 'true')
  element.setAttribute('style', style)
  return element
}
