export const up = async (knex) => {
  await knex.schema.createTable('picture_checks', (t) => {
    t.text('source_url').primary()
    t.string('hash', 16).notNullable().index()
    t.float('clear_share').notNullable()
    t.text('families').notNullable().defaultTo('')
    t.bigInteger('checked_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('picture_checks')
}
