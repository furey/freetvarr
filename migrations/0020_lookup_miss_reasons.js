export const up = async (knex) => {
  for (const table of ['programme_ratings', 'programme_credits']) {
    await knex.schema.alterTable(table, (t) => {
      t.string('miss_reason').nullable()
    })
  }
}

export const down = async (knex) => {
  for (const table of ['programme_ratings', 'programme_credits']) {
    await knex.schema.alterTable(table, (t) => {
      t.dropColumn('miss_reason')
    })
  }
}
