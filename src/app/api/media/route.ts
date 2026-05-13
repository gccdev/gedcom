import { auth } from '@auth'
import { get } from '@vercel/blob'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(req.url)
  const blobUrl = searchParams.get('url')
  if (!blobUrl) return new Response('Missing url parameter', { status: 400 })

  const result = await get(blobUrl, { access: 'private' })
  if (!result) return new Response('Not found', { status: 404 })

  // result.stream is a ReadableStream of the private blob content
  const contentType = result.headers.get('content-type') ?? 'application/octet-stream'
  return new Response(result.stream, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
