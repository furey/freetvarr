export const up = async (knex) => {
  await knex.schema.createTable('artwork_lookups', (t) => {
    t.string('lookup_key').primary()
    t.text('sources_json').notNullable()
    t.string('reference')
    t.bigInteger('expires_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('artwork_lookups')
}
