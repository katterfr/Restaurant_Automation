'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useTenant, useCustomization } from '../tenant-context'

const FEATURE_META: Record<string, { icon: string; label: string }> = {
  ads_meta:         { icon: '📣', label: 'Meta Ads' },
  ads_google:       { icon: '🔍', label: 'Google Ads' },
  ads_youtube:      { icon: '▶️', label: 'YouTube Ads' },
  ads_tiktok:       { icon: '🎵', label: 'TikTok Ads' },
  ads_snapchat:     { icon: '👻', label: 'Snapchat' },
  ads_pinterest:    { icon: '📌', label: 'Pinterest' },
  social_meta:      { icon: '💬', label: 'Meta Social' },
  social_youtube:   { icon: '📹', label: 'YouTube' },
  social_tiktok:    { icon: '🎶', label: 'TikTok' },
  listings_google:  { icon: '📍', label: 'Google Maps' },
  listings_apple:   { icon: '🗺️', label: 'Apple Maps' },
  phone_agent:      { icon: '🤖', label: 'AI Phone Agent' },
  ai_creative:      { icon: '✨', label: 'AI Creative' },
  accounting:       { icon: '💰', label: 'Accounting' },
  menu_management:  { icon: '🍽️', label: 'Menu Mgmt' },
  delivery:         { icon: '🚚', label: 'Delivery' },
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// animated counter
function Counter({ to, prefix = '' }: { to: number; prefix?: string }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (to === 0) return
    let start = 0
    const step = Math.ceil(to / 40)
    const t = setInterval(() => {
      start = Math.min(start + step, to)
      setVal(start)
      if (start >= to) clearInterval(t)
    }, 30)
    return () => clearInterval(t)
  }, [to])
  return <>{prefix}{val.toLocaleString()}</>
}

export default function WelcomePage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const router = useRouter()
  const tenant = useTenant()
  const customization = useCustomization()
  const accent = customization.accent_color || '#16a34a'

  const [features, setFeatures] = useState<string[]>([])
  const [stats, setStats] = useState<{ today_orders: number; today_revenue: number; total_orders: number } | null>(null)
  const [animIn, setAnimIn] = useState(false)

  useEffect(() => {
    setTimeout(() => setAnimIn(true), 80)
    Promise.all([
      api.portal.features(),
      api.portal.dashboard(),
    ]).then(([f, d]) => {
      setFeatures(f)
      setStats(d.stats)
    }).catch(() => {})
  }, [])

  function go(tour: boolean) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`cs_welcomed_${slug}`, '1')
    }
    router.replace(`/portal/${slug}/dashboard${tour ? '?tour=1' : ''}`)
  }

  const enabledFeatures = features.filter(f => FEATURE_META[f])
  const initial = tenant?.name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#020617' }}>

      {/* animated orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full cs-float-slow"
          style={{ background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`, filter: 'blur(60px)' }}/>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full cs-float-delay"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }}/>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
          style={{ background: `radial-gradient(circle, ${accent}08 0%, transparent 70%)`, filter: 'blur(80px)' }}/>
        {/* dot grid */}
        <div className="absolute inset-0 dot-grid opacity-30"/>
      </div>

      {/* main card */}
      <div className={`relative z-10 w-full max-w-2xl mx-auto px-6 transition-all duration-700 ${animIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>

        {/* avatar */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-white text-4xl font-black shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 0 60px ${accent}40` }}>
              {customization.logo_url
                ? <img src={customization.logo_url} alt="" className="w-full h-full object-cover rounded-3xl"/>
                : initial}
            </div>
            {/* pulse ring */}
            <div className="absolute inset-0 rounded-3xl animate-ping opacity-20"
              style={{ background: accent }}/>
            {/* online badge */}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-slate-900 flex items-center justify-center"
              style={{ background: '#22c55e' }}>
              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
            </div>
          </div>
        </div>

        {/* greeting */}
        <div className="text-center space-y-2 mb-6">
          <p className="text-slate-400 text-sm font-medium">{greeting()} 👋</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight">
            Welcome to<br/>
            <span style={{ color: accent }}>{tenant?.name ?? '…'}</span>
          </h1>
          <p className="text-slate-400 text-base mt-2 max-w-sm mx-auto">
            Your restaurant's command center is ready. Everything you need to run and grow your business, in one place.
          </p>
        </div>

        {/* live stats (if any orders) */}
        {stats && (stats.today_orders > 0 || stats.total_orders > 0) && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Today's Orders", val: stats.today_orders, prefix: '' },
              { label: "Today's Revenue", val: Math.round(stats.today_revenue), prefix: '$' },
              { label: 'Total Orders', val: stats.total_orders, prefix: '' },
            ].map(s => (
              <div key={s.label} className="glass-card rounded-2xl px-3 py-3 text-center">
                <p className="text-2xl font-black" style={{ color: accent }}>
                  <Counter to={s.val} prefix={s.prefix}/>
                </p>
                <p className="text-slate-500 text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* feature chips */}
        {enabledFeatures.length > 0 && (
          <div className="mb-6">
            <p className="text-slate-500 text-xs text-center mb-3 uppercase tracking-widest font-medium">Your Enabled Features</p>
            <div className="flex flex-wrap justify-center gap-2">
              {enabledFeatures.map((f, i) => {
                const m = FEATURE_META[f]!
                return (
                  <span key={f} className="glass-card flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-slate-300 cs-up"
                    style={{ animationDelay: `${0.05 * i}s`, opacity: 0 }}>
                    <span>{m.icon}</span> {m.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => go(true)}
            className="flex items-center justify-center gap-2.5 px-8 py-3.5 text-sm font-bold text-white rounded-2xl shadow-2xl transition-all hover:opacity-90 hover:scale-105 cs-glow"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
            <span>🗺️</span> Start the Tour
          </button>
          <button onClick={() => go(false)}
            className="flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-slate-300 hover:text-white rounded-2xl transition-all border border-white/10 hover:bg-white/5">
            Skip to Dashboard →
          </button>
        </div>

        <p className="text-center text-slate-700 text-xs mt-4">
          You can replay the tour anytime from the <span className="text-slate-500">? Help</span> button in your dashboard
        </p>
      </div>
    </div>
  )
}
