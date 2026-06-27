# Careful Server — Mobile App Build Guide

Two apps:
- **Careful Server Manager** (`owner-app/`) — Restaurant owner & manager portal
- **Careful Server** (`staff-app/`) — Employee clock-in & kiosk

Both apps load from the live Cloudflare deployment, so updates to the web app are
instantly reflected in the mobile apps without a new store submission.

---

## Prerequisites

| Tool | Required for |
|------|-------------|
| Node.js 18+ | Both |
| Android Studio | Android / Google Play / Samsung |
| Xcode 15+ (Mac only) | iOS / App Store |
| Java JDK 17 | Android |

---

## First-time setup (run once per app)

```bash
# Owner app
cd mobile/owner-app
npm install
npx cap add android
npx cap add ios          # Mac only

# Staff app
cd mobile/staff-app
npm install
npx cap add android
npx cap add ios          # Mac only
```

---

## Update native projects after config changes

```bash
cd mobile/owner-app   # or staff-app
npx cap sync
```

---

## Build & Run

### Android (Google Play + Samsung)
```bash
npx cap open android
# Android Studio opens → Build → Generate Signed Bundle/APK
```

### iOS (App Store)
```bash
npx cap open ios
# Xcode opens → Product → Archive → Distribute App
```

---

## App Store Accounts Needed

| Store | Account | Cost | URL |
|-------|---------|------|-----|
| Google Play | Google Play Console | $25 one-time | play.google.com/console |
| Apple App Store | Apple Developer | $99/year | developer.apple.com |
| Samsung Galaxy Store | Samsung Seller Portal | Free | seller.samsungapps.com |
| Microsoft Store | Microsoft Partner Center | Free | partner.microsoft.com |

---

## App Icons — Required Sizes

Place icons in `assets/` then run `npx @capacitor/assets generate`.

| Platform | File | Size |
|----------|------|------|
| Android / Samsung | `icon.png` | 1024×1024 |
| iOS | `icon.png` | 1024×1024 |
| Splash | `splash.png` | 2732×2732 |
| Splash dark | `splash-dark.png` | 2732×2732 |

Install the generator:
```bash
npm install -g @capacitor/assets
# Then from each app directory:
npx @capacitor/assets generate
```

---

## App IDs / Bundle IDs

| App | Android Package | iOS Bundle |
|-----|----------------|-----------|
| Manager | `com.carefulserver.manager` | `com.carefulserver.manager` |
| Staff | `com.carefulserver.staff` | `com.carefulserver.staff` |

Register both bundle IDs in Apple Developer portal before building for iOS.

---

## Google Play Store Submission

1. Build a signed **AAB** (Android App Bundle) in Android Studio
2. Go to play.google.com/console → Create app
3. Fill in store listing (title, description, screenshots, icon)
4. Upload AAB to **Internal testing** first, test, then promote to Production
5. Required screenshots: Phone (2 min), 7" tablet, 10" tablet

**Permissions to declare:**
- INTERNET
- CAMERA (for receipt scanning)
- USE_BIOMETRIC / USE_FINGERPRINT (staff app clock-in)
- POST_NOTIFICATIONS (shift reminders)
- RECEIVE_BOOT_COMPLETED (local notifications after reboot)

---

## Apple App Store Submission

1. Create App IDs in developer.apple.com/account → Identifiers
2. Create two Apps in App Store Connect (appstoreconnect.apple.com)
3. Archive in Xcode → Upload to App Store Connect
4. Fill in metadata, screenshots, privacy policy URL
5. Submit for review (~24-48 hours)

**Info.plist permissions (already added by Capacitor):**
- NSCameraUsageDescription
- NSFaceIDUsageDescription
- NSUserNotificationsUsageDescription

**Privacy Policy URL required** — host at: `https://carefulserver.workers.dev/privacy-policy`

---

## Samsung Galaxy Store Submission

Samsung accepts the same APK/AAB as Google Play.

1. Go to seller.samsungapps.com → Add New App
2. Upload the signed APK from Android Studio
3. Samsung reviews in 1-3 business days
4. No separate development account needed — your Google Play APK works here

---

## Microsoft Store Submission (Windows)

Submit as a **Progressive Web App (PWA)**:

1. Go to partner.microsoft.com/dashboard → Windows & Xbox → New Product → App
2. Choose **PWA** as the type
3. Enter URL: `https://carefulserver.workers.dev/portal` (owner) or `/app` (staff)
4. Microsoft scans the manifest and auto-generates the app package
5. The existing `manifest.json` in `saas_frontend/public/` covers this

Alternatively build a Windows desktop app:
```bash
npx cap add @capacitor/electron   # experimental
```

---

## Production Checklist

- [ ] Replace `carefulserver.workers.dev` with your custom domain in both `capacitor.config.ts`
- [ ] Add Firebase project and paste `google-services.json` → `android/app/`
- [ ] Add Firebase iOS config `GoogleService-Info.plist` → `ios/App/App/`
- [ ] Generate and place app icons (`assets/icon.png` 1024×1024)
- [ ] Generate splash screens (`assets/splash.png` 2732×2732)
- [ ] Create keystore for Android signing: `keytool -genkey -v -keystore carefulserver.keystore`
- [ ] Set up App Store Connect apps with bundle IDs
- [ ] Add privacy policy page at `/privacy-policy` route
- [ ] Test on physical Android device before Play Store submission
- [ ] Test on physical iPhone before App Store submission

---

## Push Notifications Setup (Firebase)

1. Create a Firebase project at console.firebase.google.com
2. Add Android app (`com.carefulserver.staff` and `com.carefulserver.manager`)
3. Download `google-services.json` → place in `mobile/staff-app/android/app/`
4. Add iOS app → download `GoogleService-Info.plist` → place in `mobile/staff-app/ios/App/App/`
5. Add your FCM Server Key to Railway env: `FCM_SERVER_KEY=your_key`

The backend `device_push_tokens` table stores tokens. Use FCM to send shift
reminders and order alerts to owner devices.
