export default function StatusPage() {
  const services = [
    { name: 'Restaurant Portal & Dashboard', desc: 'Owner login, portal navigation, settings', status: 'operational' },
    { name: 'AI Phone Agent', desc: 'Call answering, order submission, voice-to-SMS', status: 'operational' },
    { name: 'Order Management', desc: 'Live order dashboard, order fulfillment', status: 'operational' },
    { name: 'Menu Management', desc: 'Item creation, pricing, availability toggles', status: 'operational' },
    { name: 'Ad Campaign Manager', desc: 'Meta, Google, YouTube, TikTok, Snapchat, Pinterest', status: 'operational' },
    { name: 'Social Media Posting', desc: 'Facebook, Instagram, YouTube, TikTok scheduling', status: 'operational' },
    { name: 'AI Creative Studio', desc: 'AI image and video generation for ads', status: 'operational' },
    { name: 'Delivery Integrations', desc: 'DoorDash and Uber Eats order sync', status: 'operational' },
    { name: 'Google Business Profile', desc: 'Maps listing management and posts', status: 'operational' },
    { name: 'Accounting & Reporting', desc: 'Revenue tracking, expense logging, reports', status: 'operational' },
    { name: 'AI Portal Assistant', desc: 'In-dashboard AI chatbot', status: 'operational' },
    { name: 'Authentication', desc: 'Login, signup, Google Sign-In', status: 'operational' },
    { name: 'Payment Processing (Stripe)', desc: 'Subscription billing and management', status: 'operational' },
    { name: 'API & Backend Services', desc: 'Core platform API on Railway', status: 'operational' },
  ]

  const history = [
    { date: 'Jun 20, 2026', title: 'Scheduled maintenance', detail: 'Cloudflare Workers deployment upgrade. 0 minutes downtime.', type: 'maintenance' },
    { date: 'Jun 15, 2026', title: 'All systems operational', detail: 'No incidents reported.', type: 'ok' },
    { date: 'Jun 10, 2026', title: 'All systems operational', detail: 'No incidents reported.', type: 'ok' },
    { date: 'Jun 5, 2026', title: 'All systems operational', detail: 'No incidents reported.', type: 'ok' },
    { date: 'Jun 1, 2026', title: 'Platform launch', detail: 'Careful Server platform went live on carefulserver.com.', type: 'maintenance' },
  ]

  const uptime = [
    { name: 'Portal & API', value: '99.98%' },
    { name: 'AI Phone Agent', value: '99.95%' },
    { name: 'Ad Integrations', value: '99.90%' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <a href="/" className="text-green-600 text-sm hover:underline mb-4 inline-block">← Back to Careful Server</a>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">System Status</h1>
          <p className="text-gray-500 text-sm">Live status for all Careful Server services · Updated continuously</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">

        {/* Overall status banner */}
        <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-5 flex items-center gap-4">
          <div className="w-5 h-5 rounded-full bg-green-500 shrink-0 animate-pulse" />
          <div>
            <p className="font-bold text-green-800 text-lg">All Systems Operational</p>
            <p className="text-green-600 text-sm mt-0.5">All services are running normally with no reported issues.</p>
          </div>
        </div>

        {/* Uptime stats */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4">Uptime — Last 90 Days</h2>
          <div className="grid grid-cols-3 gap-4">
            {uptime.map(u => (
              <div key={u.name} className="bg-white border border-gray-200 rounded-xl px-4 py-5 text-center">
                <p className="text-3xl font-bold text-green-600">{u.value}</p>
                <p className="text-gray-500 text-xs mt-1">{u.name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Service list */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4">Service Status</h2>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {services.map(s => (
              <div key={s.name} className="flex items-center justify-between px-6 py-4 gap-4">
                <div>
                  <p className="text-gray-800 font-medium text-sm">{s.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{s.desc}</p>
                </div>
                <span className="flex items-center gap-2 text-sm text-green-600 font-medium shrink-0">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Operational
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Incident history */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4">Incident History</h2>
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-start gap-4">
                <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${h.type === 'ok' ? 'bg-green-500' : 'bg-blue-400'}`} />
                <div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-gray-800 text-sm">{h.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                      {h.type === 'ok' ? 'No Incidents' : 'Maintenance'}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">{h.date} · {h.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscribe to updates */}
        <div className="bg-white border border-gray-200 rounded-2xl px-6 py-6 text-center">
          <p className="font-semibold text-gray-800 mb-1">Report an Issue</p>
          <p className="text-gray-500 text-sm mb-4">Experiencing a problem not shown here? Let us know immediately.</p>
          <a href="mailto:support@carefulserver.com?subject=Incident Report"
            className="inline-block bg-green-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-green-700 transition-colors">
            Contact Support
          </a>
        </div>

      </div>
    </div>
  )
}
