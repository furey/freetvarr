import {chromium} from 'playwright'
import {mkdir, writeFile, stat} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRAMES = join(HERE, 'work/frames')
const HTML = join(HERE, 'work/html')
const OUT = join(HERE, 'out')
const REVIEW = join(HERE, 'review')
const FONTS = join(HERE, '../../docs/.vitepress/theme/fonts')

const GRID = {margin: 80, top: 120, baseline: 640, stageX: 640, plateInset: 40}

const main = async () => {
  await Promise.all([HTML, OUT, REVIEW].map(dir => mkdir(dir, {recursive: true})))
  const browser = await chromium.launch()
  const page = await browser.newPage({viewport: {width: 1280, height: 720}})
  for (const thumb of THUMBS)
    await renderPage({page, name: thumb.file, html: thumbPage(thumb), width: 1280, height: 720,
      dir: OUT})
  await renderReviews(page)
  await browser.close()
  await reportSizes()
}

const THUMBS = [
  {n: 1, slug: 'overview', title: 'Leaving Fetch TV? Record free-to-air TV with Freetvarr',
    lines: ['Leaving', '<em>Fetch?</em>'], sub: 'Keep recording free TV',
    hero: () => overviewHero()},
  {n: 2, slug: 'leaving-fetch',
    title: 'Save your Fetch TV recordings before you cancel, with fetchtv',
    lines: ['Save your', '<em>Fetch</em>', '<em>recordings</em>'], sub: 'Before you cancel',
    hero: () => leavingFetchHero()},
  {n: 3, slug: 'install', title: 'Install Freetvarr and run setup on a NAS or mini PC',
    lines: ['One', '<em>command</em>'], sub: 'Then setup in a browser',
    hero: () => installHero()},
  {n: 4, slug: 'recording', title: 'Record free-to-air TV from the Freetvarr TV guide',
    lines: ['Record', 'from <em>the</em>', '<em>guide</em>'], sub: 'Like your Fetch remote',
    hero: () => recordingHero()},
  {n: 5, slug: 'watching', title: 'Watch recordings and live TV on your TV with Freetvarr',
    lines: ['Watch on', '<em>your TV</em>'], sub: 'Recordings and live TV',
    hero: () => watchingHero()},
  {n: 6, slug: 'library', title: 'Freetvarr recordings library, with Plex, Sonarr, and Radarr',
    lines: ['Filed', '<em>for you</em>'], sub: 'A poster for each show',
    hero: () => libraryHero()},
  {n: 7, slug: 'home-settings', title: 'Freetvarr Home, For you, Activity, Health, and Settings',
    lines: ['What can I', '<em>watch now?</em>'], sub: 'Home and For you', shift: 64,
    hero: () => homeHero()},
].map(thumb => ({...thumb, file: `thumb-${thumb.n}-${thumb.slug}`}))

const overviewHero = () =>
  bleedScreen({frame: 'ov-98', x: 395, y: 190, w: 900, h: 668, width: 700})

const leavingFetchHero = () => `
  <svg class="arc" width="1280" height="720" viewBox="0 0 1280 720">
    <path d="M 812 520 C 812 440, 840 360, 900 330" fill="none" stroke="#5ce1c6"
      stroke-width="6" stroke-dasharray="1 14" stroke-linecap="round"/>
  </svg>
  ${laptop({x: 880, y: GRID.top, width: 480, screen: savedFolder(), label: 'Your computer'})}
  ${flyingCard({x: 676, y: 340, rotate: -7, opacity: 0.6, image: SURF})}
  ${flyingCard({x: 724, y: 232, rotate: 5, opacity: 1, image: BANANAS})}
  ${fetchBox({x: GRID.stageX, y: 528, width: 232, label: 'Fetch box'})}`

const installHero = () => `
  <div class="well" style="left:${GRID.stageX}px;top:${GRID.top}px">
    <div class="well-bar"><i></i><i></i><i></i></div>
    ${crop({frame: 'install-terminal', x: 130, y: 342, w: 1000, h: 512, width: 700})}
  </div>
  ${pill({kind: 'done', text: "You're set"})}`

const recordingHero = () => `
  <div class="sheet" style="left:${GRID.stageX + 72}px;top:${GRID.top}px">
    ${crop({frame: 'rec-sheet', x: 662, y: 230, w: 596, h: 560, width: 488})}
  </div>
  ${pill({kind: 'record', text: 'Record'})}`

const watchingHero = () => `
  <div class="tv" style="left:${GRID.stageX}px;top:${GRID.top}px">
    <div class="tv-screen">
      ${crop({frame: 'watch-tv', x: 374, y: 164, w: 1172, h: 646, width: 676})}
    </div>
    <div class="tv-neck"></div><div class="tv-foot"></div>
  </div>`

const libraryHero = () =>
  bleedScreen({frame: 'lib-posters', x: 404, y: 372, w: 900, h: 398, width: 1176})

const homeHero = () =>
  bleedScreen({frame: 'home-home', x: 395, y: 196, w: 1060, h: 532, width: 1036})

const SURF = {frame: 'watch-tv', x: 760, y: 300, w: 640, h: 360}
const BANANAS = {frame: 'rec-sheet', x: 700, y: 262, w: 470, h: 210}
const BUTTERFLY = {frame: 'lib-posters', x: 412, y: 470, w: 184, h: 104}
const SKY = {frame: 'lib-posters', x: 1219, y: 480, w: 184, h: 104}

const savedFolder = () => `
  <div class="folder">
    <div class="folder-head">fetch-recordings</div>
    ${[['Big Wave Season', SURF], ['Kitchen Heat', BANANAS], ['Wild Neighbours', BUTTERFLY],
      ['Road Trip Rules', SKY]].map(([name, image]) => `
      <div class="folder-row"><b>✓</b>${crop({...image, width: 72})}<span>${name}</span></div>`)
      .join('')}
  </div>`

const bleedScreen = ({frame, x, y, w, h, width}) => `
  <div class="bleed" style="left:${GRID.stageX}px;top:${GRID.top}px">
    ${crop({frame, x, y, w, h, width})}
  </div>`

const crop = ({frame, x, y, w, h, width}) => {
  const scale = width / w
  return `<div class="crop" style="width:${width}px;height:${Math.round(h * scale)}px">
    <img src="file://${FRAMES}/${frame}.png" style="width:${1920 * scale}px;
      left:${-x * scale}px;top:${-y * scale}px"></div>`
}

const laptop = ({x, y, width, screen, label}) => `
  <div class="laptop" style="left:${x}px;top:${y}px;width:${width}px">
    <div class="laptop-screen">${screen}</div><div class="laptop-base"></div>
    <div class="device-label">${label}</div>
  </div>`

const fetchBox = ({x, y, width, label}) => `
  <div class="fetch-box" style="left:${x}px;top:${y}px;width:${width}px">
    <div class="fetch-slab"><i></i><s></s></div>
    <div class="device-label">${label}</div>
  </div>`

const flyingCard = ({x, y, rotate, opacity, image}) => `
  <div class="flying" style="left:${x}px;top:${y}px;transform:rotate(${rotate}deg);
    opacity:${opacity}">${crop({...image, width: 176})}</div>`

const pill = ({kind, text}) => `
  <div class="pill ${kind}" style="left:${GRID.stageX}px;top:${GRID.baseline - 88}px">
    <i></i>${text}</div>`

const headline = ({lines, sub}) => `
  <div class="headline">${lines.map(line => `<div>${line}</div>`).join('')}
    <p>${sub}</p>
  </div>`

const chips = () => `<div class="chips"><i></i><i></i><i></i></div>`

const thumbPage = thumb => `<!doctype html><html><head><meta charset="utf-8">
  <style>${STYLE}</style></head>
  <body><div class="thumb">
    <div class="stage" style="transform:translateX(${thumb.shift ?? 0}px)">
      <div class="plate"></div>${thumb.hero()}
    </div>${headline(thumb)}${chips()}
  </div></body></html>`

const renderReviews = async page => {
  const thumbImg = (file, width) =>
    `<img src="file://${OUT}/${file}.jpg" style="width:${width}px;display:block">`
  await renderPage({page, dir: REVIEW, name: 'review-grid', width: 1080, height: 1350,
    html: reviewPage(`<div class="grid">${THUMBS.map(t => `
      <div class="card">${thumbImg(t.file, 470)}<div class="title">${t.title}</div></div>`)
      .join('')}
      <div class="card note">Two-column phone grid.<br>Each thumbnail is 470 px wide.</div>
      </div>`)})
  await renderPage({page, dir: REVIEW, name: 'review-small', width: 1080, height: 1350,
    html: reviewPage(`<h1>Actual size: 320 × 180</h1><div class="small">${THUMBS.map(t =>
      thumbImg(t.file, 320)).join('')}</div>`)})
  for (const t of THUMBS)
    await renderPage({page, dir: REVIEW, name: `review-${t.file}`, width: 1080, height: 1350,
      html: reviewPage(`<h1>${t.n}. ${t.title}</h1>${thumbImg(t.file, 1000)}
        <h2>Search size (320 × 180) and sidebar size (168 × 94)</h2>
        <div class="row">${thumbImg(t.file, 320)}${thumbImg(t.file, 168)}</div>`)})
}

const reviewPage = body => `<!doctype html><html><head><meta charset="utf-8">
  <style>${STYLE}${REVIEW_STYLE}</style></head><body class="review">${body}</body></html>`

const renderPage = async ({page, dir, name, html, width, height}) => {
  const htmlFile = join(HTML, `${name}.html`)
  await writeFile(htmlFile, html)
  await page.setViewportSize({width, height})
  await page.goto(`file://${htmlFile}`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  await page.screenshot({path: join(dir, `${name}.jpg`), type: 'jpeg', quality: 90})
}

const reportSizes = async () => {
  for (const {file} of THUMBS) {
    const {size} = await stat(join(OUT, `${file}.jpg`))
    console.log(`${file}.jpg ${(size / 1024).toFixed(0)} KB`)
  }
}

const STYLE = `
  @font-face {font-family: Figtree; font-weight: 300 900;
    src: url("file://${FONTS}/figtree-latin-variable.woff2") format("woff2");}
  :root {--bg: #0b1117; --s1: #141c24; --s2: #1c2630; --s3: #26323e; --s4: #303d4a;
    --well: #070b0f; --hair: rgba(255,255,255,0.08); --t1: #f2f5f7; --t2: #a9b4be;
    --t3: #8d9aa7; --primary: #5ce1c6; --on-primary: #04201a; --live: #ff4d4f;}
  * {box-sizing: border-box; margin: 0;}
  body {background: var(--bg); font-family: Figtree, sans-serif; color: var(--t1);}
  .thumb {position: relative; width: 1280px; height: 720px; overflow: hidden;
    background:
      radial-gradient(640px 520px at 100% 0%, rgba(92,225,198,0.10), transparent 70%),
      radial-gradient(560px 420px at 0% 100%, rgba(59,164,255,0.07), transparent 70%),
      var(--bg);}
  .thumb > *, .stage > * {position: absolute;}
  .stage {inset: 0;}
  .plate {left: ${GRID.stageX - GRID.plateInset}px; top: ${GRID.top - GRID.plateInset}px;
    right: -40px; bottom: -40px; border-radius: 20px; border: 1px solid var(--hair);
    background: linear-gradient(160deg, rgba(92,225,198,0.07), transparent 45%),
      linear-gradient(180deg, var(--s1), #0f161d);}
  .headline {left: ${GRID.margin}px; top: ${GRID.top - 16}px; width: 520px; white-space: nowrap; z-index: 5;
    font-size: 96px; font-weight: 800; line-height: 1.0; letter-spacing: -0.02em;}
  .headline em {font-style: normal; color: var(--primary);}
  .headline p {margin-top: 24px; font-size: 34px; font-weight: 600; line-height: 1.2;
    letter-spacing: -0.005em; color: var(--t2);}
  .chips {left: ${GRID.margin}px; top: ${GRID.baseline - 12}px; display: flex; gap: 6px;}
  .chips i {width: 36px; height: 12px;}
  .chips i:nth-child(1) {background: #3ba4ff;}
  .chips i:nth-child(2) {background: #f28c28;}
  .chips i:nth-child(3) {background: #f5c542;}
  .crop {position: relative; overflow: hidden;}
  .crop img {position: absolute; max-width: none;}
  .bleed {border-radius: 16px 0 0 16px; overflow: hidden; border: 1px solid var(--hair);
    border-right: 0;}
  .well {width: 720px; border-radius: 16px 0 0 16px; overflow: hidden; background: var(--well);
    border: 1px solid var(--hair); border-right: 0;}
  .well-bar {height: 40px; display: flex; gap: 8px; align-items: center; padding: 0 16px;
    background: var(--s2);}
  .well-bar i {width: 12px; height: 12px; border-radius: 50%; background: var(--s4);}
  .sheet {border-radius: 20px; overflow: hidden; border: 1px solid var(--hair);}
  .pill {z-index: 6; display: flex; align-items: center; gap: 16px; height: 88px;
    padding: 0 40px 0 32px; border-radius: 12px; font-size: 48px; font-weight: 800;
    letter-spacing: -0.01em;}
  .pill.record {background: var(--live); color: #fff;}
  .pill.record i {width: 28px; height: 28px; border-radius: 50%; background: #fff;}
  .pill.done {background: var(--primary); color: var(--on-primary);}
  .pill.done i {width: 32px; height: 18px; border-left: 7px solid var(--on-primary);
    border-bottom: 7px solid var(--on-primary); transform: translateY(-6px) rotate(-45deg);}
  .tv {width: 700px;}
  .tv-screen {border: 12px solid var(--s3); border-radius: 16px; overflow: hidden;
    background: #000;}
  .tv-neck {width: 96px; height: 104px; margin: 0 auto; background: linear-gradient(var(--s3),
    var(--s2));}
  .tv-foot {width: 280px; height: 12px; margin: 0 auto; border-radius: 6px;
    background: var(--s3);}
  .laptop-screen {border: 10px solid var(--s3); border-bottom-width: 14px;
    border-radius: 16px 16px 0 0; overflow: hidden; background: var(--s1);}
  .laptop-base {height: 20px; margin-left: -32px; border-radius: 0 0 12px 12px;
    background: linear-gradient(var(--s4), var(--s3));}
  .device-label {margin-top: 16px; font-size: 26px; font-weight: 700; color: var(--t2);}
  .fetch-slab {position: relative; height: 72px; border-radius: 12px;
    background: linear-gradient(var(--s4), var(--s3));}
  .fetch-slab i {position: absolute; left: 24px; top: 30px; width: 12px; height: 12px;
    border-radius: 50%; background: var(--primary);}
  .fetch-slab s {position: absolute; right: 24px; top: 34px; width: 40%; height: 4px;
    border-radius: 2px; background: var(--s4);}
  .flying {z-index: 3; border-radius: 10px; overflow: hidden; border: 2px solid var(--t1);}
  .arc {left: 0; top: 0;}
  .folder {padding: 24px 24px 16px; height: 300px;}
  .folder-head {font-size: 20px; font-weight: 700; color: var(--t3); margin-bottom: 16px;
    letter-spacing: 0.02em;}
  .folder-row {display: flex; align-items: center; gap: 16px; height: 56px;
    font-size: 26px; font-weight: 700; white-space: nowrap;}
  .folder-row b {color: var(--primary); font-size: 26px; width: 20px;}
  .folder-row .crop {border-radius: 6px; flex: none;}`

const REVIEW_STYLE = `
  .review {width: 1080px; height: 1350px; padding: 34px 40px; overflow: hidden;}
  .review h1 {font-size: 40px; font-weight: 800; letter-spacing: -0.01em; margin-bottom: 24px;}
  .review h2 {font-size: 30px; font-weight: 700; color: #5ce1c6; margin: 26px 0 14px;}
  .review .row {display: flex; gap: 32px; align-items: flex-start;}
  .review img {border-radius: 12px;}
  .grid {display: grid; grid-template-columns: 470px 470px; gap: 20px 0;
    justify-content: space-between;}
  .card .title {font-size: 20px; font-weight: 700; line-height: 1.2; margin-top: 10px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
  .card.note {font-size: 22px; color: #8d9aa7; padding: 30px; line-height: 1.4;}
  .small {display: grid; grid-template-columns: 320px 320px 320px; gap: 30px 20px;}`

await main()
