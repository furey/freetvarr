{
  const override = new URLSearchParams(location.search).get('page-scroll')
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches
  const iosWebKit = typeof CSS !== 'undefined' && CSS.supports('-webkit-touch-callout', 'none')
  const forced = override === 'inner' || override === 'document'
  document.documentElement.dataset.pageScroll = forced ? override : (iosWebKit && !standalone ? 'inner' : 'document')
}
