'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AppIndexPage() {
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.replace('/app/login')
    } else {
      router.replace('/app/home')
    }
  }, [router])

  return (
    <div className="fixed inset-0 bg-[#020617] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/20 border-t-[#16a34a] rounded-full animate-spin" />
    </div>
  )
}
