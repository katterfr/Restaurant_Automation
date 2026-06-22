'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'

type Step = 'input' | 'sent-email' | 'sent-sms' | 'verify-sms' | 'reset-sms' | 'done'

export default function ForgotPasswordPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''

  const [step, setStep] = useState<Step>('input')
  const [value, setValue] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await authApi.forgotPassword(value, slug)
      if (result.method === 'sms') {
        setPhone(value)
        setStep('sent-sms')
      } else {
        setStep('sent-email')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSmsReset(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      await authApi.resetPasswordSms(phone, otp, newPassword)
      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-sm px-4">

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-7 h-7">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
          <p className="text-gray-500 mt-1 text-sm">We'll send you a reset link or code</p>
        </div>

        {/* ── Step: input ──────────────────────────────────────────────── */}
        {step === 'input' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email or phone number</label>
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                required autoFocus
                className={inputCls}
                placeholder="owner@restaurant.com or +1 555 000 0000"
              />
              <p className="text-xs text-gray-400 mt-1.5">Enter the email or phone linked to your account.</p>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading || !value} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Sending…' : 'Continue'}
            </button>
            <div className="text-center">
              <Link href={`/portal/${slug}/login`} className="text-sm text-gray-500 hover:text-gray-700">← Back to sign in</Link>
            </div>
          </form>
        )}

        {/* ── Step: email sent ──────────────────────────────────────────── */}
        {step === 'sent-email' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Check your email</p>
              <p className="text-sm text-gray-500 mt-1">We sent a password reset link to <strong>{value}</strong>. Click the button in the email to set a new password.</p>
            </div>
            <p className="text-xs text-gray-400">Didn't receive it? Check your spam folder, or{' '}
              <button onClick={() => setStep('input')} className="text-green-700 hover:underline">try again</button>.
            </p>
            <Link href={`/portal/${slug}/login`} className="block text-sm text-gray-500 hover:text-gray-700 mt-4">← Back to sign in</Link>
          </div>
        )}

        {/* ── Step: SMS OTP sent ────────────────────────────────────────── */}
        {step === 'sent-sms' && (
          <form onSubmit={e => { e.preventDefault(); setStep('reset-sms') }} className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 text-center">
              Reset code sent to {phone}
            </div>
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
            <button type="submit" disabled={otp.length < 6} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              Continue
            </button>
          </form>
        )}

        {/* ── Step: new password via SMS ────────────────────────────────── */}
        {step === 'reset-sms' && (
          <form onSubmit={handleSmsReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoFocus minLength={8} className={inputCls} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} className={inputCls} placeholder="••••••••" />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading || !newPassword || newPassword !== confirmPassword} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors">
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        )}

        {/* ── Step: done ─────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Password reset!</p>
              <p className="text-sm text-gray-500 mt-1">Your password has been updated. You can now sign in.</p>
            </div>
            <Link href={`/portal/${slug}/login`} className="block w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-full text-sm font-semibold text-center transition-colors">
              Sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
