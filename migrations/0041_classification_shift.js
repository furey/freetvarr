const TABLES = [
  { table: 'programme_classifications', column: 'label' },
  { table: 'programme_categories', column: 'category' },
]

const rebuild = async ({ knex, table, column, withShift, copySql }) => {
  const next = `${table}_next`
  const index = `${table}_start_ms_index`
  await knex.raw('DROP INDEX IF EXISTS ??', [index])
  await knex.schema.createTable(next, (t) => {
    t.string('title_key').notNullable()
    t.bigInteger('start_ms').notNullable()
    if (withShift) t.integer('shift_hours').notNullable().defaultTo(0)
    t.string(column).notNullable()
    t.primary(withShift ? ['title_key', 'start_ms', 'shift_hours'] : ['title_key', 'start_ms'])
    t.index(['start_ms'], index)
  })
  await knex.raw(copySql, [next, column, column, table])
  await knex.schema.dropTable(table)
  await knex.schema.renameTable(next, table)
}

export const up = async (knex) => {
  for (const { table, column } of TABLES) {
    await rebuild({
      knex,
      table,
      column,
      withShift: true,
      copySql: 'INSERT INTO ?? (title_key, start_ms, ??, shift_hours) SELECT title_key, start_ms, ??, 0 FROM ??',
    })
  }
}

export const down = async (knex) => {
  for (const { table, column } of TABLES) {
    await rebuild({
      knex,
      table,
      column,
      withShift: false,
      copySql: 'INSERT INTO ?? (title_key, start_ms, ??) SELECT title_key, start_ms, ?? FROM ?? WHERE shift_hours = 0',
    })
  }
}
