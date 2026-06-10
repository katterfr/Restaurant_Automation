'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { isLoggedIn, clearToken } from '@/lib/auth'
import { api, TenantCustomization as ApiCustomization } from '@/lib/api'
import { TenantContext, TenantPublic, CustomizationContext, TenantCustomization } from './tenant-context'
import ChatBot from './chat-bot'
import Link from 'next/link'

const ALL_NAV: { label: string; href: string; feature: null | string | string[] }[] = [
  { label: 'Dashboard',   href: 'dashboard',  feature: null },
  { label: 'Orders',      href: 'orders',     feature: null },
  { label: 'Menu',        href: 'menu',       feature: null },
  { label: 'Ads',         href: 'ads',        feature: ['ads_meta','ads_google','ads_youtube','ads_tiktok','ads_snapchat','ads_pinterest'] },
  { label: 'Social',      href: 'social',     feature: ['social_meta','social_youtube','social_tiktok'] },
  { label: 'Accounting',  href: 'accounting', feature: 'accounting' },
  { label: 'Delivery',    href: 'delivery',   feature: 'delivery' },
  { label: 'Listings',    href: 'business',   feature: ['listings_google','listings_apple'] },
  { label: 'Phone Agent', href: 'phone',      feature: 'phone_agent' },
  { label: 'AI Creative', href: 'creative',   feature: 'ai_creative' },
]

const COLOR_PRESETS = [
  { label: 'Green',  value: '#16a34a' },
  { label: 'Blue',   value: '#2563eb' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Red',    value: '#dc2626' },
]

const DEFAULT_CUSTOMIZATION: TenantCustomization = {
  accent_color: '#16a34a',
  logo_url: '',
  banner_url: '',
  welcome_msg: '',
  dark_mode: false,
}

const DARK_CSS = `
  .portal-dark { background-color: #0f172a !important; color: #f1f5f9; }
  .portal-dark .bg-white { background-color: #1e293b !important; }
  .portal-dark .bg-gray-50 { background-color: #0f172a !important; }
  .portal-dark .bg-gray-100 { background-color: #1e293b !important; }
  .portal-dark .bg-gray-200 { background-color: #273447 !important; }
  .portal-dark .hover\\:bg-gray-50:hover { background-color: #273447 !important; }
  .portal-dark .hover\\:bg-gray-100:hover { background-color: #334155 !important; }
  .portal-dark .border-gray-100 { border-color: #1e293b !important; }
  .portal-dark .border-gray-200 { border-color: #334155 !important; }
  .portal-dark .border-gray-300 { border-color: #475569 !important; }
  .portal-dark .divide-gray-100 > * + * { border-color: #273447 !important; }
  .portal-dark .divide-gray-200 > * + * { border-color: #334155 !important; }
  .portal-dark .text-gray-900 { color: #f1f5f9 !important; }
  .portal-dark .text-gray-800 { color: #e2e8f0 !important; }
  .portal-dark .text-gray-700 { color: #cbd5e1 !important; }
  .portal-dark .text-gray-600 { color: #94a3b8 !important; }
  .portal-dark .text-gray-500 { color: #64748b !important; }
  .portal-dark .text-gray-400 { color: #475569 !important; }
  .portal-dark .text-gray-300 { color: #334155 !important; }
  .portal-dark input, .portal-dark textarea, .portal-dark select {
    background-color: #0f172a !important;
    border-color: #475569 !important;
    color: #f1f5f9 !important;
  }
  .portal-dark input::placeholder, .portal-dark textarea::placeholder { color: #475569 !important; }
  .portal-dark .shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.4) !important; }
  .portal-dark .shadow { box-shadow: 0 1px 3px rgba(0,0,0,0.5) !important; }
`

export default function SlugPortalLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const router = useRouter()
  const pathname = usePathname()
  const [tenant, setTenant] = useState<TenantPublic | null>(null)
  const [features, setFeatures] = useState<string[]>([])
  const [notFound, setNotFound] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [customization, setCustomization] = useState<TenantCustomization>(DEFAULT_CUSTOMIZATION)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [draftCustom, setDraftCustom] = useState<TenantCustomization>(DEFAULT_CUSTOMIZATION)
  const [saving, setSaving] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  const isLoginPage   = pathname.endsWith('/login')
  const isWelcomePage = pathname.endsWith('/welcome')

  useEffect(() => {
    if (!slug) return
    api.tenants.getPublic(slug).then(setTenant).catch(() => setNotFound(true))
  }, [slug])

  useEffect(() => {
    if (isLoginPage || !isLoggedIn()) return
    api.portal.features().then(setFeatures).catch(() => {})
    api.portal.customization().then((c: ApiCustomization) => {
      setCustomization(c)
      setDraftCustom(c)
    }).catch(() => {})
  }, [isLoginPage, slug])

  useEffect(() => {
    if (isLoginPage || isWelcomePage) return
    if (!isLoggedIn()) { router.replace(`/portal/${slug}/login`); return }
    // first-time visit → welcome page
    if (typeof window !== 'undefined' && !localStorage.getItem(`cs_welcomed_${slug}`)) {
      router.replace(`/portal/${slug}/welcome`)
    }
  }, [isLoginPage, isWelcomePage, router, slug])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false)
      }
    }
    if (drawerOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [drawerOpen])

  function logout() {
    clearToken()
    router.push(`/portal/${slug}/login`)
  }

  function openDrawer() {
    setDraftCustom(customization)
    setDrawerOpen(true)
  }

  async function saveCustomization() {
    setSaving(true)
    try {
      const saved = await api.portal.saveCustomization(draftCustom)
      setCustomization(saved)
      setDrawerOpen(false)
    } catch { /* ignore */ }
    finally { setSaving(false) }
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

  if (isWelcomePage) {
    return (
      <TenantContext.Provider value={tenant}>
        <CustomizationContext.Provider value={customization}>
          {dark && <style>{DARK_CSS}</style>}
          {children}
        </CustomizationContext.Provider>
      </TenantContext.Provider>
    )
  }

  const initial = tenant?.name?.[0]?.toUpperCase() ?? '…'
  const visibleNav = ALL_NAV.filter(n => {
    if (!n.feature) return true
    if (Array.isArray(n.feature)) return n.feature.some(f => features.includes(f))
    return features.includes(n.feature)
  })
  const accent = customization.accent_color || '#16a34a'
  const dark = customization.dark_mode

  return (
    <TenantContext.Provider value={tenant}>
      <CustomizationContext.Provider value={customization}>
        {dark && <style>{DARK_CSS}</style>}
        <div
          className={`min-h-screen flex flex-col${dark ? ' portal-dark bg-gray-50' : ' bg-gray-50'}`}
          style={{ '--accent': accent } as React.CSSProperties}
        >
          <header
            className="border-b px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30"
            style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', borderColor: dark ? '#334155' : '#e5e7eb' }}
          >
            <div className="flex items-center gap-3">
              {customization.logo_url ? (
                <img
                  src={customization.logo_url}
                  alt={tenant?.name ?? ''}
                  className="w-8 h-8 rounded-lg object-cover shrink-0"
                />
              ) : (
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: accent }}
                >
                  {initial}
                </span>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900 leading-tight">
                  {tenant?.name ?? '…'}
                </p>
                <p className="text-xs text-gray-400">Owner Portal</p>
              </div>
            </div>

            {/* Desktop nav */}
            <nav data-tour-id="portal-nav" className="hidden md:flex items-center gap-1">
              {visibleNav.map(n => {
                const active = pathname.includes(`/${n.href}`)
                return (
                  <Link
                    key={n.href}
                    href={`/portal/${slug}/${n.href}`}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      active ? 'font-medium' : dark ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    style={active ? { backgroundColor: `${accent}18`, color: accent } : {}}
                  >
                    {n.label}
                  </Link>
                )
              })}
            </nav>

            <div className="flex items-center gap-2">
              <button
                data-tour-id="customize-btn"
                onClick={openDrawer}
                className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                title="Customize portal"
              >
                <span>🎨</span>
                <span>Customize</span>
              </button>
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
            <div
              className="md:hidden border-b px-4 py-3 space-y-1"
              style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', borderColor: dark ? '#334155' : '#e5e7eb' }}
            >
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
              <button onClick={openDrawer} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                🎨 Customize
              </button>
              <button onClick={logout} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-100">
                Sign out
              </button>
            </div>
          )}

          <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>
        </div>

        {/* Customization overlay */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
            <div ref={drawerRef} className="relative bg-white w-80 h-full shadow-2xl flex flex-col overflow-y-auto">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Customize Portal</h2>
                <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
              </div>

              <div className="flex-1 px-5 py-5 space-y-6">
                {/* Dark mode */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Appearance</p>
                  <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Dark Mode</p>
                      <p className="text-xs text-gray-400 mt-0.5">Dark background for the entire portal</p>
                    </div>
                    <button
                      onClick={() => setDraftCustom(d => ({ ...d, dark_mode: !d.dark_mode }))}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ml-4 ${draftCustom.dark_mode ? 'bg-slate-700' : 'bg-gray-300'}`}
                    >
                      <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${draftCustom.dark_mode ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                {/* Accent color */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Accent Color</p>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setDraftCustom(d => ({ ...d, accent_color: c.value }))}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${draftCustom.accent_color === c.value ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draftCustom.accent_color}
                      onChange={e => setDraftCustom(d => ({ ...d, accent_color: e.target.value }))}
                      className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                    />
                    <span className="text-xs text-gray-500 font-mono">{draftCustom.accent_color}</span>
                    <span className="text-xs text-gray-400">Custom color</span>
                  </div>
                </div>

                {/* Welcome message */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                    Welcome Message
                  </label>
                  <input
                    type="text"
                    value={draftCustom.welcome_msg}
                    onChange={e => setDraftCustom(d => ({ ...d, welcome_msg: e.target.value }))}
                    placeholder="Welcome back! Ready for a great day?"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    maxLength={120}
                  />
                  <p className="text-xs text-gray-400 mt-1">Shown at the top of your dashboard</p>
                </div>

                {/* Logo URL */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                    Logo URL
                  </label>
                  <input
                    type="url"
                    value={draftCustom.logo_url}
                    onChange={e => setDraftCustom(d => ({ ...d, logo_url: e.target.value }))}
                    placeholder="https://yoursite.com/logo.png"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {draftCustom.logo_url && (
                    <img src={draftCustom.logo_url} alt="Logo preview" className="mt-2 h-10 w-10 rounded-lg object-cover border border-gray-200" />
                  )}
                  <p className="text-xs text-gray-400 mt-1">Replaces the initials icon in the header</p>
                </div>

                {/* Banner URL */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                    Banner Image URL
                  </label>
                  <input
                    type="url"
                    value={draftCustom.banner_url}
                    onChange={e => setDraftCustom(d => ({ ...d, banner_url: e.target.value }))}
                    placeholder="https://yoursite.com/banner.jpg"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {draftCustom.banner_url && (
                    <img src={draftCustom.banner_url} alt="Banner preview" className="mt-2 w-full h-20 rounded-lg object-cover border border-gray-200" />
                  )}
                  <p className="text-xs text-gray-400 mt-1">Full-width hero shown on your dashboard</p>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                <button
                  onClick={saveCustomization}
                  disabled={saving}
                  className="flex-1 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: draftCustom.accent_color }}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Chat bot — available on every portal page */}
        <ChatBot accent={accent} />
      </CustomizationContext.Provider>
    </TenantContext.Provider>
  )
}
