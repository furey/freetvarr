export const up = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.text('genres_json')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('recordings', (t) => {
    t.dropColumn('genres_json')
  })
}
