import { getSession } from '@/lib/session'
import { isBlobUrl, mediaHeaders } from '@/lib/media-response'
import { get } from '@vercel/blob'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const blobUrl = searchParams.get('url')
  if (!blobUrl) return new Response('Missing url parameter', { status: 400 })
  if (!isBlobUrl(blobUrl)) return new Response('Invalid blob URL', { status: 400 })

  try {
    const result = await get(blobUrl, { access: 'private' })
    if (!result) return new Response('Not found', { status: 404 })

    return new Response(result.stream, { headers: mediaHeaders(result.headers.get('content-type')) })
  } catch (err) {
    console.error('[media proxy] blob fetch failed:', err)
    return new Response('Failed to fetch media', { status: 502 })
  }
}
