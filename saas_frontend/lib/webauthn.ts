const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-production-731b.up.railway.app'

function buf2b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function b64url2buf(b64: string): ArrayBuffer {
  const pad = b64.length % 4 === 0 ? b64 : b64 + '===='.slice(b64.length % 4)
  return Uint8Array.from(atob(pad.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer
}

function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null
}

async function apiCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { detail?: string }).detail || res.statusText)
  }
  return res.json()
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function enrollBiometric(): Promise<void> {
  const opts = await apiCall<{
    challenge: string; rp_id: string; rp_name: string
    user_id: string; user_name: string; user_display_name: string
  }>('/auth/webauthn/register-begin')

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: b64url2buf(opts.challenge),
      rp: { id: opts.rp_id, name: opts.rp_name },
      user: {
        id: b64url2buf(opts.user_id),
        name: opts.user_name,
        displayName: opts.user_display_name,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        requireResidentKey: false,
      },
      timeout: 60000,
      attestation: 'none',
    },
  }) as PublicKeyCredential

  if (!credential) throw new Error('Biometric enrollment cancelled')

  const response = credential.response as AuthenticatorAttestationResponse
  await apiCall('/auth/webauthn/register-complete', {
    method: 'POST',
    body: JSON.stringify({
      credential_id: buf2b64url(credential.rawId),
      client_data_json: buf2b64url(response.clientDataJSON),
      attestation_object: buf2b64url(response.attestationObject),
      device_type: typeof navigator !== 'undefined' && navigator.userAgent.includes('iPhone') ? 'ios' : 'android',
    }),
  })
}

export async function verifyBiometric(): Promise<void> {
  const opts = await apiCall<{
    challenge: string; rp_id: string
    allow_credentials: { id: string; type: string }[]
  }>('/auth/webauthn/auth-begin')

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: b64url2buf(opts.challenge),
      rpId: opts.rp_id,
      userVerification: 'required',
      allowCredentials: opts.allow_credentials.map(c => ({
        id: b64url2buf(c.id),
        type: 'public-key' as const,
      })),
      timeout: 60000,
    },
  }) as PublicKeyCredential

  if (!credential) throw new Error('Biometric verification failed')

  const response = credential.response as AuthenticatorAssertionResponse
  await apiCall('/auth/webauthn/auth-complete', {
    method: 'POST',
    body: JSON.stringify({
      credential_id: buf2b64url(credential.rawId),
      client_data_json: buf2b64url(response.clientDataJSON),
      authenticator_data: buf2b64url(response.authenticatorData),
      signature: buf2b64url(response.signature),
    }),
  })
}

export async function getBiometricStatus(): Promise<{ enrolled: boolean; credential_count: number }> {
  return apiCall('/auth/webauthn/status')
}
