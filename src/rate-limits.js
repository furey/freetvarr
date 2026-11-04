import rateLimit from 'express-rate-limit'

export const RATE_LIMITED_MESSAGE = 'Too many tries in a minute. Wait a moment, then try again.'

export const ROW_ACTION_LIMIT = 30
export const SETUP_CHECK_LIMIT = 20
export const EPG_LIMIT = 60

export const createRateLimiter = ({ limit, windowMs = 60_000 }) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: RATE_LIMITED_MESSAGE, code: 'rate-limited' },
})
