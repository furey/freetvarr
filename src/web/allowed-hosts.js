export const allowedHostRowsOf = (state) => [
  ...(state?.hosts || []).map((name) => ({ name, fromEnv: false })),
  ...(state?.env_hosts || []).filter((name) => !(state?.hosts || []).includes(name)).map((name) => ({ name, fromEnv: true })),
]

export const isListLockedFor = (state) => Boolean(state?.current && !state.current.allowed)
