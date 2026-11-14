/**
 * What the media proxy will accept and how it serves it. Pure, so it is
 * unit-tested without the Blob SDK.
 */

/** Vercel Blob store hosts: `<storeid>.private.` for private stores, `.public.` for public ones. */
const BLOB_HOSTNAME = /^[a-z0-9]+\.(private|public)\.blob\.vercel-storage\.com$/

/** True only for an https URL on a Vercel Blob store host (blocks SSRF). */
export function isBlobUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'https:' && !url.username && !url.password && BLOB_HOSTNAME.test(url.hostname)
}

/** Types a browser may render from this origin. SVG is left out: it can run script. */
const INLINE_TYPES = /^(image\/(jpeg|png|gif|webp|bmp|tiff|avif)|application\/pdf)$/

/**
 * Response headers for a proxied blob. Anything that is not a known image or
 * PDF type is sent as a download, so a stray HTML or SVG blob can never run as
 * a page on this origin.
 */
export function mediaHeaders(blobContentType: string | null): Record<string, string> {
  const type = (blobContentType ?? '').split(';')[0].trim().toLowerCase()
  const inline = INLINE_TYPES.test(type)
  return {
    'Content-Type': inline ? type : 'application/octet-stream',
    'Content-Disposition': inline ? 'inline' : 'attachment',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=300',
  }
}
