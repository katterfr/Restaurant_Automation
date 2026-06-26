'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-731b.up.railway.app'

type Screen = 'login' | 'change-password'

function PasswordStrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 10,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const colors = ['#ef4444', '#f97316', '#eab308', '#16a34a']
  const labels = ['Weak', 'Fair', 'Good', 'Strong']
  if (!password) return null
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[0,1,2,3].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full transition-colors duration-300"
            style={{ backgroundColor: i < score ? colors[score - 1] : '#1e293b' }} />
        ))}
      </div>
      <p className="text-xs" style={{ color: score > 0 ? colors[score - 1] : '#64748b' }}>
        {score > 0 ? labels[score - 1] : ''}
        {score < 4 && password.length > 0 && (
          <span className="text-[#64748b] ml-1">
            {!checks[0] && '· min 10 chars '}
            {!checks[1] && '· uppercase '}
            {!checks[2] && '· lowercase '}
            {!checks[3] && '· number '}
          </span>
        )}
      </p>
    </div>
  )
}

export default function AppLoginPage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [savedOldPassword, setSavedOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('token')) {
      router.replace('/app/home')
    }
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = new URLSearchParams({ username: email.trim(), password })
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      const data = await res.json().catch(() => ({ detail: res.statusText }))
      if (!res.ok) {
        throw new Error(data.detail || 'Invalid email or password')
      }
      localStorage.setItem('token', data.access_token)
      if (data.password_breached) {
        setSavedOldPassword(password)
        setPassword('')
        setScreen('change-password')
      } else {
        router.push('/app/home')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: savedOldPassword, new_password: newPassword }),
      })
      const data = await res.json().catch(() => ({ detail: res.statusText }))
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update password')
      }
      router.push('/app/home')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  if (screen === 'change-password') {
    return (
      <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-[360px] flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h1 className="text-white text-xl font-bold text-center mb-2">Secure Your Account</h1>
          <p className="text-[#94a3b8] text-sm text-center mb-6 leading-relaxed">
            Your current password was found in a known security breach. Create a new, strong password to keep your account safe.
          </p>

          <form onSubmit={handleChangePassword} className="w-full space-y-4">
            <div>
              <input
                type="password"
                required
                autoFocus
                autoComplete="new-password"
                placeholder="New password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setError('') }}
                className="w-full bg-[#0f172a] border border-white/10 text-white rounded-xl px-4 text-base placeholder-white/30 focus:outline-none focus:border-white/30 h-12"
              />
              <PasswordStrengthBar password={newPassword} />
            </div>

            <div>
              <input
                type="password"
                required
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                className="w-full bg-[#0f172a] border border-white/10 text-white rounded-xl px-4 text-base placeholder-white/30 focus:outline-none focus:border-white/30 h-12"
              />
            </div>

            {error && (
              <div className="bg-red-950/60 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-50 text-white text-base font-bold rounded-xl h-14 transition-colors active:scale-[0.98]"
            >
              {loading ? 'Updating...' : 'Set New Password'}
            </button>
          </form>

          <p className="text-[#475569] text-xs text-center mt-5 leading-relaxed">
            Min 10 characters, uppercase, lowercase, and a number required.
            Passwords found in breach databases are blocked.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[360px] flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl bg-[#16a34a] flex items-center justify-center mb-6 shadow-lg">
          <span className="text-white text-3xl font-bold select-none">CS</span>
        </div>

        <h1 className="text-white text-2xl font-bold text-center mb-1">Careful Server</h1>
        <p className="text-[#94a3b8] text-sm text-center mb-10">Employee Work App</p>

        <form onSubmit={handleLogin} className="w-full space-y-4">
          <div>
            <label className="sr-only">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Email address"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              className="w-full bg-[#0f172a] border border-white/10 text-white rounded-xl px-4 text-base placeholder-white/30 focus:outline-none focus:border-white/30 h-12"
            />
          </div>

          <div>
            <label className="sr-only">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              className="w-full bg-[#0f172a] border border-white/10 text-white rounded-xl px-4 text-base placeholder-white/30 focus:outline-none focus:border-white/30 h-12"
            />
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-50 text-white text-base font-bold rounded-xl h-14 transition-colors active:scale-[0.98]"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
