'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { login, authApi } from '@/lib/api'
import { saveToken } from '@/lib/auth'
import { useTenant } from '../tenant-context'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: object) => void
          renderButton: (el: HTMLElement, cfg: object) => void
        }
      }
    }
  }
}

type Modal = null | 'phone' | 'otp' | 'link-google' | 'link-phone'

function SlugLoginInner() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenant = useTenant()
  const googleBtnRef = useRef<HTMLDivElement>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [pendingAccount, setPendingAccount] = useState<{ google_email?: string; google_id?: string; phone?: string } | null>(null)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkPassword, setLinkPassword] = useState('')
  const [error, setError] = useState('')
  const [otpInfo, setOtpInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const googleIdToken = useRef('')

  const verified = searchParams?.get('verified') === '1'

  async function afterLogin(token: string) {
    saveToken(token)
    sessionStorage.setItem(`cs_show_welcome_${slug}`, '1')
    router.push(`/portal/${slug}/dashboard`)
  }

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true; script.defer = true
    document.head.appendChild(script)
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        callback: handleGoogleCredential,
        auto_select: false,
      })
      if (googleBtnRef.current) {
        window.google?.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline', size: 'large',
          width: googleBtnRef.current.offsetWidth || 360,
          text: 'continue_with', shape: 'rectangular',
        })
      }
    }
    return () => { try { document.head.removeChild(script) } catch {} }
  }, [])

  async function handleGoogleCredential(response: { credential: string }) {
    googleIdToken.current = response.credential
    setError(''); setLoading(true)
    try {
      const result = await authApi.googleLogin(response.credential)
      if ('access_token' in result) { await afterLogin(result.access_token) }
      else { setPendingAccount({ google_email: result.google_email, google_id: result.google_id }); setModal('link-google') }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Google sign-in failed') }
    finally { setLoading(false) }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { access_token } = await login(email, password)
      await afterLogin(access_token)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Incorrect email or password') }
    finally { setLoading(false) }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const result = await authApi.sendPhoneOtp(phone)
      setPendingAccount({ phone: result.phone }); setModal('otp')
      setOtpInfo(`Code sent to ${result.phone}`)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to send code') }
    finally { setLoading(false) }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const result = await authApi.verifyPhoneOtp(pendingAccount?.phone || phone, otp)
      if ('access_token' in result) { await afterLogin(result.access_token) }
      else { setModal('link-phone') }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Invalid code') }
    finally { setLoading(false) }
  }

  async function handleLinkGoogle(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const result = await authApi.googleLink(googleIdToken.current, linkEmail, linkPassword)
      await afterLogin(result.access_token)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Linking failed') }
    finally { setLoading(false) }
  }

  async function handleLinkPhone(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const result = await authApi.phoneLink(pendingAccount?.phone || phone, otp, linkEmail, linkPassword)
      await afterLogin(result.access_token)
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Linking failed') }
    finally { setLoading(false) }
  }

  function closeModal() { setModal(null); setError(''); setOtp(''); setLinkEmail(''); setLinkPassword('') }

  const initial = tenant?.name?.[0]?.toUpperCase() ?? 'C'
  const inputCls = 'w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
  const socialBtn = 'w-full flex items-center justify-center gap-3 border border-gray-300 rounded-full py-3 px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors bg-white'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-sm">
            {initial}
          </div>
          {tenant ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
              <p className="text-gray-500 mt-1 text-sm">Sign in to your restaurant portal</p>
            </>
          ) : (
            <>
              <div className="h-7 bg-gray-200 rounded animate-pulse w-48 mx-auto mb-2" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-40 mx-auto" />
            </>
          )}
        </div>

        {verified && (
          <div className="mb-5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 text-center">
            Email verified! You can now sign in.
          </div>
        )}

        {/* Email / password form */}
        <form onSubmit={handleEmailLogin} className="space-y-4 mb-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required className={inputCls} placeholder="owner@restaurant.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <Link href={`/portal/${slug}/forgot-password`} className="text-xs text-green-700 hover:underline">Forgot password?</Link>
            </div>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required className={inputCls} placeholder="••••••••"
            />
          </div>
          {error && !modal && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or continue with</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Social sign-in */}
        <div className="space-y-3">
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} className="w-full" style={{ minHeight: 44 }} />
          ) : (
            <button disabled className={`${socialBtn} opacity-40 cursor-not-allowed`}>
              <GoogleIcon /> Continue with Google
            </button>
          )}
          <button onClick={() => { setModal('phone'); setError('') }} className={socialBtn}>
            <PhoneIcon /> Continue with phone
          </button>
        </div>

        <p className="text-center text-xs text-gray-300 mt-8">Powered by Careful Server</p>
      </div>

      {/* ── Phone modal ────────────────────────────────────────────────────── */}
      {modal === 'phone' && (
        <ModalShell onClose={closeModal} title="Continue with phone" subtitle="We'll send a verification code via SMS">
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required autoFocus className={inputCls} placeholder="+1 (555) 000-0000" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading || !phone} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        </ModalShell>
      )}

      {/* ── OTP modal ──────────────────────────────────────────────────────── */}
      {modal === 'otp' && (
        <ModalShell onClose={closeModal} title="Enter your code" subtitle={otpInfo}>
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <input
              type="text" value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
              required autoFocus
              className={`${inputCls} text-center text-2xl tracking-widest`}
              placeholder="000000" maxLength={6}
            />
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading || otp.length < 6} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Verifying…' : 'Verify code'}
            </button>
            <button type="button" onClick={() => { setModal('phone'); setOtp(''); setError('') }} className="w-full text-sm text-gray-500 hover:text-gray-700">
              Use a different number
            </button>
          </form>
        </ModalShell>
      )}

      {/* ── Link Google modal ──────────────────────────────────────────────── */}
      {modal === 'link-google' && (
        <ModalShell onClose={closeModal} title="Link your Google account"
          subtitle={`Signed in as ${pendingAccount?.google_email}. Enter your portal credentials to link.`}>
          <form onSubmit={handleLinkGoogle} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Portal email</label>
              <input type="email" value={linkEmail} onChange={e => setLinkEmail(e.target.value)} required autoFocus className={inputCls} placeholder="owner@restaurant.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Portal password</label>
              <input type="password" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} required className={inputCls} placeholder="••••••••" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Linking…' : 'Link & sign in'}
            </button>
          </form>
        </ModalShell>
      )}

      {/* ── Link phone modal ───────────────────────────────────────────────── */}
      {modal === 'link-phone' && (
        <ModalShell onClose={closeModal} title="Link your phone number"
          subtitle={`No account found for ${pendingAccount?.phone}. Enter your portal credentials to link.`}>
          <form onSubmit={handleLinkPhone} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Portal email</label>
              <input type="email" value={linkEmail} onChange={e => setLinkEmail(e.target.value)} required autoFocus className={inputCls} placeholder="owner@restaurant.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Portal password</label>
              <input type="password" value={linkPassword} onChange={e => setLinkPassword(e.target.value)} required className={inputCls} placeholder="••••••••" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Linking…' : 'Link & sign in'}
            </button>
          </form>
        </ModalShell>
      )}
    </div>
  )
}

export default function SlugLoginPage() {
  return (
    <Suspense>
      <SlugLoginInner />
    </Suspense>
  )
}

function ModalShell({ children, onClose, title, subtitle }: {
  children: React.ReactNode; onClose: () => void; title: string; subtitle?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  )
}
