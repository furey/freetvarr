export const INNER_PAGE_SCROLL = 'inner'

export const isInnerPageScroll = (doc = document) => doc.documentElement?.dataset?.pageScroll === INNER_PAGE_SCROLL

export const pageScrollRoot = (doc = document) => (isInnerPageScroll(doc) ? doc.getElementById('app') : null)

export const pageScroller = (doc = document) => pageScrollRoot(doc) || doc.scrollingElement || doc.documentElement

export const pageScrollTop = (doc = document) => pageScroller(doc).scrollTop

export const maxPageScrollTop = (doc = document) => maxScrollTopOf(pageScroller(doc))

export const scrollPageTo = (options, doc = document) => pageScroller(doc).scrollTo(options)

export const addPageScrollListener = (listener, options, doc = document) => {
  doc.defaultView?.addEventListener('scroll', listener, options)
  doc.getElementById('app')?.addEventListener('scroll', listener, options)
}

export const removePageScrollListener = (listener, options, doc = document) => {
  doc.defaultView?.removeEventListener('scroll', listener, options)
  doc.getElementById('app')?.removeEventListener('scroll', listener, options)
}

export const installWindowPinning = (doc = document) => {
  const win = doc.defaultView
  const unshift = () => {
    if (isInnerPageScroll(doc) && win.scrollY > 0) win.scrollTo(0, 0)
  }
  doc.addEventListener('focusout', unshift)
  return () => doc.removeEventListener('focusout', unshift)
}

export const maxScrollTopOf = ({ scrollHeight, clientHeight }) => Math.max(0, scrollHeight - clientHeight)
