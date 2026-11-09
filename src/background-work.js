import { AsyncLocalStorage } from 'node:async_hooks'

export const runAsBackgroundWork = ({ offline = false } = {}, work) => context.run({ offline }, work)

export const isBackgroundWork = () => Boolean(context.getStore())

export const onlineLookupsAllowed = () => !context.getStore()?.offline

const context = new AsyncLocalStorage()
