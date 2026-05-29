// Image upload helpers: size limit + canvas-based compression.

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024  // 3MB hard limit on input
export const MAX_DIMENSION   = 1280              // long-edge px after compress

/**
 * Compress an image File to <= MAX_DIMENSION on the long edge, JPEG quality 0.85.
 * Returns a new Blob with `name` property preserved.
 */
export async function compressImage(file: File): Promise<File | Blob> {
  if (!file.type.startsWith('image/')) return file
  if (file.size < 200 * 1024) return file  // small enough, skip

  const img = await fileToImage(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
  if (scale === 1 && file.size < 1024 * 1024) return file

  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(img.width  * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      const ext = 'jpg'
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const out = new File([blob!], `${baseName}.${ext}`, { type: 'image/jpeg' })
      resolve(out)
    }, 'image/jpeg', 0.85)
  })
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Extract storage path from a public Supabase Storage URL.
 * Returns null if URL is not a recognized storage URL.
 */
export function storagePath(publicUrl: string | null | undefined, bucket = 'plant-images'): string | null {
  if (!publicUrl) return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const i = publicUrl.indexOf(marker)
  if (i === -1) return null
  return publicUrl.slice(i + marker.length)
}
