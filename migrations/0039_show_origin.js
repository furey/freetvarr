export const up = async (knex) => {
  await knex.schema.alterTable('shows', (t) => {
    t.string('origin').notNullable().defaultTo('user')
  })
  await knex('shows').where({ identity_state: 'none' }).update({ origin: 'auto' })
  await knex.schema.alterTable('series_evidence', (t) => {
    t.string('database_ids')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('series_evidence', (t) => {
    t.dropColumn('database_ids')
  })
  await knex.schema.alterTable('shows', (t) => {
    t.dropColumn('origin')
  })
}
