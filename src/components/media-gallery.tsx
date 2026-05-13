'use client'

import { useState, useEffect } from 'react'

interface MediaItem {
  id: number
  blobUrl: string
  mediaType: string
  title: string | null
}

export default function MediaGallery({ items }: { items: MediaItem[] }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!lightboxUrl) return
    // Prevent body scroll while lightbox is open
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxUrl(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKey)
    }
  }, [lightboxUrl])

  if (items.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map(item =>
          item.mediaType === 'photo' ? (
            <button
              key={item.id}
              onClick={() => setLightboxUrl(item.blobUrl)}
              className="aspect-square overflow-hidden rounded-lg border border-slate-200 hover:border-indigo-300 transition"
            >
              <img
                src={item.blobUrl}
                alt={item.title ?? ''}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <a
              key={item.id}
              href={item.blobUrl}
              target="_blank"
              rel="noreferrer"
              className="aspect-square flex flex-col items-center justify-center rounded-lg border border-slate-200 hover:border-indigo-300 bg-slate-50 gap-1 transition"
            >
              <span className="text-2xl">📄</span>
              <span className="text-[10px] text-slate-500 px-1 text-center truncate w-full">
                {item.title ?? 'Document'}
              </span>
            </a>
          )
        )}
      </div>

      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-full max-w-full rounded object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-slate-300"
            aria-label="Close lightbox"
          >
            ×
          </button>
        </div>
      )}
    </>
  )
}
