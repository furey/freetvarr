import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const repo = 'https://github.com/furey/freetvarr'
const site = 'https://furey.github.io/freetvarr/'
const defaultSocialImage = {
  path: '/social/default.png',
  alt: 'Freetvarr: live TV in your browser, recordings in Plex'
}

const pageUrl = (relativePath) => {
  const path = relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
  return `${site}${path}`
}

const absoluteUrl = (path) => `${site}${path.replace(/^\//, '')}`

const socialTitle = ({ pageData, siteData }) => {
  const isHome = pageData.frontmatter.layout === 'home'
  return isHome || !pageData.title ? siteData.title : `${pageData.title} | ${siteData.title}`
}

const socialHead = ({ pageData, siteData }) => {
  const title = socialTitle({ pageData, siteData })
  const description = pageData.description || siteData.description
  const url = pageUrl(pageData.relativePath)
  const image = absoluteUrl(pageData.frontmatter.image ?? defaultSocialImage.path)
  const imageAlt = pageData.frontmatter.imageAlt ?? defaultSocialImage.alt
  return [
    ['link', { rel: 'canonical', href: url }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: siteData.title }],
    ['meta', { property: 'og:locale', content: 'en_AU' }],
    ['meta', { property: 'og:url', content: url }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:image', content: image }],
    ['meta', { property: 'og:image:type', content: 'image/png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: imageAlt }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: title }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: image }],
    ['meta', { name: 'twitter:image:alt', content: imageAlt }]
  ]
}

export default withMermaid(defineConfig({
  base: '/freetvarr/',
  lang: 'en-AU',
  title: 'Freetvarr',
  description:
    'Watch live TV in your browser and sync TVHeadend recordings into Plex. A self-hosted companion for TVHeadend and compatible tuner.',
  appearance: 'dark',
  cleanUrls: true,
  lastUpdated: true,
  metaChunk: true,
  sitemap: { hostname: site },

  rewrites: {
    'DEEP_DIVE.md': 'deep-dive.md'
  },

  markdown: {
    config: (md) => {
      md.core.ruler.before('normalize', 'strip-alert-title-br', (state) => {
        state.src = state.src.replace(
          /(\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])<br\s*\/?>/g,
          '$1'
        )
      })
    }
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/freetvarr/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#1a1611' }],
    ['meta', { name: 'color-scheme', content: 'dark' }]
  ],

  transformHead: ({ pageData, siteData }) => socialHead({ pageData, siteData }),

  themeConfig: {
    siteTitle: 'Freetvarr',

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/', activeMatch: '/(reference/|deep-dive)' }
    ],

    sidebar: [
      {
        text: 'Start here',
        collapsed: false,
        items: [
          { text: 'What Freetvarr is', link: '/guide/' },
          { text: 'Plex DVR instead', link: '/guide/plex-dvr' },
          { text: 'Hardware', link: '/guide/hardware' },
          { text: 'TVHeadend', link: '/guide/tvheadend' },
          { text: 'Getting started', link: '/guide/getting-started' }
        ]
      },
      {
        text: 'Using Freetvarr',
        collapsed: false,
        items: [
          { text: 'TV Guide', link: '/guide/tv-guide' },
          { text: 'Series', link: '/guide/series' },
          { text: 'Recordings', link: '/guide/recordings' },
          { text: 'Syncs', link: '/guide/syncs' },
          { text: 'Ad removal', link: '/guide/ad-removal' }
        ]
      },
      {
        text: 'Connect it up',
        collapsed: false,
        items: [
          { text: 'Plex', link: '/guide/plex' },
          { text: 'Remove from TVHeadend', link: '/guide/remove-from-tvheadend' },
          { text: 'Live TV', link: '/guide/live-tv' }
        ]
      },
      {
        text: 'Coming from Fetch',
        collapsed: false,
        items: [
          { text: 'Leaving Fetch TV', link: '/guide/leaving-fetch' },
          { text: 'From Fetcharr', link: '/guide/from-fetcharr' }
        ]
      },
      {
        text: 'Help',
        collapsed: false,
        items: [
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          { text: 'Doctor', link: '/guide/doctor' }
        ]
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/reference/' },
          { text: 'Technical deep dive', link: '/deep-dive' }
        ]
      }
    ],

    outline: { level: [2, 3], label: 'On this page' },

    socialLinks: [{ icon: 'github', link: repo }],

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub'
    },

    search: { provider: 'local' },

    lastUpdated: {
      text: 'Updated',
      formatOptions: { dateStyle: 'medium', timeStyle: 'short' }
    },

    docFooter: { prev: 'Previous', next: 'Next' },

    footer: {
      message: 'GPL-3.0-or-later. Not affiliated with or endorsed by SiliconDust, TVHeadend, or Plex.',
      copyright: `<a href="${repo}">Source on GitHub</a>`
    }
  },

  mermaid: {
    securityLevel: 'strict',
    flowchart: { useMaxWidth: true },
    themeVariables: { fontFamily: 'inherit' }
  }
}))
