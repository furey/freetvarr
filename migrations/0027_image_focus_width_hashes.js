export const up = async (knex) => {
  await knex.schema.alterTable('image_focus', (t) => {
    t.text('width_hashes').nullable()
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('image_focus', (t) => {
    t.dropColumn('width_hashes')
  })
}
