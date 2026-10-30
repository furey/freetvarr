export const up = async (knex) => {
  await knex.raw('create index if not exists `pending_skips_end_ms_index` on `pending_skips` (`end_ms`)')
}

export const down = async (knex) => {
  await knex.raw('drop index if exists `pending_skips_end_ms_index`')
}
