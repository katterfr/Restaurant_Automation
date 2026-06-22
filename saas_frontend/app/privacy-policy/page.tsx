export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 text-gray-800">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-10">Last updated: June 2026</p>

      <section className="space-y-8 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Information We Collect</h2>
          <p>Careful Server collects information you provide when creating an account, including your name, email address, business name, and payment information. We also collect usage data to improve the platform.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. How We Use Your Information</h2>
          <p>We use your information to provide and improve our services, process payments, send service-related communications, and enable integrations with third-party platforms you choose to connect (such as delivery services, social media platforms, and advertising networks).</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Third-Party Integrations</h2>
          <p>When you connect third-party services (Meta, TikTok, Google, Snapchat, Pinterest, DoorDash, Uber Eats, etc.), those platforms may share data with us as permitted by their own privacy policies. We only use this data to provide the features you requested.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Data Sharing</h2>
          <p>We do not sell your personal information. We may share data with service providers who assist us in operating the platform, subject to confidentiality agreements. We may disclose information if required by law.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Data Security</h2>
          <p>We implement industry-standard security measures to protect your data. All data is transmitted over encrypted connections (HTTPS). Payment information is processed by Stripe and never stored on our servers.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data at any time by contacting us. You may also disconnect any third-party integrations from your dashboard at any time.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Cookies</h2>
          <p>We use essential cookies to keep you logged in and remember your preferences. We do not use tracking cookies for advertising purposes on our own platform.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Contact Us</h2>
          <p>If you have questions about this Privacy Policy, please contact us at <a href="mailto:support@carefulserver.com" className="text-green-600 hover:underline">support@carefulserver.com</a>.</p>
        </div>
      </section>
    </div>
  )
}
