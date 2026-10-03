export const up = async (knex) => {
  await knex.schema.createTable('guide_programs', (t) => {
    t.string('channel_id').notNullable()
    t.bigInteger('start').notNullable()
    t.bigInteger('end').notNullable()
    t.string('program_id').notNullable()
    t.string('dvr_state')
    t.string('dvr_uuid')
    t.text('program_json').notNullable()
    t.primary(['channel_id', 'start'])
    t.index(['end'])
    t.index(['program_id'])
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('guide_programs')
}
