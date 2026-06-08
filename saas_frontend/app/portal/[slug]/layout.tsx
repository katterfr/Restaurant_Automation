'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { isLoggedIn, clearToken } from '@/lib/auth'
import { api } from '@/lib/api'
import { TenantContext, TenantPublic } from './tenant-context'
import Link from 'next/link'

export default function SlugPortalLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const router = useRouter()
  const pathname = usePathname()
  const [tenant, setTenant] = useState<TenantPublic | null>(null)
  const [notFound, setNotFound] = useState(false)

  const isLoginPage = pathname.endsWith('/login')

  useEffect(() => {
    if (!slug) return
    api.tenants.getPublic(slug)
      .then(setTenant)
      .catch(() => setNotFound(true))
  }, [slug])

  useEffect(() => {
    if (isLoginPage) return
    if (!isLoggedIn()) router.replace(`/portal/${slug}/login`)
  }, [isLoginPage, router, slug])

  function logout() {
    clearToken()
    router.push(`/portal/${slug}/login`)
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 bg-gray-200 rounded-2xl mx-auto mb-4 flex items-center justify-center text-gray-400 text-xl">?</div>
          <p className="text-lg font-semibold text-gray-900">Restaurant not found</p>
          <p className="text-sm text-gray-400 mt-1">Check your portal link and try again.</p>
        </div>
      </div>
    )
  }

  if (isLoginPage) {
    return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
  }

  const initial = tenant?.name?.[0]?.toUpperCase() ?? '…'

  return (
    <TenantContext.Provider value={tenant}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">
              {initial}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">
                {tenant?.name ?? <span className="inline-block w-32 h-3.5 bg-gray-200 rounded animate-pulse" />}
              </p>
              <p className="text-xs text-gray-400">Owner Portal</p>
            </div>
          </div>
          <nav className="hidden sm:flex items-center gap-5 text-sm text-gray-500">
            <Link href={`/portal/${slug}/dashboard`} className="hover:text-gray-900 transition-colors">Dashboard</Link>
            <Link href={`/portal/${slug}/orders`} className="hover:text-gray-900 transition-colors">Orders</Link>
            <Link href={`/portal/${slug}/menu`} className="hover:text-gray-900 transition-colors">Menu</Link>
            <Link href={`/portal/${slug}/ads`} className="hover:text-gray-900 transition-colors">Ads</Link>
          </nav>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            Sign out
          </button>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </div>
    </TenantContext.Provider>
  )
}
