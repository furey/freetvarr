export const up = async (knex) => {
  await knex.schema.createTable('watchlist', (t) => {
    t.increments('id').primary()
    t.string('title').notNullable()
    t.string('title_key').notNullable().unique()
    t.string('mode').notNullable().defaultTo('notify')
    t.string('channel_id')
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    t.bigInteger('seen_through')
    t.timestamp('fulfilled_at')
    t.string('series_link_id')
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('watchlist')
}
