export const LOG_STATUSES = ['all', 'done', 'not_imported', 'replaced', 'not_in_library', 'partial', 'failed', 'skipped', 'importing']

export const LOG_SINCE_OPTIONS = ['all', '1h', '24h', '7d', '30d', '90d']

export const LOG_DELETED_OPTIONS = ['all', 'on_tvh', 'deleted']

export const logFiltersFromHash = (hash = '') => {
  const query = new URLSearchParams(String(hash).split('?')[1] || '')
  return {
    status: pick({ value: query.get('status'), options: LOG_STATUSES }),
    since: pick({ value: query.get('since'), options: LOG_SINCE_OPTIONS }),
    deleted: pick({ value: query.get('deleted'), options: LOG_DELETED_OPTIONS }),
  }
}

const pick = ({ value, options }) => (options.includes(value) ? value : 'all')
