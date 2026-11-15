export const up = async (knex) => {
  await knex.schema.createTable('title_kinds', (t) => {
    t.string('show_key').primary()
    t.string('kind').notNullable()
    t.string('source').notNullable()
    t.text('evidence_json').notNullable().defaultTo('{}')
    t.bigInteger('decided_at').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('title_kinds')
}
