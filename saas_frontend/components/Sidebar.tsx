'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clearToken } from '@/lib/auth'

const nav = [
  { label: 'Dashboard',    href: '/dashboard',    icon: '▦' },
  { label: 'Feedback',     href: '/feedback',     icon: '★' },
  { label: 'Phone Agents', href: '/phone-agents', icon: '☎' },
  { label: 'Accounting',   href: '/accounting',   icon: '$' },
  { label: 'Marketing',    href: '/marketing',    icon: '📣' },
  { label: 'AI Assistant', href: '/chat',         icon: '✦' },
  { label: 'Automations',  href: '/automations',  icon: '⏱' },
  { label: 'Settings',     href: '/settings',     icon: '⚙' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  function logout() {
    clearToken()
    router.push('/login')
  }

  return (
    <aside className="w-60 bg-gray-900 text-white flex flex-col min-h-screen shrink-0">
      <div className="px-6 py-5 border-b border-gray-800">
        <p className="text-sm font-bold tracking-wide">Careful-Server</p>
        <p className="text-xs text-gray-400 mt-0.5">Admin Portal</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname.startsWith(item.href)
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
