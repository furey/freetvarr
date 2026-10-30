export const up = async (knex) => {
  await knex.schema.createTable('external_ids', (t) => {
    t.string('title_key').notNullable()
    t.string('kind').notNullable()
    t.string('source').notNullable()
    t.string('tvdb_id')
    t.string('tmdb_id')
    t.string('imdb_id')
    t.bigInteger('seen_at').notNullable()
    t.primary(['title_key', 'kind', 'source'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('external_ids')
}
