/**
 * Returns a signed-style proxy URL for a private Vercel Blob.
 *
 * @vercel/blob v2.x does not export generateSignedDownloadUrl or any
 * equivalent function for creating short-lived signed URLs. Private blobs
 * require server-side access via the `get()` helper. This function wraps the
 * blob URL in an internal /api/media proxy route that enforces session auth
 * and streams the blob content server-side.
 *
 * The `expiresIn` parameter is accepted for API compatibility but is currently
 * unused — access is controlled by the session cookie on the proxy route.
 */
export async function signBlobUrl(
  blobUrl: string,
  expiresIn = 300,
): Promise<string> {
  void expiresIn
  return `/api/media?url=${encodeURIComponent(blobUrl)}`
}
