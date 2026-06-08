'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { isLoggedIn } from '@/lib/auth'

// Legacy redirect — sends owners to their slug-based portal
export default function PortalDashboardRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/portal/login')
      return
    }
    api.portal.dashboard()
      .then(d => {
        if (d.tenant.slug) {
          router.replace(`/portal/${d.tenant.slug}/dashboard`)
        } else {
          router.replace('/portal/login')
        }
      })
      .catch(() => router.replace('/portal/login'))
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-400">Redirecting to your portal…</p>
    </div>
  )
}
