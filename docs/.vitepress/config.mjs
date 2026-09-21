import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const repo = 'https://github.com/furey/freetvarr'
const site = 'https://furey.github.io/freetvarr/'

export default withMermaid(defineConfig({
  base: '/freetvarr/',
  lang: 'en-AU',
  title: 'freetvarr',
  description:
    'Sync TVHeadend recordings into Plex. A self-hosted bridge for Australian free-to-air TV, recorded by TVHeadend from an HDHomeRun tuner.',
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
    ['meta', { name: 'color-scheme', content: 'dark' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'freetvarr' }],
    ['meta', { property: 'og:title', content: 'freetvarr' }],
    ['meta', { property: 'og:description', content: 'Sync TVHeadend recordings into Plex.' }],
    ['meta', { property: 'og:url', content: site }],
    ['meta', { name: 'twitter:card', content: 'summary' }]
  ],

  themeConfig: {
    siteTitle: 'freetvarr',

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'Reference', link: '/reference/', activeMatch: '/(reference/|deep-dive)' }
    ],

    sidebar: [
      {
        text: 'Start here',
        collapsed: false,
        items: [
          { text: 'What freetvarr is', link: '/guide/' },
          { text: 'Hardware', link: '/guide/hardware' },
          { text: 'TVHeadend', link: '/guide/tvheadend' },
          { text: 'Getting started', link: '/guide/getting-started' }
        ]
      },
      {
        text: 'Using freetvarr',
        collapsed: false,
        items: [
          { text: 'TV Guide', link: '/guide/tv-guide' },
          { text: 'Following shows', link: '/guide/following-shows' },
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
          { text: 'Delete from TVHeadend', link: '/guide/delete-from-tvheadend' },
          { text: 'Live TV', link: '/guide/live-tv' }
        ]
      },
      {
        text: 'Coming from Fetch',
        collapsed: false,
        items: [
          { text: 'Migrating from Fetch', link: '/guide/migrating-from-fetch' }
        ]
      },
      {
        text: 'Help',
        collapsed: false,
        items: [
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' }
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
