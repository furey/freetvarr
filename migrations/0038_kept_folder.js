export const up = async (knex) => {
  await knex.schema.alterTable('shows', (t) => {
    t.string('kept_folder')
  })
}

export const down = async (knex) => {
  await knex.schema.alterTable('shows', (t) => {
    t.dropColumn('kept_folder')
  })
}
