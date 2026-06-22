'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    // The backend /auth/verify-email redirects here with ?verified=1 after verifying
    // Or it may send here directly — check if token was already processed
    const token = searchParams?.get('token')
    if (!token) {
      setStatus('error')
      return
    }

    // The backend endpoint redirects to /portal/login?verified=1 automatically.
    // If we're here without a redirect it means the token needs to be redeemed.
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-731b.up.railway.app'
    fetch(`${API_URL}/auth/verify-email?token=${token}`)
      .then(r => {
        if (r.ok || r.redirected) setStatus('success')
        else setStatus('error')
      })
      .catch(() => setStatus('error'))
  }, [searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-sm px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm" style={{ backgroundColor: '#16a34a' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        {status === 'loading' && (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Verifying your email…</h1>
            <div className="flex justify-center gap-1.5 mt-4">
              {[0,150,300].map(d => (
                <div key={d} className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Email confirmed!</h1>
            <p className="text-sm text-gray-500 mb-6">Your Careful Server account is now verified. Sign in to get started.</p>
            <Link href="/portal/login" className="inline-block bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-full text-sm font-semibold transition-colors">
              Sign in
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Link invalid or expired</h1>
            <p className="text-sm text-gray-500 mb-6">This verification link has already been used or has expired. Sign in to your portal and request a new verification email from your profile settings.</p>
            <Link href="/portal/login" className="inline-block text-green-700 hover:underline text-sm">
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
