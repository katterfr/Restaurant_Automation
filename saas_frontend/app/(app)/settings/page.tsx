'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { clearToken } from '@/lib/auth'
import { api } from '@/lib/api'

export default function SettingsPage() {
  const router = useRouter()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.new_password !== form.confirm) {
      setError('New passwords do not match')
      return
    }
    if (form.new_password.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.auth.changePassword(form.current_password, form.new_password)
      setSuccess(true)
      setForm({ current_password: '', new_password: '', confirm: '' })
      setTimeout(() => {
        clearToken()
        router.push('/login')
      }, 2500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Change Password</h2>
        <p className="text-xs text-gray-400 mb-5">
          You will be signed out automatically after a successful password change.
        </p>

        {success ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3 text-green-600 text-xl font-bold">✓</div>
            <p className="text-sm font-medium text-gray-900">Password updated successfully</p>
            <p className="text-xs text-gray-400 mt-1">Signing you out in a moment…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
              <input
                type="password"
                value={form.current_password}
                onChange={e => set('current_password', e.target.value)}
                required
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <input
                type="password"
                value={form.new_password}
                onChange={e => set('new_password', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={e => set('confirm', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
