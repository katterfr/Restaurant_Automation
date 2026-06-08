'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { isLoggedIn, getRole, clearToken } from '@/lib/auth'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === '/portal/login') return
    if (!isLoggedIn()) {
      router.replace('/portal/login')
      return
    }
    const role = getRole()
    if (role === 'admin') {
      router.replace('/dashboard')
    }
  }, [router, pathname])

  function logout() {
    clearToken()
    router.push('/portal/login')
  }

  const isLoginPage = pathname === '/portal/login'

  if (isLoginPage) return <>{children}</>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">R</span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Restaurant Portal</p>
            <p className="text-xs text-gray-400">Owner Dashboard</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          Sign out
        </button>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
