export const up = async (knex) => {
  await knex.schema.createTable('title_labels', (t) => {
    t.string('show_key').notNullable()
    t.string('labeller_version').notNullable()
    t.string('status').notNullable()
    t.text('labels_json').notNullable().defaultTo('{}')
    t.float('confidence')
    t.bigInteger('fetched_at').notNullable()
    t.bigInteger('retry_after')
    t.primary(['show_key', 'labeller_version'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('title_labels')
}
