export const up = async (knex) => {
  await knex.schema.createTable('job_runs', (t) => {
    t.string('id').primary()
    t.string('kind').notNullable()
    t.bigInteger('finished_at').notNullable().index()
    t.text('run_json').notNullable()
  })
}

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('job_runs')
}
