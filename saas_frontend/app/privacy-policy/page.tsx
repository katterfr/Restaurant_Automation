export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <a href="/" className="text-green-600 text-sm hover:underline mb-4 inline-block">← Back to Careful Server</a>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-500 text-sm">Last updated: June 23, 2026 · Effective date: June 23, 2026</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10 text-gray-700 text-sm leading-relaxed">

        <p className="text-base text-gray-600">
          Careful Server, Inc. ("Careful Server," "we," "us," or "our") is committed to protecting the privacy of restaurant owners, operators, and their customers who use our platform. This Privacy Policy explains what information we collect, how we use it, and the choices you have.
        </p>

        {/* 1 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">1. Information We Collect</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Account Information</h3>
              <p>When you sign up, we collect your name, email address, restaurant name, city, phone number, and a password. If you sign in with Google, we receive your name and email from Google's identity service.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Billing Information</h3>
              <p>Subscription payments are processed by Stripe. We receive a billing confirmation and the last four digits of your card. We never see or store your full card number, CVV, or bank details.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Restaurant & Menu Data</h3>
              <p>We store the menu items, prices, categories, hours, and business details you enter into the platform so we can display and manage them on your behalf.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Order Data</h3>
              <p>Orders placed through the AI phone agent, delivery integrations, or other channels are stored in your dashboard so you can view, fulfill, and analyze them.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Usage & Log Data</h3>
              <p>We automatically collect information about how you use the platform: pages visited, features used, timestamps, IP address, browser type, and device information. This helps us diagnose issues and improve the product.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Third-Party Integration Data</h3>
              <p>When you authorize Careful Server to connect to external platforms (Google, Meta, TikTok, DoorDash, Uber Eats, etc.), those platforms provide us with access tokens and, in some cases, limited account information needed to perform the actions you request (e.g., publishing ads or posting to social media).</p>
            </div>
          </div>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">2. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>To create and manage your account and restaurant portal</li>
            <li>To operate the AI phone agent and process orders on your behalf</li>
            <li>To run advertising campaigns on the platforms you authorize</li>
            <li>To publish social media posts on the channels you connect</li>
            <li>To manage your delivery platform integrations (DoorDash, Uber Eats)</li>
            <li>To generate AI-powered ad creative based on your prompts</li>
            <li>To send service-related emails (receipts, security alerts, product updates)</li>
            <li>To respond to your support requests</li>
            <li>To analyze usage patterns and improve the platform</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p className="mt-4">We do not use your data to train external AI models or sell insights derived from your business data to third parties.</p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">3. Google API Services & User Data</h2>
          <p className="mb-3">Careful Server uses Google APIs to provide certain features. Our use and transfer of information received from Google APIs adheres to the <strong>Google API Services User Data Policy</strong>, including the Limited Use requirements.</p>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 space-y-3">
            <p><strong>What Google data we access:</strong> When you connect Google Ads, YouTube, or Google Business Profile, we request OAuth tokens that allow us to: create and manage ad campaigns on your behalf, upload videos to your YouTube channel, and update your Google Business Profile listing.</p>
            <p><strong>How we use it:</strong> We use this access solely to perform the actions you explicitly request within the Careful Server dashboard. We do not access your Google data for any purpose beyond providing these features.</p>
            <p><strong>How we store it:</strong> OAuth refresh tokens are stored encrypted in our database. Access tokens are short-lived and used only at the time of an action.</p>
            <p><strong>How to revoke:</strong> You can disconnect any Google integration at any time from your portal under Settings → Integrations. You can also revoke access directly at <a href="https://myaccount.google.com/permissions" className="text-green-600 hover:underline" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</p>
            <p><strong>We do not:</strong> sell Google user data, use it for advertising targeting unrelated to your requests, or share it with third parties except as necessary to provide the service (e.g., the Google Ads API itself).</p>
          </div>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">4. Third-Party Integrations</h2>
          <p className="mb-3">Careful Server integrates with the following third-party platforms at your direction:</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {['Meta (Facebook & Instagram)', 'Google Ads', 'YouTube', 'TikTok', 'Snapchat Ads', 'Pinterest Ads', 'DoorDash', 'Uber Eats', 'Google Business Profile', 'Apple Maps', 'Stripe (payments)', 'Twilio (SMS)'].map(p => (
              <div key={p} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700">{p}</div>
            ))}
          </div>
          <p>Each of these platforms has its own privacy policy governing how they handle data. We only request the minimum permissions needed to provide the features you activate, and we only use those permissions for the purposes you authorize.</p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">5. Data Sharing & Disclosure</h2>
          <p className="mb-3">We do not sell your personal information. We may share information in the following limited circumstances:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Service providers:</strong> We work with vendors (hosting, analytics, payment processing, email delivery) who process data on our behalf under confidentiality agreements.</li>
            <li><strong>Platform integrations:</strong> We send data to platforms you connect (e.g., ad campaign details to Google Ads) as needed to fulfill your requests.</li>
            <li><strong>Legal requirements:</strong> We may disclose information if required by law, court order, or to protect the rights and safety of Careful Server, our users, or the public.</li>
            <li><strong>Business transfers:</strong> If Careful Server is acquired or merges with another company, your information may be transferred as part of that transaction, with notice provided to you.</li>
          </ul>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">6. Data Retention</h2>
          <p>We retain your account data for as long as your account is active. If you cancel your subscription and request deletion, we will delete your data within 30 days, except where we are required to retain it by law (e.g., financial records for tax purposes, which we retain for 7 years). Order history and ad campaign data may be retained in anonymized form for platform analytics.</p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">7. Data Security</h2>
          <p>We implement industry-standard security measures including:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>All data transmitted over HTTPS (TLS 1.2+)</li>
            <li>OAuth tokens stored with AES-256 encryption at rest</li>
            <li>Passwords hashed using bcrypt</li>
            <li>Access controls limiting employee access to data on a need-to-know basis</li>
            <li>Regular security reviews</li>
          </ul>
          <p className="mt-3">No method of transmission over the internet is 100% secure. If you discover a security vulnerability, please report it to <a href="mailto:security@carefulserver.com" className="text-green-600 hover:underline">security@carefulserver.com</a>.</p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">8. Cookies & Tracking</h2>
          <p className="mb-2">We use cookies for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Authentication cookies:</strong> Keep you logged in to your portal</li>
            <li><strong>Preference cookies:</strong> Remember your dashboard settings</li>
            <li><strong>Analytics cookies:</strong> Understand how the platform is used (aggregated, not personal)</li>
          </ul>
          <p className="mt-3">We do not serve third-party advertising cookies on our platform. You can disable cookies in your browser settings, though this may affect your ability to log in.</p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">9. Your Rights & Choices</h2>
          <p className="mb-2">Depending on your location, you may have the following rights:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
            <li><strong>Correction:</strong> Request that we correct inaccurate data</li>
            <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
            <li><strong>Portability:</strong> Request your data in a machine-readable format</li>
            <li><strong>Disconnect integrations:</strong> Remove any connected platform from your dashboard at any time</li>
            <li><strong>Opt out of marketing:</strong> Unsubscribe from promotional emails via the link in any email we send</li>
          </ul>
          <p className="mt-3">To exercise any of these rights, email <a href="mailto:support@carefulserver.com" className="text-green-600 hover:underline">support@carefulserver.com</a> with "Privacy Request" in the subject line.</p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">10. Children's Privacy</h2>
          <p>Careful Server is a business management platform intended for use by adults (18+). We do not knowingly collect personal information from children under 13. If we learn that we have inadvertently collected such information, we will delete it promptly.</p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">11. International Data Transfers</h2>
          <p>Careful Server is based in the United States. If you access our platform from outside the US, your information may be transferred to and stored in the US. By using our service, you consent to this transfer. We take steps to ensure your data receives an adequate level of protection.</p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">12. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. When we make material changes, we will notify you by email and update the "Last updated" date at the top of this page. Your continued use of the Service after changes become effective constitutes acceptance of the revised policy.</p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">13. Contact Us</h2>
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 space-y-1">
            <p className="font-semibold text-gray-800">Careful Server, Inc.</p>
            <p>Email: <a href="mailto:support@carefulserver.com" className="text-green-600 hover:underline">support@carefulserver.com</a></p>
            <p>Privacy requests: <a href="mailto:privacy@carefulserver.com" className="text-green-600 hover:underline">privacy@carefulserver.com</a></p>
            <p>Website: <a href="https://carefulserver.com" className="text-green-600 hover:underline">carefulserver.com</a></p>
          </div>
        </section>

      </div>
    </div>
  )
}
