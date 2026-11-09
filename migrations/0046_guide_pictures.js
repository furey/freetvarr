export const up = async (knex) => {
  await knex.schema.createTable('guide_pictures', (t) => {
    t.text('source_url').primary()
    t.string('title_key').notNullable().index()
    t.string('host').notNullable().index()
    t.integer('w').notNullable()
    t.integer('h').notNullable()
    t.integer('bytes').notNullable()
    t.bigInteger('saved_at').notNullable()
    t.bigInteger('last_seen_at').notNullable().index()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('guide_pictures')
}
