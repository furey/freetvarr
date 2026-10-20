export const up = async (knex) => {
  await knex.schema.createTable('show_nicknames', (t) => {
    t.increments('id').primary()
    t.string('show_key').notNullable()
    t.string('name').notNullable()
    t.string('name_key').notNullable()
    t.bigInteger('created_at').notNullable()
    t.unique(['show_key', 'name_key'])
  })
  await knex.schema.createTable('title_known_as', (t) => {
    t.string('title_key').primary()
    t.text('names_json').notNullable()
    t.string('source')
    t.bigInteger('expires_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('title_known_as')
  await knex.schema.dropTableIfExists('show_nicknames')
}
