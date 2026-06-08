interface TokenPayload {
  sub: string
  tenant: number | null
  role: string
  exp: number
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
  localStorage.setItem('token', token)
}

export function clearToken() {
  localStorage.removeItem('token')
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem('token')
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
