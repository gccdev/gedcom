import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEmailAllowed, parseAllowedEmails } from '../src/lib/allowlist'
import { isAuthBypassed } from '../src/lib/auth-bypass'
import { isBlobUrl, mediaHeaders } from '../src/lib/media-response'
import { MAX_SEARCH_LENGTH, toLikeTerm } from '../src/lib/search-term'

afterEach(() => vi.unstubAllEnvs())

describe('sign-in allowlist', () => {
  it('fails closed when the list is unset or empty', () => {
    expect(isEmailAllowed('a@example.com', undefined)).toBe(false)
    expect(isEmailAllowed('a@example.com', ' , ')).toBe(false)
  })
  it('matches listed addresses regardless of case and spacing', () => {
    const list = ' A@Example.com, b@example.com '
    expect(parseAllowedEmails(list)).toEqual(new Set(['a@example.com', 'b@example.com']))
    expect(isEmailAllowed('a@example.COM', list)).toBe(true)
    expect(isEmailAllowed(' b@example.com ', list)).toBe(true)
  })
  it('rejects unlisted, partial and missing addresses', () => {
    const list = 'a@example.com'
    expect(isEmailAllowed('c@example.com', list)).toBe(false)
    expect(isEmailAllowed('a@example.com.evil.test', list)).toBe(false)
    expect(isEmailAllowed(null, list)).toBe(false)
    expect(isEmailAllowed('', list)).toBe(false)
  })
  it('reads AUTH_ALLOWED_EMAILS by default', () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', 'a@example.com')
    expect(isEmailAllowed('a@example.com')).toBe(true)
    expect(isEmailAllowed('b@example.com')).toBe(false)
  })
})

describe('local login bypass', () => {
  function env(overrides: Record<string, string> = {}) {
    const all = { AUTH_DEV_BYPASS: 'true', AUTH_BYPASS_BIND: 'loopback', VERCEL: '', ...overrides }
    for (const [key, value] of Object.entries(all)) vi.stubEnv(key, value)
  }
  it('is active only with every gate satisfied', () => {
    env()
    expect(isAuthBypassed('localhost:3000')).toBe(true)
    expect(isAuthBypassed('127.0.0.1')).toBe(true)
    expect(isAuthBypassed('[::1]:3000')).toBe(true)
  })
  it('is inert without the loopback bind marker, even for a localhost Host header', () => {
    env({ AUTH_BYPASS_BIND: '' })
    expect(isAuthBypassed('localhost:3000')).toBe(false)
  })
  it('is inert on Vercel, when not opted in, and for other hosts', () => {
    env({ VERCEL: '1' })
    expect(isAuthBypassed('localhost')).toBe(false)
    env({ AUTH_DEV_BYPASS: '1' })
    expect(isAuthBypassed('localhost')).toBe(false)
    env()
    expect(isAuthBypassed('example.com')).toBe(false)
    expect(isAuthBypassed('localhost.example.com')).toBe(false)
    expect(isAuthBypassed(null)).toBe(false)
  })
})

describe('media proxy rules', () => {
  it('accepts private and public Vercel Blob store URLs', () => {
    expect(isBlobUrl('https://abc123.private.blob.vercel-storage.com/media/photo.jpg')).toBe(true)
    expect(isBlobUrl('https://abc123.public.blob.vercel-storage.com/media/photo.jpg')).toBe(true)
  })
  it('rejects other hosts, schemes and lookalikes', () => {
    expect(isBlobUrl('https://example.com/a.jpg')).toBe(false)
    expect(isBlobUrl('http://abc123.private.blob.vercel-storage.com/a.jpg')).toBe(false)
    expect(isBlobUrl('https://abc123.private.blob.vercel-storage.com.evil.test/a.jpg')).toBe(false)
    expect(isBlobUrl('https://evil.test/?x=.private.blob.vercel-storage.com')).toBe(false)
    expect(isBlobUrl('https://user:pw@abc123.private.blob.vercel-storage.com/a.jpg')).toBe(false)
    expect(isBlobUrl('http://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isBlobUrl('not a url')).toBe(false)
  })
  it('serves images and PDFs inline with nosniff', () => {
    expect(mediaHeaders('image/jpeg')).toMatchObject({
      'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff',
    })
    expect(mediaHeaders('application/pdf; charset=binary')['Content-Type']).toBe('application/pdf')
  })
  it('forces a download for anything that could run as a page', () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/javascript', null]) {
      expect(mediaHeaders(type)).toMatchObject({
        'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment',
      })
    }
  })
})

describe('search text', () => {
  it('escapes ILIKE wildcards so they match literally', () => {
    expect(toLikeTerm('100%_a\\b')).toBe('100\\%\\_a\\\\b')
  })
  it('trims and caps the length', () => {
    expect(toLikeTerm('  brooke  ')).toBe('brooke')
    expect(toLikeTerm('x'.repeat(500))).toHaveLength(MAX_SEARCH_LENGTH)
    expect(toLikeTerm('   ')).toBe('')
  })
})
