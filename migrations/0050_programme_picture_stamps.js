export const up = async (knex) => {
  await knex.schema.createTable('programme_picture_stamps', (t) => {
    t.string('show_key').primary()
    t.string('stamp').notNullable()
    t.bigInteger('changed_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('programme_picture_stamps')
}
