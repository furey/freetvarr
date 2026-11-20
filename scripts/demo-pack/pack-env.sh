PACK_MANIFEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/manifest.json"

pack_value() {
  node -e '
    const m = require(process.argv[1])
    const titleOf = (key) => {
      const title = m.titles.find((t) => t.key === key)
      if (!title) throw new Error(`demo pack has no title ${key}`)
      return title.title
    }
    console.log(new Function("m", "titleOf", `return ${process.argv[2]}`)(m, titleOf))
  ' "$PACK_MANIFEST" "$1"
}

SIMULATED_NOW=$(pack_value 'm.clock')
TZ=$(pack_value 'm.timeZone')
DEMO_SHOWS=$(pack_value "m.library.shows.map(titleOf).join('|')")
DEMO_FILMS=$(pack_value "[...m.library.films, ...m.library.plexFilms].map(titleOf).join('|')")
HERO_SHOWCASE=$(pack_value "m.tours.hero.map(titleOf).join('|')")
SOCIAL_HERO_TITLE=$(pack_value 'titleOf(m.tours.hero[0])')
FILM_TITLE=$(pack_value 'titleOf(m.tours.film)')
SERIES_TITLE=$(pack_value 'titleOf(m.tours.series)')
SHOW_TITLE=$(pack_value 'titleOf(m.tours.show)')
SEARCH_QUERY=$(pack_value 'm.tours.search')
OTHER_TITLES_SERIES=$(pack_value 'titleOf(m.tours.otherTitlesSeries)')
HIDDEN_TITLES=''
export SIMULATED_NOW TZ DEMO_SHOWS DEMO_FILMS HERO_SHOWCASE SOCIAL_HERO_TITLE FILM_TITLE SERIES_TITLE SHOW_TITLE SEARCH_QUERY OTHER_TITLES_SERIES HIDDEN_TITLES
