export const up = async (knex) => {
  await knex.schema.alterTable('watchlist', (t) => {
    t.integer('lead_time').nullable()
    t.integer('lag_time').nullable()
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('watchlist', (t) => {
    t.dropColumn('lead_time')
    t.dropColumn('lag_time')
  })
}
