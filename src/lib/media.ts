import type { Individual } from '@/lib/queries'

/**
 * Returns a proxy URL for a private Vercel Blob.
 * @vercel/blob v2.x has no signed URL API; access control is enforced by
 * the /api/media session-gated proxy route.
 */
export async function signBlobUrl(blobUrl: string): Promise<string> {
  return `/api/media?url=${encodeURIComponent(blobUrl)}`
}

/** Replaces raw blob URL on an Individual with a proxied URL. */
export async function signIndividual(ind: Individual | null): Promise<Individual | null> {
  if (!ind || !ind.photoBlobUrl) return ind
  return { ...ind, photoBlobUrl: await signBlobUrl(ind.photoBlobUrl) }
}
