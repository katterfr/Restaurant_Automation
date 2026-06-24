export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <a href="/" className="text-green-600 text-sm hover:underline mb-4 inline-block">← Back to Careful Server</a>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-gray-500 text-sm">Last updated: June 23, 2026 · Effective date: June 23, 2026</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10 text-gray-700 text-sm leading-relaxed">

        <p className="text-base text-gray-600">
          Please read these Terms of Service ("Terms") carefully before using the Careful Server platform. By creating an account or using any part of the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.
        </p>

        {/* 1 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">1. Definitions</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>"Careful Server" / "we" / "us"</strong> means Careful Server, Inc., the company that operates this platform.</li>
            <li><strong>"Service"</strong> means the Careful Server web application, APIs, AI phone agent, and all features accessible through your account.</li>
            <li><strong>"You" / "User"</strong> means the restaurant owner, operator, or authorized staff member who creates or uses an account.</li>
            <li><strong>"Subscription"</strong> means the paid plan (Starter, Growth, or Pro) that grants access to the Service.</li>
            <li><strong>"Content"</strong> means any data, text, images, or other material you upload, enter, or generate within the Service.</li>
          </ul>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
          <p className="mb-3">Careful Server is a SaaS restaurant management platform that provides:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>AI-powered phone ordering agent (24/7 call answering and order submission)</li>
            <li>Voice-to-text and text-to-voice order handoff</li>
            <li>Multi-platform advertising management (Meta, Google, YouTube, TikTok, Snapchat, Pinterest)</li>
            <li>Social media scheduling and posting</li>
            <li>AI creative generation for ads and social content</li>
            <li>Order management dashboard</li>
            <li>Menu management with live availability controls</li>
            <li>Delivery platform integrations (DoorDash, Uber Eats)</li>
            <li>Google Business Profile and Apple Maps management</li>
            <li>Accounting and revenue reporting</li>
            <li>AI portal assistant chatbot</li>
          </ul>
          <p className="mt-3">Feature availability depends on your subscription plan. We reserve the right to modify, add, or remove features with reasonable notice to users.</p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">3. Account Registration & Eligibility</h2>
          <p className="mb-2">To use Careful Server, you must:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Be at least 18 years old</li>
            <li>Be a legal representative of the restaurant business you register</li>
            <li>Provide accurate, complete, and current registration information</li>
            <li>Maintain the security of your login credentials</li>
            <li>Notify us immediately of any unauthorized access to your account</li>
          </ul>
          <p className="mt-3">You are responsible for all activity that occurs under your account, including actions taken by staff members you grant access to. Each restaurant portal is intended for use by one legal business entity.</p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">4. Subscription Plans & Free Trial</h2>
          <div className="space-y-3">
            <p><strong>Free Trial:</strong> New accounts receive a 14-day free trial of the Growth plan. No credit card is required to start. At the end of the trial, you must subscribe or your access to paid features will be paused.</p>
            <p><strong>Plans:</strong> Starter ($49/mo), Growth ($149/mo), and Pro ($299/mo). Annual billing is available at a 20% discount. Plan details and feature inclusions are listed at carefulserver.com.</p>
            <p><strong>Billing:</strong> Subscriptions are billed in advance on a monthly or annual cycle via Stripe. Your subscription renews automatically unless cancelled.</p>
            <p><strong>Upgrades / Downgrades:</strong> You may change your plan at any time. Upgrades take effect immediately and are prorated. Downgrades take effect at the next billing cycle.</p>
            <p><strong>Cancellation:</strong> You may cancel at any time from your portal Settings → Billing. Cancellation takes effect at the end of the current paid period. We do not offer refunds for partial billing periods.</p>
          </div>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">5. Third-Party Platform Integrations</h2>
          <p className="mb-3">The Service connects to third-party platforms (including but not limited to Meta, Google, YouTube, TikTok, Snapchat, Pinterest, DoorDash, Uber Eats, Stripe, and Twilio) at your direction. By connecting these platforms, you acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Your use of each third-party platform is governed by that platform's own terms of service and privacy policy.</li>
            <li>You are responsible for maintaining valid accounts and complying with each platform's policies.</li>
            <li>Careful Server is not responsible for actions taken by third-party platforms, including suspension of your accounts, changes to their APIs, or unavailability of their services.</li>
            <li>Ad spend on connected platforms (Google Ads, Meta Ads, etc.) is billed directly by those platforms. Careful Server does not charge or receive any portion of your ad spend.</li>
            <li>You grant Careful Server permission to act on your behalf on the platforms you authorize, within the scope of the actions you initiate.</li>
          </ul>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">6. Acceptable Use</h2>
          <p className="mb-2">You agree not to use the Service to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Violate any applicable law or regulation</li>
            <li>Infringe the intellectual property rights of others</li>
            <li>Distribute spam, malware, or harmful content through connected platforms</li>
            <li>Misrepresent your business, products, or pricing to customers</li>
            <li>Use the AI phone agent to deceive callers about the nature of the interaction in violation of applicable disclosure laws</li>
            <li>Attempt to reverse-engineer, scrape, or exploit the platform's APIs or infrastructure</li>
            <li>Share your login credentials with individuals outside your restaurant organization</li>
            <li>Circumvent usage limits or access features not included in your plan</li>
          </ul>
          <p className="mt-3">Violation of these terms may result in immediate suspension or termination of your account.</p>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">7. Your Content & Intellectual Property</h2>
          <p className="mb-2"><strong>Your Content:</strong> You retain ownership of all content you upload or create within the Service (menu items, images, business information, ad copy, etc.). You grant Careful Server a limited license to store, display, and transmit your content solely for the purpose of providing the Service to you.</p>
          <p className="mb-2"><strong>AI-Generated Content:</strong> Content generated by Careful Server's AI tools (ad creatives, captions, etc.) is provided to you for your use. You are responsible for reviewing AI-generated content before publishing and ensuring it complies with applicable laws and platform policies.</p>
          <p><strong>Our IP:</strong> The Careful Server platform, its code, design, and branding are the intellectual property of Careful Server, Inc. Nothing in these Terms grants you ownership of our platform or technology.</p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">8. Privacy</h2>
          <p>Your use of the Service is subject to our <a href="/privacy-policy" className="text-green-600 hover:underline">Privacy Policy</a>, which is incorporated into these Terms by reference. By using the Service, you agree to the collection and use of information as described in the Privacy Policy.</p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">9. Disclaimers & Warranties</h2>
          <p className="mb-2">THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Warranties of merchantability or fitness for a particular purpose</li>
            <li>Guarantees of uninterrupted or error-free operation</li>
            <li>Guarantees of accuracy of AI-generated content or recommendations</li>
            <li>Guarantees of results from advertising campaigns run through the platform</li>
          </ul>
          <p className="mt-3">The AI phone agent is designed to handle common ordering scenarios but may not handle all calls correctly. You remain responsible for verifying orders and customer interactions.</p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">10. Limitation of Liability</h2>
          <p className="mb-2">TO THE MAXIMUM EXTENT PERMITTED BY LAW, CAREFUL SERVER SHALL NOT BE LIABLE FOR:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Indirect, incidental, consequential, or punitive damages</li>
            <li>Loss of revenue, profits, data, or business opportunities</li>
            <li>Damages resulting from third-party platform actions or outages</li>
            <li>Damages resulting from unauthorized access to your account</li>
          </ul>
          <p className="mt-3">Our total liability for any claim arising from your use of the Service shall not exceed the amount you paid to Careful Server in the three (3) months preceding the claim.</p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">11. Indemnification</h2>
          <p>You agree to indemnify and hold harmless Careful Server, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including legal fees) arising from: (a) your use of the Service in violation of these Terms; (b) your violation of any third-party rights or applicable law; or (c) content you submit or actions you take through the Service.</p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">12. Termination</h2>
          <p className="mb-2"><strong>By you:</strong> You may terminate your account at any time from your portal Settings → Billing, or by emailing <a href="mailto:support@carefulserver.com" className="text-green-600 hover:underline">support@carefulserver.com</a>. Upon cancellation, your access continues until the end of the current billing period.</p>
          <p><strong>By us:</strong> We may suspend or terminate your account immediately if you violate these Terms, fail to pay subscription fees after a grace period, or if we determine that your use poses a risk to our platform or other users. We will attempt to provide notice before termination unless the circumstances require immediate action.</p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">13. Governing Law & Disputes</h2>
          <p>These Terms are governed by the laws of the State of Delaware, without regard to its conflict of law principles. Any dispute arising from these Terms shall first be attempted to be resolved through good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration in accordance with the American Arbitration Association rules. You waive any right to a jury trial or class action proceeding.</p>
        </section>

        {/* 14 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">14. Changes to These Terms</h2>
          <p>We may update these Terms from time to time. When we make material changes, we will notify you by email at least 14 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance. If you do not agree to the updated Terms, you must cancel your account before the effective date.</p>
        </section>

        {/* 15 */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-4">15. Contact</h2>
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 space-y-1">
            <p className="font-semibold text-gray-800">Careful Server, Inc.</p>
            <p>Email: <a href="mailto:support@carefulserver.com" className="text-green-600 hover:underline">support@carefulserver.com</a></p>
            <p>Website: <a href="https://carefulserver.com" className="text-green-600 hover:underline">carefulserver.com</a></p>
          </div>
        </section>

      </div>
    </div>
  )
}
