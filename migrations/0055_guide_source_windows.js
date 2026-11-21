export const up = async (knex) => {
  await knex.schema.createTable('guide_source_windows', (t) => {
    t.string('source').notNullable()
    t.string('triplet').notNullable()
    t.bigInteger('window_start').notNullable()
    t.integer('format').notNullable()
    t.bigInteger('fetched_at').notNullable()
    t.bigInteger('expires_at').notNullable()
    t.text('programmes_json').notNullable()
    t.primary(['source', 'triplet', 'window_start'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('guide_source_windows')
}
