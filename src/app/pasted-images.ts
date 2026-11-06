import type { Image } from '../chat/model'

/** Claude scales anything longer down to this; sending more only costs bytes. */
const LONG_EDGE = 1568
/** 5 MB once in base64, Claude's limit per image. */
const MAX_BYTES = 3.75 * 1024 * 1024
/** What Claude reads as is; anything else is redrawn as PNG. */
const TAKEN = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** The images on the clipboard of a paste, as files (none for a text paste). */
export const clipboardImages = (data: DataTransfer): File[] =>
  [...data.items]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)

async function base64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'))
    reader.readAsDataURL(blob)
  })
  return url.slice(url.indexOf(',') + 1)
}

/** An image file as Claude takes it: as it is when it can, else scaled down as PNG. */
export async function readImage(file: File): Promise<Image> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && TAKEN.has(file.type) && file.size <= MAX_BYTES) {
    bitmap.close()
    return { data: await base64(file), mediaType: file.type }
  }
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale)
  )
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // A photo can stay too heavy as PNG: Claude refuses images over 5 MB once encoded.
  let blob = await canvas.convertToBlob()
  if (blob.size > MAX_BYTES) blob = await canvas.convertToBlob({ quality: 0.9, type: 'image/jpeg' })
  return { data: await base64(blob), mediaType: blob.type }
}

export const imageUrl = (image: Image) => `data:${image.mediaType};base64,${image.data}`
