'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { isLoggedIn, clearToken } from '@/lib/auth'
import { api } from '@/lib/api'
import { TenantContext, TenantPublic } from './tenant-context'
import Link from 'next/link'

const ALL_NAV = [
  { label: 'Dashboard',   href: 'dashboard',  feature: null },
  { label: 'Orders',      href: 'orders',     feature: null },
  { label: 'Menu',        href: 'menu',       feature: null },
  { label: 'Ads',         href: 'ads',        feature: 'ads' },
  { label: 'Social',      href: 'social',     feature: 'social_posts' },
  { label: 'Accounting',  href: 'accounting', feature: 'accounting' },
  { label: 'Delivery',    href: 'delivery',   feature: 'delivery' },
  { label: 'Listings',    href: 'business',   feature: 'business_listings' },
]

export default function SlugPortalLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const router = useRouter()
  const pathname = usePathname()
  const [tenant, setTenant] = useState<TenantPublic | null>(null)
  const [features, setFeatures] = useState<string[]>([])
  const [notFound, setNotFound] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const isLoginPage = pathname.endsWith('/login')

  useEffect(() => {
    if (!slug) return
    api.tenants.getPublic(slug).then(setTenant).catch(() => setNotFound(true))
  }, [slug])

  useEffect(() => {
    if (isLoginPage || !isLoggedIn()) return
    api.portal.features().then(setFeatures).catch(() => {})
  }, [isLoginPage, slug])

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
  const visibleNav = ALL_NAV.filter(n => !n.feature || features.includes(n.feature))

  return (
    <TenantContext.Provider value={tenant}>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0">
              {initial}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">
                {tenant?.name ?? '…'}
              </p>
              <p className="text-xs text-gray-400">Owner Portal</p>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {visibleNav.map(n => {
              const active = pathname.includes(`/${n.href}`)
              return (
                <Link
                  key={n.href}
                  href={`/portal/${slug}/${n.href}`}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    active ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={logout}
              className="hidden sm:block text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <span className="block w-5 h-0.5 bg-current mb-1" />
              <span className="block w-5 h-0.5 bg-current mb-1" />
              <span className="block w-5 h-0.5 bg-current" />
            </button>
          </div>
        </header>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 space-y-1">
            {visibleNav.map(n => (
              <Link
                key={n.href}
                href={`/portal/${slug}/${n.href}`}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
              >
                {n.label}
              </Link>
            ))}
            <button onClick={logout} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-100">
              Sign out
            </button>
          </div>
        )}

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>
      </div>
    </TenantContext.Provider>
  )
}
