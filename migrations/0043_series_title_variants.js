export const up = async (knex) => {
  await knex.schema.createTable('series_title_variants', (t) => {
    t.increments('id').primary()
    t.string('series_key').notNullable()
    t.string('title').notNullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.unique(['series_key', 'title'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('series_title_variants')
}
