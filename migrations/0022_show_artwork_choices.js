export const up = async (knex) => {
  await knex.schema.createTable('show_artwork_choices', (t) => {
    t.string('show_key').notNullable()
    t.string('kind').notNullable()
    t.text('origin').notNullable()
    t.string('source').notNullable()
    t.bigInteger('chosen_at').notNullable()
    t.primary(['show_key', 'kind'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('show_artwork_choices')
}
