/**
 * Native bridge — safe wrappers for Capacitor APIs.
 * All calls are no-ops when running in a regular browser.
 */

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).Capacitor?.isNativePlatform?.()
}

export function getNativePlatform(): 'android' | 'ios' | 'web' {
  if (typeof window === 'undefined') return 'web'
  return (window as any).Capacitor?.getPlatform?.() ?? 'web'
}

// ── Push notifications ────────────────────────────────────────────────────────

export async function requestPushPermission(): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const result = await PushNotifications.requestPermissions()
    if (result.receive === 'granted') {
      await PushNotifications.register()
      return true
    }
    return false
  } catch {
    return false
  }
}

export async function onPushToken(cb: (token: string) => void): Promise<() => void> {
  if (!isNativeApp()) return () => {}
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const handle = await PushNotifications.addListener('registration', ({ value }) => cb(value))
    return () => handle.remove()
  } catch {
    return () => {}
  }
}

export async function onPushNotification(cb: (title: string, body: string, data: Record<string, string>) => void): Promise<() => void> {
  if (!isNativeApp()) return () => {}
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const handle = await PushNotifications.addListener('pushNotificationReceived', n => {
      cb(n.title ?? '', n.body ?? '', (n.data as Record<string, string>) ?? {})
    })
    return () => handle.remove()
  } catch {
    return () => {}
  }
}

// ── Status bar ────────────────────────────────────────────────────────────────

export async function setStatusBarDark(dark: boolean): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: dark ? '#020617' : '#ffffff' })
  } catch { /* ignore */ }
}

export async function hideStatusBar(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { StatusBar } = await import('@capacitor/status-bar')
    await StatusBar.hide()
  } catch { /* ignore */ }
}

export async function showStatusBar(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { StatusBar } = await import('@capacitor/status-bar')
    await StatusBar.show()
  } catch { /* ignore */ }
}

// ── Haptics ───────────────────────────────────────────────────────────────────

export async function hapticSuccess(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType.Success })
  } catch { /* ignore */ }
}

export async function hapticError(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType.Error })
  } catch { /* ignore */ }
}

export async function hapticLight(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch { /* ignore */ }
}

// ── Local notifications (shift reminders) ────────────────────────────────────

export async function scheduleShiftReminder(
  shiftDate: string, // YYYY-MM-DD
  shiftTime: string, // HH:MM
  restaurantName: string,
  minutesBefore = 30,
): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return

    const [h, m] = shiftTime.split(':').map(Number)
    const shiftDt = new Date(`${shiftDate}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
    const fireAt = new Date(shiftDt.getTime() - minutesBefore * 60000)
    if (fireAt <= new Date()) return

    await LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 100000),
        title: 'Shift Reminder',
        body: `Your shift at ${restaurantName} starts in ${minutesBefore} minutes.`,
        schedule: { at: fireAt },
        sound: 'default',
        smallIcon: 'ic_stat_icon_config_sample',
      }],
    })
  } catch { /* ignore */ }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

export async function onAppResume(cb: () => void): Promise<() => void> {
  if (!isNativeApp()) return () => {}
  try {
    const { App } = await import('@capacitor/app')
    const handle = await App.addListener('resume', cb)
    return () => handle.remove()
  } catch {
    return () => {}
  }
}

export async function exitApp(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { App } = await import('@capacitor/app')
    await App.exitApp()
  } catch { /* ignore */ }
}
