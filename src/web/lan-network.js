export const withBrowserNetwork = ({ prefixes, host }) => {
  const network = privateNetworkOf(host)
  if (!network || prefixes.some((prefix) => coversAddress({ prefix, address: host }))) return prefixes
  return [network, ...prefixes]
}

const privateNetworkOf = (host) => {
  const octets = ipv4Octets(host)
  if (!octets || !isPrivate(octets)) return null
  return `${octets.slice(0, 3).join('.')}.0/24`
}

const coversAddress = ({ prefix, address }) => {
  const [base, bitsText] = String(prefix).trim().split('/')
  const baseOctets = ipv4Octets(base)
  const addressOctets = ipv4Octets(address)
  const bits = Number(bitsText ?? 32)
  if (!baseOctets || !addressOctets || !(bits >= 0 && bits <= 32)) return false
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return ((toNumber(baseOctets) & mask) >>> 0) === ((toNumber(addressOctets) & mask) >>> 0)
}

const isPrivate = ([a, b]) => a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)

const ipv4Octets = (text) => {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(text ?? '').trim())
  if (!match) return null
  const octets = match.slice(1).map(Number)
  return octets.every((n) => n <= 255) ? octets : null
}

const toNumber = (octets) => octets.reduce((sum, n) => sum * 256 + n, 0)
