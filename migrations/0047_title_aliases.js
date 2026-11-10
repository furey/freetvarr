export const up = async (knex) => {
  await knex.schema.createTable('title_aliases', (t) => {
    t.increments('id').primary()
    t.string('source').notNullable()
    t.string('source_title').notNullable()
    t.string('title')
    t.string('kind').notNullable()
    t.bigInteger('first_seen_at').notNullable()
    t.bigInteger('last_seen_at').notNullable().index()
    t.unique(['source', 'source_title'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('title_aliases')
}
