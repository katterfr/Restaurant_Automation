'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { login, authApi } from '@/lib/api'
import { saveToken, getRole } from '@/lib/auth'
import { api } from '@/lib/api'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: object) => void
          renderButton: (el: HTMLElement, cfg: object) => void
          prompt: () => void
        }
      }
    }
  }
}

type Step = 'options' | 'email' | 'phone' | 'otp' | 'link-google' | 'link-phone'

export default function PortalLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const googleBtnRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<Step>('options')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [pendingAccount, setPendingAccount] = useState<{ google_email?: string; google_id?: string; phone?: string } | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const googleIdToken = useRef('')

  const verified = searchParams?.get('verified') === '1'

  async function afterLogin(token: string) {
    saveToken(token)
    const role = getRole()
    if (role === 'admin') {
      router.push('/dashboard')
      return
    }
    try {
      const dash = await api.portal.dashboard()
      const slug = dash.tenant?.slug
      if (slug) {
        sessionStorage.setItem(`cs_show_welcome_${slug}`, '1')
        router.push(`/portal/${slug}/dashboard`)
      } else {
        router.push('/portal/dashboard')
      }
    } catch {
      router.push('/portal/dashboard')
    }
  }

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        callback: handleGoogleCredential,
        auto_select: false,
      })
      if (googleBtnRef.current) {
        window.google?.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: googleBtnRef.current.offsetWidth || 360,
          text: 'continue_with',
          shape: 'rectangular',
        })
      }
    }
    return () => { try { document.head.removeChild(script) } catch {} }
  }, [])

  async function handleGoogleCredential(response: { credential: string }) {
    googleIdToken.current = response.credential
    setError('')
    setLoading(true)
    try {
      const result = await authApi.googleLogin(response.credential)
      if ('access_token' in result) {
        await afterLogin(result.access_token)
      } else {
        setPendingAccount({ google_email: result.google_email, google_id: result.google_id })
        setStep('link-google')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { access_token } = await login(email, password)
      await afterLogin(access_token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await authApi.sendPhoneOtp(phone)
      setPendingAccount({ phone: result.phone })
      setStep('otp')
      setInfo(`Code sent to ${result.phone}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await authApi.verifyPhoneOtp(pendingAccount?.phone || phone, otp)
      if ('access_token' in result) {
        await afterLogin(result.access_token)
      } else {
        setStep('link-phone')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  async function handleLinkGoogle(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await authApi.googleLink(googleIdToken.current, email, password)
      await afterLogin(result.access_token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Linking failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleLinkPhone(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await authApi.phoneLink(pendingAccount?.phone || phone, otp, email, password)
      await afterLogin(result.access_token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Linking failed')
    } finally {
      setLoading(false)
    }
  }

  const btnCls = 'w-full flex items-center justify-center gap-3 border border-gray-300 rounded-full py-3 px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors bg-white'
  const inputCls = 'w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-sm px-4">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-sm">
            <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8">
              <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Careful Server</h1>
          <p className="text-gray-500 mt-1 text-sm">Sign in to your restaurant portal</p>
        </div>

        {verified && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 text-center">
            Email verified! You can now sign in.
          </div>
        )}

        {/* ── Main options ─────────────────────────────────────────────── */}
        {step === 'options' && (
          <div className="space-y-3">
            {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
              <div ref={googleBtnRef} className="w-full" style={{ minHeight: 44 }} />
            ) : (
              <button disabled className={`${btnCls} opacity-40 cursor-not-allowed`}>
                <GoogleIcon /> Continue with Google
              </button>
            )}

            <button onClick={() => { setStep('phone'); setError('') }} className={btnCls}>
              <PhoneIcon /> Continue with phone
            </button>

            <button
              onClick={() => setError('Apple Sign-In requires Apple Developer configuration.')}
              className={btnCls}
            >
              <AppleIcon /> Continue with Apple
            </button>

            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or sign in with email</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <button onClick={() => { setStep('email'); setError('') }} className={btnCls}>
              <EmailIcon /> Continue with email
            </button>

            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>}

            <p className="text-center text-xs text-gray-400 pt-2">
              Forgot your password?{' '}
              <Link href="/portal/forgot-password" className="text-green-700 hover:underline font-medium">Reset it here</Link>
            </p>
          </div>
        )}

        {/* ── Email + password ─────────────────────────────────────────── */}
        {step === 'email' && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <button type="button" onClick={() => setStep('options')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus className={inputCls} placeholder="owner@restaurant.com" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <Link href="/portal/forgot-password" className="text-xs text-green-700 hover:underline">Forgot password?</Link>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className={inputCls} placeholder="••••••••" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {/* ── Phone entry ──────────────────────────────────────────────── */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <button type="button" onClick={() => setStep('options')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required autoFocus className={inputCls} placeholder="+1 (555) 000-0000" />
              <p className="text-xs text-gray-400 mt-1.5">We'll send you a verification code via SMS.</p>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading || !phone} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {/* ── OTP entry ────────────────────────────────────────────────── */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm text-gray-500 text-center">{info}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">6-digit code</label>
              <input
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                required autoFocus
                className={`${inputCls} text-center text-2xl tracking-widest`}
                placeholder="000000"
                maxLength={6}
              />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading || otp.length < 6} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Verifying…' : 'Verify code'}
            </button>
            <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError('') }} className="w-full text-sm text-gray-500 hover:text-gray-700">
              Use a different number
            </button>
          </form>
        )}

        {/* ── Link Google ──────────────────────────────────────────────── */}
        {step === 'link-google' && (
          <form onSubmit={handleLinkGoogle} className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
              <p className="font-medium mb-0.5">Link your Google account</p>
              <p className="text-blue-600 text-xs">Signed in as {pendingAccount?.google_email}. Enter your portal credentials to link.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Portal email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus className={inputCls} placeholder="owner@restaurant.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Portal password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className={inputCls} placeholder="••••••••" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Linking…' : 'Link & sign in'}
            </button>
            <button type="button" onClick={() => { setStep('options'); setError('') }} className="w-full text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </form>
        )}

        {/* ── Link phone ───────────────────────────────────────────────── */}
        {step === 'link-phone' && (
          <form onSubmit={handleLinkPhone} className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
              <p className="font-medium mb-0.5">Link your phone number</p>
              <p className="text-blue-600 text-xs">No account found for {pendingAccount?.phone}. Enter your portal credentials to link this number.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Portal email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus className={inputCls} placeholder="owner@restaurant.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Portal password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className={inputCls} placeholder="••••••••" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Linking…' : 'Link & sign in'}
            </button>
            <button type="button" onClick={() => { setStep('options'); setError('') }} className="w-full text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </form>
        )}

        <p className="text-center text-xs text-gray-300 mt-8">Powered by Careful Server</p>
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
function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}
