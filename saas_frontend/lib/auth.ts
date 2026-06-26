interface TokenPayload {
  sub: string
  tenant: number | null
  role: string
  exp: number
  display_name?: string
}

function decodePayload(token: string): TokenPayload | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}

export function saveToken(token: string) {
  // sessionStorage is tab-scoped: each portal tab keeps its own auth state
  sessionStorage.setItem('token', token)
}

export function clearToken() {
  sessionStorage.removeItem('token')
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('token')
}

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false
  return !!sessionStorage.getItem('token')
}

export function getRole(): string | null {
  const token = getToken()
  if (!token) return null
  return decodePayload(token)?.role ?? null
}

export function getTenantId(): number | null {
  const token = getToken()
  if (!token) return null
  return decodePayload(token)?.tenant ?? null
}

export function getDisplayName(): string {
  const token = getToken()
  if (!token) return ''
  const payload = decodePayload(token)
  if (!payload) return ''
  if (payload.display_name) return payload.display_name
  return ''
}

export function getEmail(): string | null {
  return null
}
