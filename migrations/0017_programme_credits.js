export const up = async (knex) => {
  await knex.schema.createTable('programme_credits', (t) => {
    t.string('lookup_key').primary()
    t.text('found_json').notNullable()
    t.bigInteger('expires_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('programme_credits')
}
