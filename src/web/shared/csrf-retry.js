export const isCsrfRejection = (err) => err?.status === 403 && /csrf/i.test(String(err?.message ?? ''))

export const withCsrfRetry = async ({ send, tokenOf }) => {
  const token = await tokenOf({ force: false })
  try {
    return await send(token)
  } catch (err) {
    if (!isCsrfRejection(err)) throw err
    return send(await tokenOf({ force: true, rejected: token }))
  }
}

export const sharedCsrfToken = (fetchToken) => {
  let current = null
  let pending = null
  const refresh = () => {
    pending ??= fetchToken()
      .then((token) => { current = token; return token })
      .finally(() => { pending = null })
    return pending
  }
  return async ({ force = false, rejected = null } = {}) => {
    if (pending) return pending
    const isReplaced = current !== rejected
    if (current && (!force || isReplaced)) return current
    return refresh()
  }
}
