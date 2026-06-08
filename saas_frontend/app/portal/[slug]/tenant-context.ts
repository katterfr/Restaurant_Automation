'use client'
import { createContext, useContext } from 'react'

export interface TenantPublic {
  id: number
  name: string
  slug: string
  status: string
}

export const TenantContext = createContext<TenantPublic | null>(null)
export function useTenant() { return useContext(TenantContext) }
