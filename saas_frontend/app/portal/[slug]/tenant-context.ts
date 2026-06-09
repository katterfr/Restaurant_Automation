'use client'
import { createContext, useContext } from 'react'

export interface TenantPublic {
  id: number
  name: string
  slug: string
  status: string
}

export interface TenantCustomization {
  accent_color: string
  logo_url: string
  banner_url: string
  welcome_msg: string
  dark_mode: boolean
}

export const TenantContext = createContext<TenantPublic | null>(null)
export function useTenant() { return useContext(TenantContext) }

export const CustomizationContext = createContext<TenantCustomization>({
  accent_color: '#16a34a',
  logo_url: '',
  banner_url: '',
  welcome_msg: '',
  dark_mode: false,
})
export function useCustomization() { return useContext(CustomizationContext) }
