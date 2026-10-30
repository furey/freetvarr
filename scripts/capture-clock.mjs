const offsetMs = Number(process.env.CAPTURE_CLOCK_OFFSET_MS) || 0

if (offsetMs) {
  const RealDate = Date
  const shiftedNow = () => RealDate.now() + offsetMs
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args)
      else super(shiftedNow())
    }

    static now() {
      return shiftedNow()
    }
  }
  globalThis.Date = ShiftedDate
  console.log(`[capture-clock] server clock set to ${new RealDate(shiftedNow()).toString()}`)
}
