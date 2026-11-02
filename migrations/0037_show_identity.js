export const up = async (knex) => {
  await knex.schema.alterTable('shows', (t) => {
    t.string('tvmaze_id')
    t.string('tvdb_id')
    t.string('tmdb_id')
    t.string('database_title')
    t.string('identity_state')
  })
  await knex.schema.createTable('show_identity_picks', (t) => {
    t.string('title_key').notNullable()
    t.string('network_family').notNullable()
    t.string('tvmaze_id').notNullable()
    t.string('tvdb_id')
    t.string('tmdb_id')
    t.string('database_title').notNullable()
    t.bigInteger('picked_at').notNullable()
    t.primary(['title_key', 'network_family'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('show_identity_picks')
  await keepingShowLinks(knex, () => knex.schema.alterTable('shows', (t) => {
    t.dropColumn('tvmaze_id')
    t.dropColumn('tvdb_id')
    t.dropColumn('tmdb_id')
    t.dropColumn('database_title')
    t.dropColumn('identity_state')
  }))
}

const keepingShowLinks = async (knex, rebuildShows) => {
  await knex.raw('create temp table kept_show_links as select recording_id, show_id from recordings where show_id is not null and show_id in (select id from shows)')
  await rebuildShows()
  await knex.raw(`update recordings
    set show_id = (select show_id from kept_show_links where kept_show_links.recording_id = recordings.recording_id)
    where recording_id in (select recording_id from kept_show_links)`)
  await knex.raw('drop table kept_show_links')
}
