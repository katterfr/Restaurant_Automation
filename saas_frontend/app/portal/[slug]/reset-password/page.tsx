'use client'
import { useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'

export default function ResetPasswordPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!token) {
      setError('Invalid reset link. Please request a new one.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await authApi.resetPassword(token, newPassword)
      setDone(true)
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
          <h1 className="text-2xl font-bold text-gray-900">
            {done ? 'Password updated!' : 'Choose a new password'}
          </h1>
          {!done && <p className="text-gray-500 mt-1 text-sm">Must be at least 8 characters.</p>}
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">Your password has been reset. Sign in with your new password.</p>
            <Link
              href={`/portal/${slug}/login`}
              className="block w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-full text-sm font-semibold text-center transition-colors"
            >
              Sign in
            </Link>
          </div>
        ) : !token ? (
          <div className="text-center space-y-4">
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              This reset link is invalid or has expired.
            </p>
            <Link href={`/portal/${slug}/forgot-password`} className="block text-sm text-green-700 hover:underline">
              Request a new reset link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required autoFocus minLength={8}
                className={inputCls}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required minLength={8}
                className={inputCls}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading || !newPassword || newPassword !== confirmPassword}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-full text-sm font-semibold transition-colors"
            >
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
            <div className="text-center">
              <Link href={`/portal/${slug}/login`} className="text-sm text-gray-400 hover:text-gray-600">← Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
