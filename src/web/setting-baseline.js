export const createSettingBaseline = () => {
  let loaded = false
  let baseline
  const remember = (value) => {
    loaded = true
    baseline = value
  }
  const isChanged = (value) => loaded && value !== baseline
  return { remember, isChanged }
}
