const RELEASE_TAG = /^v?(\d+)\.(\d+)\.(\d+)$/

export const parseReleaseVersion = (tag) => {
  const match = RELEASE_TAG.exec(String(tag ?? '').trim())
  return match ? match.slice(1).map(Number) : null
}

export const compareVersions = (a, b) => {
  const left = parseReleaseVersion(a)
  const right = parseReleaseVersion(b)
  if (!left || !right) return 0
  const difference = left.map((part, index) => part - right[index]).find((delta) => delta !== 0)
  return Math.sign(difference ?? 0)
}

export const latestReleaseTag = (tags = []) =>
  tags
    .filter((tag) => parseReleaseVersion(tag))
    .reduce((latest, tag) => (!latest || compareVersions(tag, latest) > 0 ? tag : latest), null)

export const isNewerRelease = ({ current, latest }) =>
  Boolean(parseReleaseVersion(current) && parseReleaseVersion(latest)) && compareVersions(latest, current) > 0
