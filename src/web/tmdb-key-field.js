export const saveOnEnterOf = ({ typedKey, busy }) => Boolean(String(typedKey ?? '').trim()) && !busy
