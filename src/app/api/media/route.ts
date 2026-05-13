import { auth } from '@auth'
import { get } from '@vercel/blob'

const ALLOWED_BLOB_HOSTNAME = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const blobUrl = searchParams.get('url')
  if (!blobUrl) return new Response('Missing url parameter', { status: 400 })

  // Validate the URL is from Vercel Blob (prevents SSRF)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(blobUrl)
  } catch {
    return new Response('Invalid url parameter', { status: 400 })
  }
  if (!ALLOWED_BLOB_HOSTNAME.test(parsedUrl.hostname)) {
    return new Response('Invalid blob URL', { status: 400 })
  }

  try {
    const result = await get(blobUrl, { access: 'private' })
    if (!result) return new Response('Not found', { status: 404 })

    const contentType = result.headers.get('content-type') ?? 'application/octet-stream'
    return new Response(result.stream, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err) {
    console.error('[media proxy] blob fetch failed:', err)
    return new Response('Failed to fetch media', { status: 502 })
  }
}
