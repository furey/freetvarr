export const up = async (knex) => {
  await knex.schema.createTable('show_artwork', (t) => {
    t.string('title_key').primary()
    t.text('sources_json').notNullable()
    t.bigInteger('expires_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('show_artwork')
}
