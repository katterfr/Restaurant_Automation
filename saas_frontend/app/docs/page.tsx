export default function DocsPage() {
  const sections = [
    {
      title: 'Getting Started',
      icon: '',
      items: [
        {
          q: 'What is Careful Server?',
          a: 'Careful Server is an all-in-one AI-powered restaurant management platform. It automates phone order taking, runs ad campaigns across 6 platforms, handles social media posting, manages delivery integrations, and gives you a live dashboard for your entire restaurant — all from one place.'
        },
        {
          q: 'How do I create an account?',
          a: 'Visit carefulserver.com and click "Get Started Free." Enter your restaurant name, city, phone number, email address, and a password. Your portal is created instantly and a 14-day free trial begins — no credit card required.'
        },
        {
          q: 'How do I log into my restaurant portal?',
          a: 'Go to carefulserver.com/portal/login and sign in with your email and password, or use "Continue with Google" if you registered with Google. You can also navigate directly to your unique portal URL (e.g., carefulserver.com/portal/your-restaurant-name).'
        },
        {
          q: 'What plans are available?',
          a: 'Careful Server offers three plans: Starter ($49/mo) for single-location basics, Growth ($149/mo) for advertising and delivery integrations, and Pro ($299/mo) for the AI phone agent and unlimited locations. All plans include a 14-day free trial. Annual billing saves 20%.'
        },
        {
          q: 'Can I change my plan?',
          a: 'Yes. Go to your portal → Settings → Billing to upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the start of your next billing cycle.'
        },
        {
          q: 'Is there a mobile app?',
          a: 'Careful Server is a web-based platform optimized for both desktop and mobile browsers. You can access your full dashboard from any smartphone, tablet, or computer — no app download required.'
        },
      ],
    },
    {
      title: 'AI Phone Agent',
      icon: '',
      items: [
        {
          q: 'How does the AI Phone Agent work?',
          a: 'The AI Phone Agent answers incoming calls to your restaurant\'s phone number, greets customers by name (if returning), reads them your menu, takes their order, confirms the total, and submits the order directly to your dashboard — automatically, 24 hours a day, 7 days a week.'
        },
        {
          q: 'How do I set it up?',
          a: 'In your portal, go to Phone Agent → Setup. You\'ll forward your restaurant\'s existing phone number to the Careful Server number we provide, or set it as your primary number. The AI uses your menu data automatically — no scripting required.'
        },
        {
          q: 'Can the AI handle complex orders and modifications?',
          a: 'Yes. The AI understands common modifications like "no onions," "extra cheese," "half portion," and "add a side of fries." It also handles combo meals, special requests, and multi-item orders. You can review any order before marking it fulfilled.'
        },
        {
          q: 'What is the Voice ↔ Text Bridge?',
          a: 'During a phone call, a customer can say "text me instead" and the AI will seamlessly continue the order over SMS — without starting over. The reverse works too: a customer texting can say "call me" and the AI will call them back to complete the order by voice.'
        },
        {
          q: 'What happens to calls when the AI can\'t help?',
          a: 'If a caller asks for something outside the AI\'s scope (e.g., speaking to the manager about a complaint), the AI can transfer the call to a staff phone number you configure, or leave a message for your team.'
        },
        {
          q: 'Is the AI available in other languages?',
          a: 'The AI Phone Agent currently operates in English. Support for Spanish and additional languages is on our roadmap for later in 2026.'
        },
      ],
    },
    {
      title: 'Advertising & Marketing',
      icon: '',
      items: [
        {
          q: 'Which ad platforms are supported?',
          a: 'Careful Server supports six advertising platforms: Meta Ads (Facebook & Instagram), Google Ads, YouTube Ads, TikTok Ads, Snapchat Ads, and Pinterest Ads — all managed from a single dashboard without switching between platforms.'
        },
        {
          q: 'How do I connect my ad accounts?',
          a: 'Go to your portal → Ads → Integrations. Click "Connect" next to each platform and follow the OAuth authorization flow. You\'ll need a business account on each platform. Once connected, your existing campaigns sync and new campaigns can be created and managed from Careful Server.'
        },
        {
          q: 'What is the AI Creative Studio?',
          a: 'The AI Creative Studio lets you generate professional ad images and short videos by describing your promotion in plain English. For example: "Happy hour deal — 20% off appetizers this Friday and Saturday." The AI produces multiple creative variations you can preview and publish in seconds.'
        },
        {
          q: 'Can I schedule social media posts?',
          a: 'Yes. In your portal → Social Media, you can write a post, attach images or videos (or generate AI creative), and publish immediately or schedule for a future date and time. Posts can be sent to Facebook, Instagram, YouTube, and TikTok simultaneously or to individual platforms.'
        },
        {
          q: 'Does Careful Server charge a fee on my ad spend?',
          a: 'No. Careful Server charges only your subscription fee. All ad spend goes directly to the platforms (Meta, Google, etc.) and is billed by them to your payment method on file with each platform. We do not take any percentage of your ad budget.'
        },
      ],
    },
    {
      title: 'Orders & Delivery',
      icon: '',
      items: [
        {
          q: 'How does the order dashboard work?',
          a: 'Your order dashboard shows all incoming orders in real time — from the AI phone agent, DoorDash, Uber Eats, and any other connected channel — in a single unified view. Each order shows the items, customer name, channel, time, and total. You can mark orders as preparing, ready, or fulfilled.'
        },
        {
          q: 'Which delivery platforms are supported?',
          a: 'DoorDash and Uber Eats are currently supported. When a customer orders through DoorDash or Uber Eats, that order appears in your Careful Server dashboard alongside all other orders — no need to check a separate tablet.'
        },
        {
          q: 'How do I connect DoorDash or Uber Eats?',
          a: 'Go to your portal → Delivery → and click "Connect" next to the platform. You\'ll need your existing merchant account credentials. The integration pulls in orders automatically once connected.'
        },
        {
          q: 'How do I manage my menu?',
          a: 'Go to your portal → Menu. You can add, edit, and remove items; set prices; write descriptions; upload photos; and toggle item availability on or off in real time. Menu changes appear immediately across all connected channels including the AI phone agent.'
        },
        {
          q: 'Can I receive online orders directly through Careful Server?',
          a: 'Yes. In addition to the AI phone agent, customers can place orders through your branded online ordering page, which is included with your portal. Orders arrive in the same dashboard alongside all other channels.'
        },
      ],
    },
    {
      title: 'Google & Maps Integrations',
      icon: '',
      items: [
        {
          q: 'What can I do with the Google Business Profile integration?',
          a: 'Connect your Google Business Profile to manage your listing from inside Careful Server. You can update your hours, address, phone number, photos, and post updates that appear on Google Maps and Google Search. This helps your restaurant show up accurately when customers search for you.'
        },
        {
          q: 'How do I connect Google Ads?',
          a: 'Go to your portal → Ads → Google Ads → Connect. You\'ll be redirected to Google to authorize access. Once connected, you can create and manage search and display campaigns directly from your dashboard.'
        },
        {
          q: 'What Google data does Careful Server access?',
          a: 'Careful Server accesses only the data needed for the features you activate: Google Ads campaign data (to create and manage ads), YouTube channel data (to upload videos), and Google Business Profile data (to update your listing). We do not access your Gmail, Google Drive, or any other Google services. You can revoke access at any time from myaccount.google.com/permissions.'
        },
      ],
    },
    {
      title: 'Billing & Account Management',
      icon: '',
      items: [
        {
          q: 'How do I update my payment method?',
          a: 'Go to your portal → Settings → Billing → Update Payment Method. You\'ll be directed to a secure Stripe page to add or update your card. Careful Server never stores your card details — all billing is handled by Stripe.'
        },
        {
          q: 'How do I cancel my subscription?',
          a: 'Go to your portal → Settings → Billing → Cancel Subscription. Your access will continue until the end of the current billing period. Alternatively, email support@carefulserver.com with "Cancel Account" in the subject line.'
        },
        {
          q: 'Can I get a refund?',
          a: 'Subscriptions are non-refundable for the current billing period. If you experience a significant service outage caused by Careful Server, contact support@carefulserver.com and we will evaluate your situation on a case-by-case basis.'
        },
        {
          q: 'How do I add additional team members?',
          a: 'Go to your portal → Settings → Team. You can invite staff members by email and assign them a role (Manager or Staff). Each team member gets their own login and sees only the dashboard sections appropriate to their role.'
        },
        {
          q: 'Can I manage multiple restaurant locations?',
          a: 'Yes. The Pro plan supports unlimited locations. Growth supports up to 3 locations, and Starter supports 1 location. Each location has its own portal, menu, order dashboard, and integrations, while you can switch between them from a single login.'
        },
      ],
    },
    {
      title: 'Security & Privacy',
      icon: '',
      items: [
        {
          q: 'How does Careful Server protect my data?',
          a: 'All data is transmitted over HTTPS with TLS 1.2+ encryption. Passwords are hashed with bcrypt. OAuth tokens (for connected platforms) are stored encrypted with AES-256. We perform regular security reviews and access controls limit employee access on a need-to-know basis.'
        },
        {
          q: 'Who can see my restaurant\'s order data?',
          a: 'Only you and the team members you explicitly invite can access your portal. Careful Server support staff may access your account with your permission to resolve a support request, but cannot do so without your authorization.'
        },
        {
          q: 'How do I disconnect a platform integration?',
          a: 'Go to your portal → Settings → Integrations. Click "Disconnect" next to any platform you want to remove. This immediately revokes Careful Server\'s access. You can also revoke access directly on the platform (e.g., Google: myaccount.google.com/permissions).'
        },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <a href="/" className="text-green-600 text-sm hover:underline mb-4 inline-block">← Back to Careful Server</a>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Documentation</h1>
          <p className="text-gray-500">Everything you need to set up, connect, and get the most out of Careful Server</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex flex-wrap gap-2">
          {sections.map(s => (
            <a key={s.title} href={`#${s.title.toLowerCase().replace(/\s+/g, '-').replace(/[&]/g, '').replace(/--/g, '-')}`}
              className="text-xs bg-gray-100 hover:bg-green-50 hover:text-green-700 text-gray-600 px-3 py-1.5 rounded-full transition-colors font-medium">
              {s.title}
            </a>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-14">
        {sections.map(section => (
          <div key={section.title} id={section.title.toLowerCase().replace(/\s+/g, '-').replace(/[&]/g, '').replace(/--/g, '-')}>
            <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">{section.title}</h2>
            </div>
            <div className="space-y-4">
              {section.items.map(item => (
                <div key={item.q} className="bg-white rounded-xl border border-gray-200 px-6 py-5">
                  <p className="font-semibold text-gray-800 mb-2 text-base">{item.q}</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Contact CTA */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl px-6 py-8 text-center">
          <p className="font-bold text-green-900 text-lg mb-1">Still have questions?</p>
          <p className="text-green-700 text-sm mb-5">Our support team responds to all inquiries within 24 hours.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="mailto:support@carefulserver.com"
              className="inline-block bg-green-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-green-700 transition-colors">
              Email Support
            </a>
            <a href="/"
              className="inline-block bg-white text-green-700 border border-green-300 text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-green-50 transition-colors">
              Contact Form →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
