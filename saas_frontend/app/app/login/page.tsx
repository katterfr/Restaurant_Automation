'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-731b.up.railway.app'

export default function AppLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Already logged in? Send to home.
    if (typeof window !== 'undefined' && localStorage.getItem('token')) {
      router.replace('/app/home')
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
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
      router.push('/app/home')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-[#020617] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[360px] flex flex-col items-center">
        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl bg-[#16a34a] flex items-center justify-center mb-6 shadow-lg">
          <span className="text-white text-3xl font-bold select-none">CS</span>
        </div>

        {/* Heading */}
        <h1 className="text-white text-2xl font-bold text-center mb-1">Careful Server</h1>
        <p className="text-[#94a3b8] text-sm text-center mb-10">Employee Work App</p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="block text-[#94a3b8] text-xs font-medium mb-1.5 sr-only">Email</label>
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
            <label className="block text-[#94a3b8] text-xs font-medium mb-1.5 sr-only">Password</label>
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
