export const isCsrfRejection = (err) => err?.status === 403 && /csrf/i.test(String(err?.message ?? ''))

export const withCsrfRetry = async ({ send, tokenOf }) => {
  try {
    return await send(await tokenOf({ force: false }))
  } catch (err) {
    if (!isCsrfRejection(err)) throw err
    return send(await tokenOf({ force: true }))
  }
}
