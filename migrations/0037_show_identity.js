export const up = async (knex) => {
  await knex.schema.alterTable('shows', (t) => {
    t.string('tvdb_id')
    t.string('tmdb_id')
    t.string('database_title')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('shows', (t) => {
    t.dropColumn('tvdb_id')
    t.dropColumn('tmdb_id')
    t.dropColumn('database_title')
  })
}
