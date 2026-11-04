export const createClearTimer = ({ clear, setTimer = setTimeout, clearTimer = clearTimeout }) => {
  let timer = null
  return (ms = 0) => {
    clearTimer(timer)
    timer = null
    if (ms > 0) timer = setTimer(() => {
      timer = null
      clear()
    }, ms)
  }
}
