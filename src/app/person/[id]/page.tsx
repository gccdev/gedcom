import { auth } from '@auth'
import { redirect, notFound } from 'next/navigation'
import { getPersonDetail, Individual } from '@/lib/queries'
import { signBlobUrl, signIndividual } from '@/lib/media'
import Link from 'next/link'
import MediaGallery from '@/components/media-gallery'

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/auth/signin')

  const { id } = await params
  const raw = await getPersonDetail(id)
  if (!raw) notFound()

  const signedMedia = await Promise.all(
    raw.media.map(async m => ({ ...m, blobUrl: await signBlobUrl(m.blobUrl) }))
  )

  const [father, mother] = await Promise.all([
    signIndividual(raw.father),
    signIndividual(raw.mother),
  ])
  const signedSpouses = await Promise.all(raw.spouses.map(signIndividual))
  const signedChildren = await Promise.all(raw.children.map(signIndividual))

  const firstPhoto = signedMedia.find(m => m.mediaType === 'photo')

  function FamilyRow({ person, label }: { person: Individual | null; label: string }) {
    if (!person) return null
    return (
      <div className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
        <span className="text-sm text-slate-500 w-16 shrink-0">{label}</span>
        <Link href={`/tree?id=${person.id}`} className="text-sm text-indigo-600 hover:underline truncate">
          {person.fullName}
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8 overflow-y-auto h-full">
      <Link href="/tree" className="text-sm text-slate-500 hover:text-slate-800">← Back to tree</Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        {firstPhoto && (
          <img
            src={firstPhoto.blobUrl}
            alt={raw.fullName}
            className="w-20 h-20 rounded-full object-cover border border-slate-200 flex-shrink-0"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{raw.fullName}</h1>
          {raw.birthDate && (
            <p className="text-sm text-slate-500 mt-1">
              Born {raw.birthDate}{raw.birthPlace && ` · ${raw.birthPlace}`}
            </p>
          )}
          {raw.deathDate && (
            <p className="text-sm text-slate-500">
              Died {raw.deathDate}{raw.deathPlace && ` · ${raw.deathPlace}`}
            </p>
          )}
          {raw.burialDate && (
            <p className="text-sm text-slate-500">
              Buried {raw.burialDate}{raw.burialPlace && ` · ${raw.burialPlace}`}
            </p>
          )}
        </div>
      </div>

      {/* Life Events */}
      {raw.events.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Life Events</h2>
          <ul className="space-y-1.5">
            {raw.events.map((e, i) => (
              <li key={i} className="flex gap-4 text-sm">
                <span className="text-slate-500 capitalize w-20 shrink-0">{e.type}</span>
                <span className="text-slate-800">
                  {e.date}
                  {e.place && ` · ${e.place}`}
                  {e.description && e.description !== e.type && ` — ${e.description}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Family */}
      {(father || mother || signedSpouses.some(Boolean) || signedChildren.some(Boolean)) && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Family</h2>
          <div className="bg-white border border-slate-200 rounded-lg px-4">
            <FamilyRow person={father} label="Father" />
            <FamilyRow person={mother} label="Mother" />
            {signedSpouses.map((s, i) => s && <FamilyRow key={i} person={s} label="Spouse" />)}
            {signedChildren.map((c, i) => c && <FamilyRow key={i} person={c} label="Child" />)}
          </div>
        </section>
      )}

      {/* Notes */}
      {raw.notes && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Notes</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{raw.notes}</p>
        </section>
      )}

      {/* Media */}
      {signedMedia.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Photos & Documents ({signedMedia.length})
          </h2>
          <MediaGallery items={signedMedia} />
        </section>
      )}
    </div>
  )
}
