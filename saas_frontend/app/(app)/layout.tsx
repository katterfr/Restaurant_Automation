'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isLoggedIn } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import AdminChatBot from '@/components/AdminChatBot'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    if (!isLoggedIn()) router.replace('/login')
  }, [router])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
      <AdminChatBot />
    </div>
  )
}
