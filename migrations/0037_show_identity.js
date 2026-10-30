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
  await knex.schema.alterTable('shows', (t) => {
    t.dropColumn('tvmaze_id')
    t.dropColumn('tvdb_id')
    t.dropColumn('tmdb_id')
    t.dropColumn('database_title')
    t.dropColumn('identity_state')
  })
}
