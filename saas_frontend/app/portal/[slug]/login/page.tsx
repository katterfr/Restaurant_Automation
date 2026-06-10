'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { login } from '@/lib/api'
import { saveToken } from '@/lib/auth'
import { useTenant } from '../tenant-context'

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Forgot Password?</h2>
        <p className="text-sm text-gray-600 mb-1">
          To reset your password, contact your restaurant&apos;s platform administrator.
        </p>
        <p className="text-sm text-gray-600 mb-4">
          They can set a new password for your account from the Careful-Server management portal
          under <span className="font-medium">Team Members</span> or{' '}
          <span className="font-medium">Owner Portal Access</span>.
        </p>
        <button
          onClick={onClose}
          className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

export default function SlugLoginPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const router = useRouter()
  const tenant = useTenant()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { access_token } = await login(email, password)
      saveToken(access_token)
      sessionStorage.setItem(`cs_show_welcome_${slug}`, '1')
      router.push(`/portal/${slug}/dashboard`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const initial = tenant?.name?.[0]?.toUpperCase() ?? '…'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-sm">
            {initial}
          </div>
          {tenant ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
              <p className="text-gray-500 mt-1 text-sm">Sign in to manage your restaurant</p>
            </>
          ) : (
            <>
              <div className="h-7 bg-gray-200 rounded-lg animate-pulse w-48 mx-auto mb-2" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-56 mx-auto" />
            </>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="owner@restaurant.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-xs text-green-700 hover:text-green-800 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !tenant}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-300 mt-6">
          Powered by Restaurant Platform
        </p>
      </div>
    </div>
  )
}
