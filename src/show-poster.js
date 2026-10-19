import sharp from 'sharp'

export const POSTER_SHAPE = 'poster'

export const isPortraitSize = ({ width, height } = {}) => Boolean(width && height && height > width)

export const portraitOf = async (image) => {
  if (!image?.body) return null
  const size = await sharp(image.body).metadata().catch(() => ({}))
  return isPortraitSize(size) ? image : null
}

export const showImageShapeFrom = (value) => (value === POSTER_SHAPE ? POSTER_SHAPE : 'landscape')
