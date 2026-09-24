import jsQR from 'jsqr'
import sharp from 'sharp'

/**
 * Independently decodes a QR PNG.
 *
 * Test-only tooling: `jsqr` is a devDependency and is never used by the application. It
 * exists so a test can read the bytes the application actually stored using a **different
 * library** from the one that generated them, which is what makes the assertion evidence
 * rather than a re-read of our own encoder output.
 *
 * `jsqr` requires exactly four bytes per pixel and ignores alpha, so the PNG is expanded
 * to raw RGBA first and the channel count is asserted rather than assumed.
 */
export async function decodeQrPng(png: Buffer): Promise<string> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  if (info.channels !== 4) {
    throw new Error(`expected RGBA pixels, received ${info.channels} channels`)
  }

  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  if (decoded === null) {
    throw new Error('no QR code could be decoded from the image')
  }

  return decoded.data
}
