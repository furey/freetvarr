import sharp from 'sharp'

import { rasterTypeOf } from './raster-type.js'

export const POSTER_SHAPE = 'poster'

export const isPortraitSize = ({ width, height } = {}) => Boolean(width && height && height > width)

export const portraitOf = async (image) => {
  if (!image?.body) return null
  const size = await sharp(image.body).metadata().catch(() => ({}))
  return isPortraitSize(size) ? image : null
}

export const portraitPadOf = async (image) => {
  if (!image?.body || !rasterTypeOf(image.body)) return null
  const { width, height } = await sharp(image.body).metadata()
  if (!width || !height) return null
  if (isPortraitSize({ width, height })) return image
  const canvasWidth = Math.min(width, PORTRAIT_MAX_WIDTH)
  const canvasHeight = Math.round(canvasWidth * 3 / 2)
  const backdrop = await sharp(image.body)
    .resize({ width: canvasWidth, height: canvasHeight, fit: 'cover' })
    .blur(PORTRAIT_BLUR_SIGMA)
    .modulate({ brightness: PORTRAIT_BACKDROP_BRIGHTNESS })
    .toBuffer()
  const picture = await sharp(image.body).resize({ width: canvasWidth }).toBuffer()
  const body = await sharp(backdrop)
    .composite([{ input: picture, gravity: 'center' }])
    .jpeg({ quality: PORTRAIT_JPEG_QUALITY })
    .toBuffer()
  return { body, contentType: 'image/jpeg' }
}

export const showImageShapeFrom = (value) => (value === POSTER_SHAPE ? POSTER_SHAPE : 'landscape')

const PORTRAIT_MAX_WIDTH = 1000
const PORTRAIT_BLUR_SIGMA = 24
const PORTRAIT_BACKDROP_BRIGHTNESS = 0.55
const PORTRAIT_JPEG_QUALITY = 85
