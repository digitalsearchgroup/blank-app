// =============================================================
// Digital Search Group - Campaign Management System
// Main Frontend Application
// =============================================================

const API = axios.create({ baseURL: '/api' });

// ---- State ----
let state = {
  page: 'dashboard',
  clients: [],
  campaigns: [],
  selectedClient: null,
  selectedCampaign: null,
  dataforseoStatus: null,
};

// ---- Toast ----
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type === 'error' ? 'bg-red-700' : type === 'warning' ? 'bg-yellow-700' : 'bg-gray-900'} text-white px-5 py-3 rounded-xl shadow-lg text-sm show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ---- Badge helper ----
function statusBadge(status) {
  const map = {
    active: ['bg-green-100 text-green-700', 'Active'],
    prospect: ['bg-yellow-100 text-yellow-700', 'Prospect'],
    paused: ['bg-gray-100 text-gray-500', 'Paused'],
    churned: ['bg-red-100 text-red-600', 'Churned'],
    draft: ['bg-gray-100 text-gray-600', 'Draft'],
    sent: ['bg-blue-100 text-blue-700', 'Sent'],
    approved: ['bg-green-100 text-green-700', 'Approved'],
    rejected: ['bg-red-100 text-red-600', 'Declined'],
    expired: ['bg-orange-100 text-orange-600', 'Expired'],
    planned: ['bg-gray-100 text-gray-500', 'Planned'],
    briefed: ['bg-purple-100 text-purple-600', 'Briefed'],
    in_progress: ['bg-yellow-100 text-yellow-700', 'In Progress'],
    review: ['bg-indigo-100 text-indigo-600', 'In Review'],
    published: ['bg-green-100 text-green-700', 'Published'],
    cancelled: ['bg-red-100 text-red-400', 'Cancelled'],
  };
  const [cls, label] = map[status] || ['bg-gray-100 text-gray-500', status];
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}">${label}</span>`;
}

function rankChange(current, previous) {
  if (!current || !previous) return `<span class="text-gray-400">–</span>`;
  const diff = previous - current;
  if (diff > 0) return `<span class="text-green-600 font-medium">↑${diff}</span>`;
  if (diff < 0) return `<span class="text-red-500 font-medium">↓${Math.abs(diff)}</span>`;
  return `<span class="text-gray-400">→</span>`;
}

function rankBadge(pos) {
  if (!pos) return `<span class="text-gray-400 text-sm">Unranked</span>`;
  if (pos <= 3) return `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-white font-bold text-sm">${pos}</span>`;
  if (pos <= 10) return `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white font-bold text-sm">${pos}</span>`;
  if (pos <= 30) return `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500 text-white font-bold text-sm">${pos}</span>`;
  return `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-bold text-sm">${pos}</span>`;
}

function ago(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---- Navigation ----
function navigate(page, params = {}) {
  state.page = page;
  Object.assign(state, params);
  render();
  window.scrollTo(0, 0);
}

// ---- Main Render ----
function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="flex h-screen overflow-hidden">
      ${renderSidebar()}
      <div class="flex-1 flex flex-col overflow-hidden">
        ${renderTopBar()}
        <main class="flex-1 overflow-y-auto p-6">
          ${renderPage()}
        </main>
      </div>
    </div>
  `;
  attachEvents();
}

function renderSidebar() {
  const links = [
    { id: 'dashboard', icon: 'fa-gauge-high', label: 'Dashboard' },
    { id: 'clients', icon: 'fa-users', label: 'Clients' },
    { id: 'campaigns', icon: 'fa-rocket', label: 'Campaigns' },
    { id: 'proposals', icon: 'fa-file-contract', label: 'Proposals' },
    { id: 'keywords', icon: 'fa-magnifying-glass-chart', label: 'Rank Tracking' },
    { id: 'llm', icon: 'fa-robot', label: 'AI Visibility' },
    { id: 'content', icon: 'fa-pen-nib', label: 'Content' },
    { id: 'reports', icon: 'fa-chart-line', label: 'Reports' },
    { id: 'dataforseo', icon: 'fa-database', label: 'DataForSEO' },
  ];
  return `
    <aside class="w-64 bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col flex-shrink-0">
      <div class="p-5 border-b border-white/10">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center">
            <i class="fas fa-search text-white text-sm"></i>
          </div>
          <div>
            <div class="text-white font-bold text-sm leading-tight">Digital Search</div>
            <div class="text-blue-300 text-xs">Campaign Manager</div>
          </div>
        </div>
      </div>
      <nav class="flex-1 p-3 space-y-1">
        ${links.map(l => `
          <button onclick="navigate('${l.id}')" class="sidebar-link w-full text-left ${state.page === l.id ? 'active' : ''}">
            <i class="fas ${l.icon} w-4 text-center"></i>
            <span class="text-sm">${l.label}</span>
          </button>
        `).join('')}
      </nav>
      <div class="p-4 border-t border-white/10">
        <div class="flex items-center gap-2 text-xs text-blue-300">
          <div class="w-2 h-2 rounded-full ${state.dataforseoStatus?.connected ? 'bg-green-400' : 'bg-yellow-400'}"></div>
          DataForSEO: ${state.dataforseoStatus?.connected ? 'Live' : 'Demo Mode'}
        </div>
      </div>
    </aside>
  `;
}

function renderTopBar() {
  const titles = {
    dashboard: 'Dashboard', clients: 'Client Management', campaigns: 'Campaigns',
    proposals: 'Proposals', keywords: 'Rank Tracking', llm: 'AI & LLM Visibility',
    content: 'Content Management', reports: 'Performance Reports', dataforseo: 'DataForSEO Tools',
    client_detail: state.selectedClient?.company_name || 'Client Detail',
    campaign_detail: state.selectedCampaign?.name || 'Campaign Detail',
    new_proposal: 'New Proposal', new_client: 'New Client',
  };
  return `
    <header class="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-bold text-gray-900">${titles[state.page] || state.page}</h1>
        <p class="text-xs text-gray-400">Digital Search Group</p>
      </div>
      <div class="flex items-center gap-3">
        ${state.page === 'clients' ? `<button onclick="navigate('new_client')" class="btn-primary"><i class="fas fa-plus mr-2"></i>New Client</button>` : ''}
        ${state.page === 'proposals' ? `<button onclick="navigate('new_proposal')" class="btn-primary"><i class="fas fa-plus mr-2"></i>New Proposal</button>` : ''}
        ${state.page === 'campaigns' ? `<button onclick="openModal('new_campaign_modal')" class="btn-primary"><i class="fas fa-plus mr-2"></i>New Campaign</button>` : ''}
        ${state.page === 'keywords' ? `<button onclick="openModal('new_keyword_modal')" class="btn-primary"><i class="fas fa-plus mr-2"></i>Add Keywords</button>` : ''}
        ${state.page === 'llm' ? `<button onclick="openModal('new_llm_modal')" class="btn-primary"><i class="fas fa-plus mr-2"></i>Add Prompt</button>` : ''}
        ${state.page === 'content' ? `<button onclick="openModal('new_content_modal')" class="btn-primary"><i class="fas fa-plus mr-2"></i>New Content</button>` : ''}
      </div>
    </header>
  `;
}

function renderPage() {
  const pages = {
    dashboard: renderDashboard,
    clients: renderClients,
    campaigns: renderCampaigns,
    proposals: renderProposals,
    keywords: renderKeywords,
    llm: renderLLM,
    content: renderContent,
    reports: renderReports,
    dataforseo: renderDataForSEO,
    client_detail: renderClientDetail,
    campaign_detail: renderCampaignDetail,
    new_proposal: renderNewProposal,
    new_client: renderNewClient,
  };
  const fn = pages[state.page];
  return fn ? fn() : '<p class="text-gray-500">Page not found</p>';
}

// ==============================
// DASHBOARD
// ==============================
function renderDashboard() {
  const d = state.dashboardData;
  if (!d) {
    loadDashboard();
    return `<div class="flex items-center justify-center h-64"><div class="text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2 text-sm">Loading...</p></div></div>`;
  }
  const { clients = {}, campaigns = {}, keywords = {}, content = {}, proposals = {} } = d;
  return `
    <div class="space-y-6">
      <!-- MRR Header -->
      <div class="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-6 text-white">
        <p class="text-blue-200 text-sm">Total Monthly Recurring Revenue</p>
        <div class="text-4xl font-bold mt-1">$${Number(clients.total_mrr || 0).toLocaleString()}</div>
        <div class="flex gap-6 mt-4 text-sm text-blue-200">
          <span><strong class="text-white">${clients.active || 0}</strong> Active Clients</span>
          <span><strong class="text-white">${campaigns.active || 0}</strong> Active Campaigns</span>
          <span><strong class="text-white">${clients.prospects || 0}</strong> Prospects</span>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${[
          { icon: 'fa-magnifying-glass-chart', label: 'Keywords Tracking', val: keywords.total || 0, sub: `${keywords.top10 || 0} in Top 10`, color: 'blue' },
          { icon: 'fa-robot', label: 'LLM Prompts', val: (d.llm_stats?.total_prompts) || 0, sub: `AI visibility tracked`, color: 'purple' },
          { icon: 'fa-pen-nib', label: 'Content In Pipeline', val: content.in_pipeline || 0, sub: `${content.published || 0} published`, color: 'green' },
          { icon: 'fa-file-contract', label: 'Pending Proposals', val: proposals.pending || 0, sub: `${proposals.approved || 0} approved total`, color: 'yellow' },
        ].map(s => `
          <div class="card">
            <div class="flex items-center justify-between mb-3">
              <div class="w-10 h-10 rounded-xl bg-${s.color}-100 flex items-center justify-center">
                <i class="fas ${s.icon} text-${s.color}-600"></i>
              </div>
            </div>
            <div class="text-2xl font-bold text-gray-900">${s.val}</div>
            <div class="text-sm text-gray-500 mt-0.5">${s.label}</div>
            <div class="text-xs text-gray-400 mt-1">${s.sub}</div>
          </div>
        `).join('')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Pending Proposals -->
        <div class="card">
          <h3 class="font-semibold text-gray-800 mb-4"><i class="fas fa-file-contract text-blue-500 mr-2"></i>Awaiting Client Approval</h3>
          ${(d.pending_proposals || []).length === 0 ? '<p class="text-gray-400 text-sm">No pending proposals</p>' :
            `<div class="space-y-3">
              ${(d.pending_proposals || []).map(p => `
                <div class="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                  <div>
                    <p class="font-medium text-sm text-gray-900">${p.company_name}</p>
                    <p class="text-xs text-gray-500">${p.title} · $${Number(p.monthly_investment).toLocaleString()}/mo</p>
                  </div>
                  <div class="text-right">
                    ${statusBadge('sent')}
                    <p class="text-xs text-gray-400 mt-1">Sent ${ago(p.sent_at)}</p>
                  </div>
                </div>
              `).join('')}
            </div>`}
        </div>

        <!-- Upcoming Content -->
        <div class="card">
          <h3 class="font-semibold text-gray-800 mb-4"><i class="fas fa-calendar text-green-500 mr-2"></i>Upcoming Content Deadlines</h3>
          ${(d.upcoming_content || []).length === 0 ? '<p class="text-gray-400 text-sm">No upcoming content</p>' :
            `<div class="space-y-3">
              ${(d.upcoming_content || []).map(ci => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p class="font-medium text-sm text-gray-900">${ci.title}</p>
                    <p class="text-xs text-gray-500">${ci.company_name} · ${ci.content_type.replace(/_/g,' ')}</p>
                  </div>
                  <div class="text-right">
                    ${statusBadge(ci.status)}
                    <p class="text-xs text-gray-400 mt-1">Due ${ci.due_date || 'TBD'}</p>
                  </div>
                </div>
              `).join('')}
            </div>`}
        </div>

        <!-- Recent Activity -->
        <div class="card lg:col-span-2">
          <h3 class="font-semibold text-gray-800 mb-4"><i class="fas fa-clock text-gray-400 mr-2"></i>Recent Activity</h3>
          <div class="space-y-2">
            ${(d.recent_activity || []).map(a => `
              <div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <i class="fas ${activityIcon(a.activity_type)} text-blue-500 text-xs"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-800">${a.description}</p>
                  <p class="text-xs text-gray-400">${a.company_name || ''} · ${ago(a.created_at)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function activityIcon(type) {
  const map = { client_created: 'fa-user-plus', proposal_created: 'fa-file-plus', proposal_sent: 'fa-paper-plane', proposal_approved: 'fa-check-circle' };
  return map[type] || 'fa-circle-dot';
}

// ==============================
// CLIENTS
// ==============================
function renderClients() {
  if (!state.clients.length) {
    loadClients();
    return loading();
  }
  return `
    <div class="space-y-4">
      <div class="flex gap-3">
        <input type="text" id="clientSearch" placeholder="Search clients..." class="input-field max-w-xs" oninput="filterClients(this.value)">
        <select id="clientStatusFilter" class="input-field max-w-xs" onchange="filterClients()">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="prospect">Prospect</option>
          <option value="paused">Paused</option>
          <option value="churned">Churned</option>
        </select>
      </div>
      <div id="clientsList" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${renderClientCards(state.clients)}
      </div>
    </div>
  `;
}

function renderClientCards(clients) {
  return clients.map(cl => `
    <div class="card hover:shadow-md transition cursor-pointer" onclick="navigate('client_detail', {selectedClient: ${JSON.stringify(cl).replace(/"/g, '&quot;')}})">
      <div class="flex items-start justify-between mb-3">
        <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center font-bold text-blue-700">
          ${cl.company_name.charAt(0)}
        </div>
        ${statusBadge(cl.status)}
      </div>
      <h3 class="font-semibold text-gray-900">${cl.company_name}</h3>
      <p class="text-sm text-gray-500 mt-0.5">${cl.website}</p>
      <div class="mt-3 pt-3 border-t border-gray-50 flex gap-4 text-xs text-gray-500">
        <span><i class="fas fa-rocket mr-1"></i>${cl.campaign_count || 0} campaigns</span>
        <span><i class="fas fa-key mr-1"></i>${cl.keyword_count || 0} keywords</span>
        ${cl.monthly_budget ? `<span class="ml-auto font-semibold text-gray-700">$${Number(cl.monthly_budget).toLocaleString()}/mo</span>` : ''}
      </div>
    </div>
  `).join('');
}

// ==============================
// CLIENT DETAIL
// ==============================
function renderClientDetail() {
  const cl = state.selectedClient;
  if (!cl) return '<p>No client selected</p>';
  if (!cl.campaigns) {
    loadClientDetail(cl.id);
    return loading();
  }
  return `
    <div class="space-y-6">
      <div class="flex items-center gap-2 text-sm text-gray-500 mb-2">
        <button onclick="navigate('clients')" class="hover:text-blue-600">Clients</button>
        <i class="fas fa-chevron-right text-xs"></i>
        <span class="text-gray-900 font-medium">${cl.company_name}</span>
      </div>

      <!-- Client Header -->
      <div class="card">
        <div class="flex items-start justify-between">
          <div class="flex gap-4 items-center">
            <div class="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl">
              ${cl.company_name.charAt(0)}
            </div>
            <div>
              <h2 class="text-xl font-bold text-gray-900">${cl.company_name}</h2>
              <a href="https://${cl.website}" target="_blank" class="text-blue-600 text-sm hover:underline">${cl.website}</a>
              <div class="flex gap-3 mt-1 text-sm text-gray-500">
                <span>${cl.industry || ''}</span>
                ${cl.location ? `<span>· ${cl.location}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            ${statusBadge(cl.status)}
            <button onclick="openEditClientModal()" class="btn-secondary"><i class="fas fa-edit mr-1"></i>Edit</button>
            <button onclick="navigate('new_proposal', {selectedClient: state.selectedClient})" class="btn-primary">
              <i class="fas fa-file-plus mr-1"></i>New Proposal
            </button>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div><p class="text-xs text-gray-400">Contact</p><p class="font-medium text-sm">${cl.contact_name}</p><p class="text-xs text-gray-500">${cl.contact_email}</p></div>
          <div><p class="text-xs text-gray-400">Monthly Budget</p><p class="font-bold text-lg text-blue-600">$${Number(cl.monthly_budget || 0).toLocaleString()}</p></div>
          <div><p class="text-xs text-gray-400">Client Since</p><p class="font-medium text-sm">${new Date(cl.created_at).toLocaleDateString('en-AU', {month:'short',year:'numeric'})}</p></div>
        </div>
      </div>

      <!-- Active Campaigns -->
      <div class="card">
        <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-rocket text-blue-500 mr-2"></i>Active Campaigns</h3>
        ${(cl.campaigns || []).length === 0 ? '<p class="text-gray-400 text-sm">No campaigns yet</p>' :
          `<div class="space-y-3">
            ${(cl.campaigns || []).map(ca => `
              <div class="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition"
                onclick="navigate('campaign_detail', {selectedCampaign: ${JSON.stringify(ca).replace(/"/g,'&quot;')}})">
                <div>
                  <p class="font-medium text-gray-900">${ca.name}</p>
                  <p class="text-xs text-gray-500">${ca.campaign_type.replace(/_/g,' ')} · Started ${ca.start_date}</p>
                </div>
                <div class="flex items-center gap-3">
                  <span class="font-semibold text-gray-700">$${Number(ca.monthly_investment).toLocaleString()}/mo</span>
                  ${statusBadge(ca.status)}
                  <i class="fas fa-chevron-right text-gray-300"></i>
                </div>
              </div>
            `).join('')}
          </div>`}
      </div>

      <!-- Proposals -->
      <div class="card">
        <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-file-contract text-green-500 mr-2"></i>Proposals</h3>
        ${(cl.proposals || []).length === 0 ? '<p class="text-gray-400 text-sm">No proposals yet</p>' :
          `<div class="space-y-2">
            ${(cl.proposals || []).map(p => `
              <div class="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                <div>
                  <p class="font-medium text-sm text-gray-900">${p.title}</p>
                  <p class="text-xs text-gray-400">$${Number(p.monthly_investment).toLocaleString()}/mo · ${p.contract_length}mo · ${p.created_at?.slice(0,10)}</p>
                </div>
                <div class="flex items-center gap-2">
                  ${statusBadge(p.status)}
                  ${p.status === 'draft' ? `<button onclick="sendProposal(${p.id})" class="btn-secondary text-xs">Send</button>` : ''}
                  ${p.status === 'sent' ? `<button onclick="copyApprovalLink('${p.approval_token}')" class="btn-secondary text-xs"><i class="fas fa-link mr-1"></i>Copy Link</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>`}
      </div>
    </div>
  `;
}

// ==============================
// CAMPAIGN DETAIL
// ==============================
function renderCampaignDetail() {
  const ca = state.selectedCampaign;
  if (!ca) return '<p>No campaign selected</p>';
  if (!ca.keywords && !ca._loaded) {
    loadCampaignDetail(ca.id);
    return loading();
  }
  const kws = ca.keywords || [];
  const top3 = kws.filter(k => k.current_rank && k.current_rank <= 3).length;
  const top10 = kws.filter(k => k.current_rank && k.current_rank <= 10).length;
  const llmPrompts = ca.llm_prompts || [];

  return `
    <div class="space-y-6">
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <button onclick="navigate('campaigns')" class="hover:text-blue-600">Campaigns</button>
        <i class="fas fa-chevron-right text-xs"></i>
        <span class="text-gray-900 font-medium">${ca.name}</span>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-xl font-bold text-gray-900">${ca.name}</h2>
            <p class="text-sm text-gray-500">${ca.company_name || ''} · ${ca.campaign_type?.replace(/_/g,' ')} · Started ${ca.start_date}</p>
          </div>
          <div class="flex gap-2 items-center">
            <span class="font-bold text-xl text-blue-600">$${Number(ca.monthly_investment).toLocaleString()}<span class="text-sm text-gray-400">/mo</span></span>
            ${statusBadge(ca.status)}
          </div>
        </div>
        <div class="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          ${[
            ['Keywords', kws.length, 'fa-key'],
            ['Top 3', top3, 'fa-trophy'],
            ['Top 10', top10, 'fa-star'],
            ['LLM Prompts', llmPrompts.length, 'fa-robot'],
          ].map(([l, v, i]) => `
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-900">${v}</div>
              <div class="text-xs text-gray-400 mt-1"><i class="fas ${i} mr-1"></i>${l}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Track Now Buttons -->
      <div class="flex gap-3">
        <button onclick="trackRankings('${ca.id}')" class="btn-primary">
          <i class="fas fa-sync-alt mr-2"></i>Track Rankings Now
        </button>
        <button onclick="trackLLM('${ca.id}')" class="btn-secondary">
          <i class="fas fa-robot mr-2"></i>Check LLM Mentions
        </button>
        <button onclick="generateReport('${ca.id}')" class="btn-success">
          <i class="fas fa-chart-line mr-2"></i>Generate Report
        </button>
      </div>

      <!-- Keywords Table -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900"><i class="fas fa-magnifying-glass-chart text-blue-500 mr-2"></i>Keyword Rankings</h3>
          <button onclick="openModal('new_keyword_modal')" class="btn-secondary text-xs"><i class="fas fa-plus mr-1"></i>Add Keywords</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th class="px-3 py-2 rounded-l-lg">Keyword</th>
                <th class="px-3 py-2 text-center">Current</th>
                <th class="px-3 py-2 text-center">Previous</th>
                <th class="px-3 py-2 text-center">Change</th>
                <th class="px-3 py-2">Group</th>
                <th class="px-3 py-2">Vol.</th>
                <th class="px-3 py-2 rounded-r-lg">Priority</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${kws.length === 0 ? '<tr><td colspan="7" class="px-3 py-8 text-center text-gray-400">No keywords yet</td></tr>' :
                kws.map(kw => `
                  <tr class="hover:bg-gray-50">
                    <td class="px-3 py-3">
                      <div class="font-medium text-gray-900">${kw.keyword}</div>
                      ${kw.target_url ? `<div class="text-xs text-gray-400 truncate max-w-xs">${kw.target_url}</div>` : ''}
                    </td>
                    <td class="px-3 py-3 text-center">${rankBadge(kw.current_rank)}</td>
                    <td class="px-3 py-3 text-center text-gray-400 text-sm">${kw.previous_rank || '–'}</td>
                    <td class="px-3 py-3 text-center">${rankChange(kw.current_rank, kw.previous_rank)}</td>
                    <td class="px-3 py-3 text-xs text-gray-500">${kw.keyword_group || '–'}</td>
                    <td class="px-3 py-3 text-xs text-gray-500">${kw.monthly_search_volume ? kw.monthly_search_volume.toLocaleString() : '–'}</td>
                    <td class="px-3 py-3">${statusBadge(kw.priority)}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- LLM Prompts -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900"><i class="fas fa-robot text-purple-500 mr-2"></i>AI/LLM Visibility Tracking</h3>
          <button onclick="openModal('new_llm_modal')" class="btn-secondary text-xs"><i class="fas fa-plus mr-1"></i>Add Prompt</button>
        </div>
        ${llmPrompts.length === 0 ? '<p class="text-gray-400 text-sm">No LLM prompts configured</p>' :
          `<div class="space-y-3">
            ${llmPrompts.map(p => `
              <div class="p-3 border border-gray-100 rounded-xl">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <p class="text-sm font-medium text-gray-800">"${p.prompt_text}"</p>
                    <p class="text-xs text-gray-400 mt-1">Target: ${p.target_brand || 'N/A'} · Model: ${p.llm_model}</p>
                  </div>
                  <span class="ml-4 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${p.latest_mentioned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                    ${p.latest_mentioned ? '✓ Mentioned' : '✗ Not Mentioned'}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>`}
      </div>
    </div>
  `;
}

// ==============================
// CAMPAIGNS LIST
// ==============================
function renderCampaigns() {
  if (!state.campaigns || !state.campaigns.length) {
    loadCampaigns();
    return loading();
  }
  return `
    <div class="space-y-4">
      ${state.campaigns.map(ca => `
        <div class="card hover:shadow-md transition cursor-pointer flex items-center justify-between"
          onclick="navigate('campaign_detail', {selectedCampaign: ${JSON.stringify(ca).replace(/"/g,'&quot;')}})">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <i class="fas fa-rocket text-blue-600"></i>
            </div>
            <div>
              <p class="font-semibold text-gray-900">${ca.name}</p>
              <p class="text-sm text-gray-500">${ca.company_name} · ${ca.campaign_type?.replace(/_/g,' ')} · ${ca.keyword_count || 0} keywords</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <p class="font-bold text-gray-700">$${Number(ca.monthly_investment).toLocaleString()}/mo</p>
              <p class="text-xs text-gray-400">since ${ca.start_date}</p>
            </div>
            ${statusBadge(ca.status)}
            <i class="fas fa-chevron-right text-gray-300"></i>
          </div>
        </div>
      `).join('')}
    </div>
    ${renderNewCampaignModal()}
  `;
}

// ==============================
// PROPOSALS
// ==============================
function renderProposals() {
  if (!state.proposals) {
    loadProposals();
    return loading();
  }
  return `
    <div class="space-y-4">
      ${(state.proposals || []).map(p => `
        <div class="card">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="font-semibold text-gray-900">${p.title}</h3>
              <p class="text-sm text-gray-500">${p.company_name} · ${p.contact_email}</p>
              <p class="text-xs text-gray-400 mt-1">Created ${p.created_at?.slice(0,10)} ${p.sent_at ? `· Sent ${p.sent_at?.slice(0,10)}` : ''}</p>
            </div>
            <div class="text-right flex flex-col items-end gap-2">
              <span class="text-xl font-bold text-blue-600">$${Number(p.monthly_investment).toLocaleString()}/mo</span>
              ${statusBadge(p.status)}
              <div class="flex gap-2 mt-1">
                ${p.status === 'draft' ? `<button onclick="sendProposal(${p.id})" class="btn-primary text-xs">Send to Client</button>` : ''}
                ${p.status === 'sent' ? `
                  <button onclick="copyApprovalLink('${p.approval_token}')" class="btn-secondary text-xs"><i class="fas fa-link mr-1"></i>Copy Link</button>
                  <a href="/proposals/approve/${p.approval_token}" target="_blank" class="btn-secondary text-xs"><i class="fas fa-eye mr-1"></i>Preview</a>
                ` : ''}
                ${p.status === 'approved' ? `<span class="text-xs text-green-600"><i class="fas fa-check-circle mr-1"></i>Approved ${p.approved_at?.slice(0,10)}</span>` : ''}
              </div>
            </div>
          </div>
          ${p.scope_summary ? `<p class="text-sm text-gray-600 mt-3 pt-3 border-t line-clamp-2">${p.scope_summary}</p>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// ==============================
// NEW PROPOSAL
// ==============================
function renderNewProposal() {
  const preClient = state.selectedClient;
  return `
    <div class="max-w-3xl space-y-6">
      <button onclick="navigate('proposals')" class="text-sm text-gray-500 hover:text-blue-600">
        <i class="fas fa-arrow-left mr-1"></i>Back to Proposals
      </button>

      <div class="card">
        <h2 class="text-lg font-bold text-gray-900 mb-5">Create New Proposal</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select id="pClientId" class="input-field" onchange="prefillProposalClient(this.value)">
              <option value="">Select client...</option>
              ${(state.clients || []).map(cl => `<option value="${cl.id}" ${preClient?.id == cl.id ? 'selected' : ''}>${cl.company_name}</option>`).join('')}
            </select>
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
            <select id="pType" class="input-field">
              <option value="organic_seo">Organic SEO</option>
              <option value="local_seo">Local SEO</option>
              <option value="content">Content Marketing</option>
              <option value="technical_seo">Technical SEO</option>
              <option value="full_service">Full Service</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Monthly Investment ($)</label>
            <input type="number" id="pInvestment" class="input-field" value="3000" min="500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contract Length (months)</label>
            <input type="number" id="pContractLength" class="input-field" value="12" min="1">
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Target Keywords (comma separated)</label>
            <input type="text" id="pKeywords" class="input-field" placeholder="e.g. plumber sydney, emergency plumber, blocked drain">
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Competitor Domains (comma separated)</label>
            <input type="text" id="pCompetitors" class="input-field" placeholder="e.g. competitor1.com.au, competitor2.com.au">
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Campaign Goals</label>
            <textarea id="pGoals" class="input-field" rows="2" placeholder="What outcomes does the client want?"></textarea>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="generateProposal()" class="btn-primary flex-1">
            <i class="fas fa-magic mr-2"></i>Auto-Generate Proposal Content
          </button>
        </div>
      </div>

      <div id="proposalPreview" class="hidden card">
        <h3 class="font-semibold text-gray-900 mb-4">Generated Proposal</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" id="pTitle" class="input-field">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Scope of Work</label>
            <textarea id="pScope" class="input-field" rows="6"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Deliverables</label>
            <textarea id="pDeliverables" class="input-field" rows="8"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Goals</label>
            <textarea id="pGoalsFinal" class="input-field" rows="3"></textarea>
          </div>
          <div class="flex gap-3 pt-4 border-t">
            <button onclick="saveProposal('draft')" class="btn-secondary flex-1">Save as Draft</button>
            <button onclick="saveProposal('send')" class="btn-primary flex-1">
              <i class="fas fa-paper-plane mr-2"></i>Save & Send to Client
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// NEW CLIENT
// ==============================
function renderNewClient() {
  return `
    <div class="max-w-2xl">
      <button onclick="navigate('clients')" class="text-sm text-gray-500 hover:text-blue-600 mb-4 block">
        <i class="fas fa-arrow-left mr-1"></i>Back to Clients
      </button>
      <div class="card">
        <h2 class="text-lg font-bold text-gray-900 mb-5">Add New Client</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
            <input type="text" id="newClientCompany" class="input-field" placeholder="Apex Plumbing Services">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
            <input type="text" id="newClientContact" class="input-field" placeholder="James Mitchell">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contact Email *</label>
            <input type="email" id="newClientEmail" class="input-field" placeholder="james@company.com">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" id="newClientPhone" class="input-field" placeholder="+61 2 9000 0000">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Website *</label>
            <input type="text" id="newClientWebsite" class="input-field" placeholder="apexplumbing.com.au">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Industry</label>
            <input type="text" id="newClientIndustry" class="input-field" placeholder="Trades & Home Services">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" id="newClientLocation" class="input-field" placeholder="Sydney, NSW, Australia">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Monthly Budget ($)</label>
            <input type="number" id="newClientBudget" class="input-field" placeholder="2500">
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea id="newClientNotes" class="input-field" rows="2" placeholder="Any notes about this client..."></textarea>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="navigate('clients')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveNewClient()" class="btn-primary flex-1">
            <i class="fas fa-user-plus mr-2"></i>Add Client
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// KEYWORDS
// ==============================
function renderKeywords() {
  if (!state.keywords) {
    loadKeywords();
    return loading();
  }
  const kws = state.keywords || [];
  const top3 = kws.filter(k => k.current_rank && k.current_rank <= 3).length;
  const top10 = kws.filter(k => k.current_rank && k.current_rank <= 10).length;

  return `
    <div class="space-y-5">
      <div class="grid grid-cols-4 gap-4">
        ${[
          ['Total Tracked', kws.length, 'bg-blue-50 text-blue-700'],
          ['Top 3', top3, 'bg-green-50 text-green-700'],
          ['Top 10', top10, 'bg-yellow-50 text-yellow-700'],
          ['Unranked', kws.filter(k => !k.current_rank || k.current_rank > 100).length, 'bg-gray-50 text-gray-600'],
        ].map(([l,v,c]) => `
          <div class="card text-center">
            <div class="text-3xl font-bold ${c.split(' ')[1]}">${v}</div>
            <div class="text-sm text-gray-500 mt-1">${l}</div>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="flex gap-3 mb-4">
          <select id="kwCampaignFilter" class="input-field max-w-xs" onchange="filterKeywords()">
            <option value="">All Campaigns</option>
            ${(state.campaigns || []).map(c => `<option value="${c.id}">${c.name} (${c.company_name})</option>`).join('')}
          </select>
          <select id="kwGroupFilter" class="input-field max-w-xs" onchange="filterKeywords()">
            <option value="">All Groups</option>
            ${[...new Set(kws.map(k => k.keyword_group).filter(Boolean))].map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
          <select id="kwPriorityFilter" class="input-field max-w-xs" onchange="filterKeywords()">
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th class="px-3 py-2 rounded-l-lg">Keyword</th>
                <th class="px-3 py-2 text-center">Rank</th>
                <th class="px-3 py-2 text-center">Change</th>
                <th class="px-3 py-2">Group</th>
                <th class="px-3 py-2">Vol.</th>
                <th class="px-3 py-2">KD</th>
                <th class="px-3 py-2">CPC</th>
                <th class="px-3 py-2 rounded-r-lg">Priority</th>
              </tr>
            </thead>
            <tbody id="kwTable" class="divide-y divide-gray-50">
              ${renderKeywordRows(kws)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ${renderNewKeywordModal()}
  `;
}

function renderKeywordRows(kws) {
  if (!kws.length) return '<tr><td colspan="8" class="px-3 py-8 text-center text-gray-400">No keywords found</td></tr>';
  return kws.map(kw => `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-3">
        <div class="font-medium text-gray-900">${kw.keyword}</div>
        ${kw.target_url ? `<div class="text-xs text-gray-400 truncate max-w-xs">${kw.target_url}</div>` : ''}
      </td>
      <td class="px-3 py-3 text-center">${rankBadge(kw.current_rank)}</td>
      <td class="px-3 py-3 text-center">${rankChange(kw.current_rank, kw.previous_rank)}</td>
      <td class="px-3 py-3 text-xs text-gray-500">${kw.keyword_group || '–'}</td>
      <td class="px-3 py-3 text-xs text-gray-500">${kw.monthly_search_volume?.toLocaleString() || '–'}</td>
      <td class="px-3 py-3 text-xs">${kw.keyword_difficulty ? `<span class="font-medium ${kw.keyword_difficulty > 70 ? 'text-red-500' : kw.keyword_difficulty > 40 ? 'text-yellow-600' : 'text-green-600'}">${kw.keyword_difficulty}</span>` : '–'}</td>
      <td class="px-3 py-3 text-xs text-gray-500">${kw.cpc ? `$${kw.cpc.toFixed(2)}` : '–'}</td>
      <td class="px-3 py-3">${statusBadge(kw.priority)}</td>
    </tr>
  `).join('');
}

// ==============================
// LLM TRACKING
// ==============================
function renderLLM() {
  if (!state.llmData) {
    loadLLM();
    return loading();
  }
  const prompts = state.llmData || [];
  const mentioned = prompts.filter(p => p.latest_mentioned).length;
  const total = prompts.length;
  const rate = total > 0 ? Math.round((mentioned / total) * 100) : 0;

  const byModel = {};
  for (const p of prompts) {
    if (!byModel[p.llm_model]) byModel[p.llm_model] = { total: 0, mentioned: 0 };
    byModel[p.llm_model].total++;
    if (p.latest_mentioned) byModel[p.llm_model].mentioned++;
  }

  return `
    <div class="space-y-5">
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card text-center">
          <div class="text-4xl font-bold text-purple-600">${rate}%</div>
          <div class="text-sm text-gray-500 mt-1">Overall Mention Rate</div>
        </div>
        <div class="card text-center">
          <div class="text-4xl font-bold text-green-600">${mentioned}</div>
          <div class="text-sm text-gray-500 mt-1">Prompts Mentioned</div>
        </div>
        <div class="card text-center">
          <div class="text-4xl font-bold text-gray-700">${total}</div>
          <div class="text-sm text-gray-500 mt-1">Total Prompts Tracked</div>
        </div>
        <div class="card">
          <p class="text-xs font-semibold text-gray-500 mb-2">By Model</p>
          ${Object.entries(byModel).map(([model, stats]) => `
            <div class="flex justify-between text-sm mb-1">
              <span class="capitalize text-gray-700">${model}</span>
              <span class="font-medium">${stats.mentioned}/${stats.total}</span>
            </div>
          `).join('') || '<p class="text-gray-400 text-sm">No data</p>'}
        </div>
      </div>

      <!-- Prompts Table -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900"><i class="fas fa-robot text-purple-500 mr-2"></i>LLM Prompt Performance</h3>
          <div class="flex gap-2">
            <button onclick="trackAllLLM()" class="btn-secondary"><i class="fas fa-sync-alt mr-1"></i>Refresh All</button>
          </div>
        </div>
        <div class="space-y-3">
          ${prompts.length === 0 ? '<p class="text-gray-400 text-sm py-4 text-center">No LLM prompts yet. Add prompts to track AI visibility.</p>' :
            prompts.map(p => `
              <div class="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <p class="text-sm font-medium text-gray-800">"${p.prompt_text}"</p>
                    <div class="flex gap-3 mt-2 text-xs text-gray-500">
                      <span><i class="fas fa-bullseye mr-1"></i>Brand: ${p.target_brand || 'N/A'}</span>
                      <span><i class="fas fa-robot mr-1"></i>${p.llm_model}</span>
                      <span><i class="fas fa-chart-bar mr-1"></i>${p.total_mentions || 0}/${p.total_checks || 0} mentions</span>
                    </div>
                  </div>
                  <div class="flex flex-col items-end gap-1">
                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${p.latest_mentioned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                      ${p.latest_mentioned ? '✓ Mentioned' : '✗ Not Mentioned'}
                    </span>
                    ${p.latest_sentiment && p.latest_sentiment !== 'not_mentioned' ? `
                      <span class="text-xs ${p.latest_sentiment === 'positive' ? 'text-green-500' : p.latest_sentiment === 'negative' ? 'text-red-500' : 'text-gray-400'}">
                        ${p.latest_sentiment}
                      </span>
                    ` : ''}
                    ${p.total_checks > 0 ? `
                      <div class="w-20 bg-gray-100 rounded-full h-1.5 mt-1">
                        <div class="bg-purple-500 h-1.5 rounded-full" style="width:${Math.round((p.total_mentions/p.total_checks)*100)}%"></div>
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>
    ${renderNewLLMModal()}
  `;
}

// ==============================
// CONTENT
// ==============================
function renderContent() {
  if (!state.contentItems) {
    loadContent();
    return loading();
  }
  const items = state.contentItems || [];
  const byStatus = {};
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  }

  return `
    <div class="space-y-5">
      <div class="grid grid-cols-3 lg:grid-cols-6 gap-3">
        ${['planned','briefed','in_progress','review','approved','published'].map(s => `
          <div class="card text-center py-3">
            <div class="text-2xl font-bold text-gray-800">${byStatus[s] || 0}</div>
            <div class="mt-1">${statusBadge(s)}</div>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="flex gap-3 mb-4">
          <select id="contentStatusFilter" class="input-field max-w-xs" onchange="filterContent()">
            <option value="">All Statuses</option>
            ${['planned','briefed','in_progress','review','approved','published','cancelled'].map(s => `<option value="${s}">${s.replace(/_/g,' ')}</option>`).join('')}
          </select>
          <select id="contentTypeFilter" class="input-field max-w-xs" onchange="filterContent()">
            <option value="">All Types</option>
            ${['blog_post','landing_page','meta_optimization','guestpost','press_release','faq_page'].map(t => `<option value="${t}">${t.replace(/_/g,' ')}</option>`).join('')}
          </select>
        </div>
        <div id="contentTable" class="space-y-2">
          ${renderContentRows(items)}
        </div>
      </div>
    </div>
    ${renderNewContentModal()}
    ${renderContentBriefModal()}
  `;
}

function renderContentRows(items) {
  if (!items.length) return '<p class="text-center text-gray-400 py-8">No content items yet</p>';
  return items.map(ci => `
    <div class="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition">
      <div class="flex-1">
        <p class="font-medium text-gray-900">${ci.title}</p>
        <div class="flex gap-3 mt-1 text-xs text-gray-500">
          <span>${ci.company_name}</span>
          <span>·</span>
          <span>${ci.content_type?.replace(/_/g,' ')}</span>
          ${ci.target_keyword ? `<span>· <i class="fas fa-key mr-0.5"></i>${ci.target_keyword}</span>` : ''}
          ${ci.due_date ? `<span>· Due ${ci.due_date}</span>` : ''}
          ${ci.word_count_target ? `<span>· ${ci.word_count_target.toLocaleString()} words</span>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-3 ml-4">
        ${statusBadge(ci.status)}
        <select class="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none" 
          onchange="updateContentStatus(${ci.id}, this.value)">
          ${['planned','briefed','in_progress','review','approved','published','cancelled'].map(s => `
            <option value="${s}" ${ci.status === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>
          `).join('')}
        </select>
        <button onclick="openBriefModal(${JSON.stringify(ci).replace(/"/g,'&quot;')})" class="text-xs text-blue-600 hover:underline">Brief</button>
      </div>
    </div>
  `).join('');
}

// ==============================
// REPORTS
// ==============================
function renderReports() {
  if (!state.reports) {
    loadReports();
    return loading();
  }
  return `
    <div class="space-y-4">
      <div class="flex gap-3 mb-2">
        <button onclick="openModal('generate_report_modal')" class="btn-primary">
          <i class="fas fa-magic mr-2"></i>Generate New Report
        </button>
      </div>
      ${(state.reports || []).length === 0 ? '<div class="card text-center py-12 text-gray-400"><i class="fas fa-chart-line text-4xl mb-3"></i><p>No reports yet</p></div>' :
        (state.reports || []).map(r => `
          <div class="card">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="font-semibold text-gray-900">${r.company_name} · ${r.report_period}</h3>
                <p class="text-sm text-gray-500">${r.campaign_name} · ${r.report_type} report</p>
                <p class="text-xs text-gray-400 mt-1">Generated ${r.created_at?.slice(0,10)}</p>
              </div>
              <div class="flex items-center gap-3">
                ${statusBadge(r.status)}
                <div class="flex gap-2">
                  <a href="/reports/view/${r.report_token}" target="_blank" class="btn-secondary text-xs">
                    <i class="fas fa-eye mr-1"></i>View
                  </a>
                  ${r.status === 'generated' ? `<button onclick="sendReport(${r.id})" class="btn-primary text-xs">
                    <i class="fas fa-paper-plane mr-1"></i>Send
                  </button>` : ''}
                </div>
              </div>
            </div>
            <div class="grid grid-cols-5 gap-3 mt-4 pt-3 border-t border-gray-50">
              ${[
                ['Improved', r.keywords_improved, 'text-green-600'],
                ['Declined', r.keywords_declined, 'text-red-500'],
                ['Top 10', r.top10_keywords, 'text-blue-600'],
                ['Top 3', r.top3_keywords, 'text-yellow-600'],
                ['LLM Mentions', r.llm_mentions, 'text-purple-600'],
              ].map(([l, v, c]) => `
                <div class="text-center">
                  <div class="text-xl font-bold ${c}">${v || 0}</div>
                  <div class="text-xs text-gray-400">${l}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
    </div>
    ${renderGenerateReportModal()}
  `;
}

// ==============================
// DATAFORSEO TOOLS
// ==============================
function renderDataForSEO() {
  const status = state.dataforseoStatus;
  return `
    <div class="space-y-6">
      <div class="card ${status?.connected ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'} border">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl ${status?.connected ? 'bg-green-100' : 'bg-yellow-100'} flex items-center justify-center">
            <i class="fas fa-database ${status?.connected ? 'text-green-600' : 'text-yellow-600'} text-xl"></i>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900">DataForSEO Connection Status</h3>
            ${status?.connected
              ? `<p class="text-sm text-green-600"><i class="fas fa-check-circle mr-1"></i>Live Mode — Connected as ${status.login} · Balance: ${status.credits}</p>`
              : `<p class="text-sm text-yellow-700"><i class="fas fa-exclamation-triangle mr-1"></i>Demo Mode — Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable live data</p>`}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Keyword Research Tool -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-search text-blue-500 mr-2"></i>Keyword Research</h3>
          <div class="space-y-3">
            <input type="text" id="kwResearchInput" class="input-field" placeholder="Enter seed keyword...">
            <select id="kwResearchLocation" class="input-field">
              <option value="2036">Australia</option>
              <option value="2840" selected>United States</option>
              <option value="2826">United Kingdom</option>
              <option value="2124">Canada</option>
              <option value="2554">New Zealand</option>
            </select>
            <button onclick="runKeywordResearch()" class="btn-primary w-full"><i class="fas fa-search mr-2"></i>Research Keywords</button>
          </div>
          <div id="kwResearchResults" class="mt-4 space-y-1 max-h-60 overflow-y-auto hidden">
            <!-- Results populated here -->
          </div>
        </div>

        <!-- SERP Analysis Tool -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-list-ol text-green-500 mr-2"></i>SERP Analysis</h3>
          <div class="space-y-3">
            <input type="text" id="serpAnalysisInput" class="input-field" placeholder="Enter keyword to analyze...">
            <select id="serpLocation" class="input-field">
              <option value="2036">Australia</option>
              <option value="2840" selected>United States</option>
              <option value="2826">United Kingdom</option>
              <option value="2124">Canada</option>
            </select>
            <button onclick="runSerpAnalysis()" class="btn-primary w-full"><i class="fas fa-chart-bar mr-2"></i>Analyze SERP</button>
          </div>
          <div id="serpResults" class="mt-4 space-y-2 max-h-60 overflow-y-auto hidden"></div>
        </div>

        <!-- Competitor Analysis -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-chess text-purple-500 mr-2"></i>Competitor Analysis</h3>
          <div class="space-y-3">
            <input type="text" id="compAnalysisInput" class="input-field" placeholder="Enter domain (e.g. competitor.com.au)">
            <button onclick="runCompetitorAnalysis()" class="btn-primary w-full"><i class="fas fa-crosshairs mr-2"></i>Analyze Competitor</button>
          </div>
          <div id="compResults" class="mt-4 hidden"></div>
        </div>

        <!-- Backlink Checker -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-link text-orange-500 mr-2"></i>Backlink Checker</h3>
          <div class="space-y-3">
            <input type="text" id="backlinkInput" class="input-field" placeholder="Enter domain to check...">
            <button onclick="runBacklinkCheck()" class="btn-primary w-full"><i class="fas fa-search mr-2"></i>Check Backlinks</button>
          </div>
          <div id="backlinkResults" class="mt-4 hidden"></div>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// MODALS
// ==============================
function renderNewCampaignModal() {
  return `
    <div id="new_campaign_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">New Campaign</h3>
          <button onclick="closeModal('new_campaign_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Client</label>
            <select id="ncClient" class="input-field">
              ${(state.clients || []).map(c => `<option value="${c.id}">${c.company_name}</option>`).join('')}
            </select>
          </div>
          <div><label class="block text-sm font-medium mb-1">Campaign Name</label>
            <input type="text" id="ncName" class="input-field" placeholder="Apex Plumbing Organic SEO">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium mb-1">Type</label>
              <select id="ncType" class="input-field">
                <option value="organic_seo">Organic SEO</option>
                <option value="local_seo">Local SEO</option>
                <option value="content">Content</option>
                <option value="technical_seo">Technical SEO</option>
                <option value="full_service">Full Service</option>
              </select>
            </div>
            <div><label class="block text-sm font-medium mb-1">Start Date</label>
              <input type="date" id="ncStart" class="input-field" value="${new Date().toISOString().slice(0,10)}">
            </div>
          </div>
          <div><label class="block text-sm font-medium mb-1">Monthly Investment ($)</label>
            <input type="number" id="ncInvestment" class="input-field" placeholder="3000">
          </div>
          <div><label class="block text-sm font-medium mb-1">Goals</label>
            <textarea id="ncGoals" class="input-field" rows="2"></textarea>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_campaign_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveNewCampaign()" class="btn-primary flex-1">Create Campaign</button>
        </div>
      </div>
    </div>
  `;
}

function renderNewKeywordModal() {
  return `
    <div id="new_keyword_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">Add Keywords</h3>
          <button onclick="closeModal('new_keyword_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Campaign</label>
            <select id="nkCampaign" class="input-field" onchange="updateNkClient(this.value)">
              ${(state.campaigns || []).map(c => `<option value="${c.id}" data-client="${c.client_id}">${c.name} (${c.company_name})</option>`).join('')}
            </select>
          </div>
          <input type="hidden" id="nkClientId">
          <div><label class="block text-sm font-medium mb-1">Keywords (one per line)</label>
            <textarea id="nkKeywords" class="input-field" rows="5" placeholder="plumber sydney&#10;emergency plumber sydney&#10;blocked drain sydney"></textarea>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="block text-sm font-medium mb-1">Location</label>
              <select id="nkLocation" class="input-field">
                <option value="2036">Australia</option>
                <option value="2840">United States</option>
                <option value="2826">United Kingdom</option>
              </select>
            </div>
            <div><label class="block text-sm font-medium mb-1">Group</label>
              <input type="text" id="nkGroup" class="input-field" placeholder="Core Services">
            </div>
            <div><label class="block text-sm font-medium mb-1">Priority</label>
              <select id="nkPriority" class="input-field">
                <option value="high">High</option>
                <option value="medium" selected>Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_keyword_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveNewKeywords()" class="btn-primary flex-1">Add Keywords</button>
        </div>
      </div>
    </div>
  `;
}

function renderNewLLMModal() {
  return `
    <div id="new_llm_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">Add LLM Prompt</h3>
          <button onclick="closeModal('new_llm_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Campaign</label>
            <select id="nlCampaign" class="input-field" onchange="updateNlClient(this.value)">
              ${(state.campaigns || []).map(c => `<option value="${c.id}" data-client="${c.client_id}">${c.name} (${c.company_name})</option>`).join('')}
            </select>
          </div>
          <input type="hidden" id="nlClientId">
          <div><label class="block text-sm font-medium mb-1">Prompt Text</label>
            <textarea id="nlPrompt" class="input-field" rows="3" placeholder="Who are the best plumbers in Sydney?"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium mb-1">Target Brand</label>
              <input type="text" id="nlBrand" class="input-field" placeholder="Apex Plumbing">
            </div>
            <div><label class="block text-sm font-medium mb-1">LLM Model</label>
              <select id="nlModel" class="input-field">
                <option value="chatgpt">ChatGPT</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
                <option value="perplexity">Perplexity</option>
              </select>
            </div>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_llm_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveNewLLMPrompt()" class="btn-primary flex-1">Add Prompt</button>
        </div>
      </div>
    </div>
  `;
}

function renderNewContentModal() {
  return `
    <div id="new_content_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">New Content Item</h3>
          <button onclick="closeModal('new_content_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Campaign</label>
            <select id="ncoCampaign" class="input-field" onchange="updateNcoClient(this.value)">
              ${(state.campaigns || []).map(c => `<option value="${c.id}" data-client="${c.client_id}">${c.name} (${c.company_name})</option>`).join('')}
            </select>
          </div>
          <input type="hidden" id="ncoClientId">
          <div><label class="block text-sm font-medium mb-1">Title *</label>
            <input type="text" id="ncoTitle" class="input-field" placeholder="How to Choose the Best Plumber in Sydney">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium mb-1">Content Type</label>
              <select id="ncoType" class="input-field">
                <option value="blog_post">Blog Post</option>
                <option value="landing_page">Landing Page</option>
                <option value="faq_page">FAQ Page</option>
                <option value="meta_optimization">Meta Optimization</option>
                <option value="guestpost">Guest Post</option>
                <option value="press_release">Press Release</option>
              </select>
            </div>
            <div><label class="block text-sm font-medium mb-1">Target Keyword</label>
              <input type="text" id="ncoKeyword" class="input-field" placeholder="plumber sydney">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium mb-1">Word Count</label>
              <input type="number" id="ncoWords" class="input-field" value="1500">
            </div>
            <div><label class="block text-sm font-medium mb-1">Due Date</label>
              <input type="date" id="ncoDue" class="input-field">
            </div>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_content_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="autoGenerateBrief()" class="btn-secondary flex-1"><i class="fas fa-magic mr-1"></i>Generate Brief</button>
          <button onclick="saveNewContent()" class="btn-primary flex-1">Add Content</button>
        </div>
      </div>
    </div>
  `;
}

function renderContentBriefModal() {
  return `
    <div id="content_brief_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold" id="briefModalTitle">Content Brief</h3>
          <button onclick="closeModal('content_brief_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div id="briefContent" class="prose prose-sm max-w-none text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto p-4 bg-gray-50 rounded-xl font-mono text-xs leading-relaxed"></div>
        <div class="flex gap-3 mt-4">
          <button onclick="closeModal('content_brief_modal')" class="btn-secondary flex-1">Close</button>
          <button onclick="copyBrief()" class="btn-primary flex-1"><i class="fas fa-copy mr-1"></i>Copy Brief</button>
        </div>
      </div>
    </div>
  `;
}

function renderGenerateReportModal() {
  return `
    <div id="generate_report_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">Generate Report</h3>
          <button onclick="closeModal('generate_report_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Campaign</label>
            <select id="grCampaign" class="input-field">
              ${(state.campaigns || []).map(c => `<option value="${c.id}">${c.name} (${c.company_name})</option>`).join('')}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium mb-1">Report Period</label>
              <input type="text" id="grPeriod" class="input-field" placeholder="March 2026" value="${new Date().toLocaleString('en', {month:'long',year:'numeric'})}">
            </div>
            <div><label class="block text-sm font-medium mb-1">Report Type</label>
              <select id="grType" class="input-field">
                <option value="monthly" selected>Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('generate_report_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="doGenerateReport()" class="btn-primary flex-1"><i class="fas fa-magic mr-2"></i>Generate Report</button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// DATA LOADING
// ==============================
async function loadDashboard() {
  try {
    const res = await API.get('/dashboard/overview');
    state.dashboardData = res.data;
    render();
  } catch (e) { console.error(e); }
}

async function loadClients() {
  try {
    const res = await API.get('/clients');
    state.clients = res.data;
    render();
  } catch (e) { console.error(e); }
}

async function loadClientDetail(id) {
  try {
    const res = await API.get(`/clients/${id}`);
    state.selectedClient = res.data;
    render();
  } catch (e) { console.error(e); }
}

async function loadCampaigns() {
  try {
    const res = await API.get('/campaigns');
    state.campaigns = res.data;
    render();
  } catch (e) { console.error(e); }
}

async function loadCampaignDetail(id) {
  try {
    const res = await API.get(`/campaigns/${id}`);
    state.selectedCampaign = { ...res.data, _loaded: true };
    // Load current ranks
    const ranks = await API.get(`/rank-tracking/campaign/${id}`);
    state.selectedCampaign.keywords = ranks.data.keywords;
    render();
  } catch (e) { console.error(e); }
}

async function loadProposals() {
  try {
    const res = await API.get('/proposals');
    state.proposals = res.data;
    render();
  } catch (e) { console.error(e); }
}

async function loadKeywords() {
  try {
    const [kwRes, camRes] = await Promise.all([
      API.get('/keywords'),
      state.campaigns?.length ? Promise.resolve({ data: state.campaigns }) : API.get('/campaigns')
    ]);
    state.keywords = kwRes.data;
    state.campaigns = camRes.data;
    render();
  } catch (e) { console.error(e); }
}

async function loadLLM() {
  try {
    const [llmRes, camRes] = await Promise.all([
      API.get('/llm/prompts'),
      state.campaigns?.length ? Promise.resolve({ data: state.campaigns }) : API.get('/campaigns')
    ]);
    state.llmData = llmRes.data;
    state.campaigns = camRes.data;
    render();
  } catch (e) { console.error(e); }
}

async function loadContent() {
  try {
    const [res, camRes] = await Promise.all([
      API.get('/content'),
      state.campaigns?.length ? Promise.resolve({ data: state.campaigns }) : API.get('/campaigns')
    ]);
    state.contentItems = res.data;
    state.campaigns = camRes.data;
    render();
  } catch (e) { console.error(e); }
}

async function loadReports() {
  try {
    const [res, camRes] = await Promise.all([
      API.get('/reports'),
      state.campaigns?.length ? Promise.resolve({ data: state.campaigns }) : API.get('/campaigns')
    ]);
    state.reports = res.data;
    state.campaigns = camRes.data;
    render();
  } catch (e) { console.error(e); }
}

async function checkDataForSEOStatus() {
  try {
    const res = await API.get('/dataforseo/status');
    state.dataforseoStatus = res.data;
  } catch (e) {}
}

// ==============================
// ACTIONS
// ==============================
async function saveNewClient() {
  const data = {
    company_name: document.getElementById('newClientCompany')?.value,
    contact_name: document.getElementById('newClientContact')?.value,
    contact_email: document.getElementById('newClientEmail')?.value,
    contact_phone: document.getElementById('newClientPhone')?.value,
    website: document.getElementById('newClientWebsite')?.value,
    industry: document.getElementById('newClientIndustry')?.value,
    location: document.getElementById('newClientLocation')?.value,
    monthly_budget: document.getElementById('newClientBudget')?.value,
    notes: document.getElementById('newClientNotes')?.value,
  };
  if (!data.company_name || !data.contact_email || !data.website) {
    toast('Please fill in required fields', 'error'); return;
  }
  try {
    await API.post('/clients', data);
    toast('Client added successfully!');
    state.clients = null;
    navigate('clients');
  } catch (e) { toast('Failed to add client', 'error'); }
}

async function generateProposal() {
  const clientId = document.getElementById('pClientId')?.value;
  if (!clientId) { toast('Please select a client', 'error'); return; }
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
  btn.disabled = true;
  try {
    const res = await API.post('/proposals/generate', {
      client_id: clientId,
      proposal_type: document.getElementById('pType')?.value,
      monthly_investment: document.getElementById('pInvestment')?.value,
      target_keywords: document.getElementById('pKeywords')?.value,
      competitor_domains: document.getElementById('pCompetitors')?.value,
      goals: document.getElementById('pGoals')?.value,
    });
    const p = res.data;
    document.getElementById('pTitle').value = p.title;
    document.getElementById('pScope').value = p.scope_summary;
    document.getElementById('pDeliverables').value = p.deliverables;
    document.getElementById('pGoalsFinal').value = p.goals;
    document.getElementById('pContractLength').value = p.contract_length;
    document.getElementById('proposalPreview').classList.remove('hidden');
    toast('Proposal content generated!');
  } catch (e) { toast('Generation failed', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-magic mr-2"></i>Auto-Generate Proposal Content'; btn.disabled = false; }
}

async function saveProposal(action) {
  const clientId = document.getElementById('pClientId')?.value;
  if (!clientId) { toast('Please select a client', 'error'); return; }
  try {
    const res = await API.post('/proposals', {
      client_id: clientId,
      title: document.getElementById('pTitle')?.value,
      proposal_type: document.getElementById('pType')?.value,
      monthly_investment: document.getElementById('pInvestment')?.value,
      contract_length: document.getElementById('pContractLength')?.value,
      scope_summary: document.getElementById('pScope')?.value,
      deliverables: document.getElementById('pDeliverables')?.value,
      target_keywords: document.getElementById('pKeywords')?.value,
      competitor_domains: document.getElementById('pCompetitors')?.value,
      goals: document.getElementById('pGoalsFinal')?.value,
    });
    if (action === 'send') {
      await API.post(`/proposals/${res.data.id}/send`);
      toast('Proposal saved and sent to client!');
    } else {
      toast('Proposal saved as draft');
    }
    state.proposals = null;
    navigate('proposals');
  } catch (e) { toast('Failed to save proposal', 'error'); }
}

async function sendProposal(id) {
  try {
    const res = await API.post(`/proposals/${id}/send`);
    const url = window.location.origin + res.data.approval_url;
    toast('Proposal sent! Approval link: ' + url);
    await loadProposals();
    if (state.selectedClient?.id) await loadClientDetail(state.selectedClient.id);
    render();
  } catch (e) { toast('Failed to send proposal', 'error'); }
}

function copyApprovalLink(token) {
  const url = window.location.origin + `/proposals/approve/${token}`;
  navigator.clipboard.writeText(url).then(() => toast('Approval link copied!'));
}

async function saveNewCampaign() {
  const clientId = document.getElementById('ncClient')?.value;
  if (!clientId) { toast('Please select a client', 'error'); return; }
  try {
    await API.post('/campaigns', {
      client_id: clientId,
      name: document.getElementById('ncName')?.value,
      campaign_type: document.getElementById('ncType')?.value,
      start_date: document.getElementById('ncStart')?.value,
      monthly_investment: document.getElementById('ncInvestment')?.value,
      goals: document.getElementById('ncGoals')?.value,
    });
    toast('Campaign created!');
    closeModal('new_campaign_modal');
    state.campaigns = null;
    navigate('campaigns');
  } catch (e) { toast('Failed to create campaign', 'error'); }
}

async function saveNewKeywords() {
  const campaignId = document.getElementById('nkCampaign')?.value;
  const clientId = document.getElementById('nkClientId')?.value || document.querySelector('#nkCampaign option:checked')?.dataset?.client;
  const rawKeywords = document.getElementById('nkKeywords')?.value || '';
  const keywords = rawKeywords.split('\n').map(k => k.trim()).filter(Boolean);

  if (!keywords.length) { toast('Enter at least one keyword', 'error'); return; }

  try {
    await API.post('/keywords/bulk', {
      campaign_id: campaignId,
      client_id: clientId,
      keywords: keywords.map(kw => ({
        keyword: kw,
        location_code: parseInt(document.getElementById('nkLocation')?.value || '2840'),
        keyword_group: document.getElementById('nkGroup')?.value,
        priority: document.getElementById('nkPriority')?.value,
      }))
    });
    toast(`${keywords.length} keywords added!`);
    closeModal('new_keyword_modal');
    state.keywords = null;
    if (state.page === 'campaign_detail') loadCampaignDetail(campaignId);
    else loadKeywords();
  } catch (e) { toast('Failed to add keywords', 'error'); }
}

async function saveNewLLMPrompt() {
  const campaignId = document.getElementById('nlCampaign')?.value;
  const clientId = document.querySelector('#nlCampaign option:checked')?.dataset?.client;
  try {
    await API.post('/llm/prompts', {
      campaign_id: campaignId,
      client_id: clientId,
      prompt_text: document.getElementById('nlPrompt')?.value,
      target_brand: document.getElementById('nlBrand')?.value,
      llm_model: document.getElementById('nlModel')?.value,
    });
    toast('LLM prompt added!');
    closeModal('new_llm_modal');
    state.llmData = null;
    loadLLM();
  } catch (e) { toast('Failed to add prompt', 'error'); }
}

async function saveNewContent() {
  const campaignId = document.getElementById('ncoCampaign')?.value;
  const clientId = document.querySelector('#ncoCampaign option:checked')?.dataset?.client;
  try {
    await API.post('/content', {
      campaign_id: campaignId,
      client_id: clientId,
      title: document.getElementById('ncoTitle')?.value,
      content_type: document.getElementById('ncoType')?.value,
      target_keyword: document.getElementById('ncoKeyword')?.value,
      word_count_target: document.getElementById('ncoWords')?.value,
      due_date: document.getElementById('ncoDue')?.value || null,
    });
    toast('Content item added!');
    closeModal('new_content_modal');
    state.contentItems = null;
    loadContent();
  } catch (e) { toast('Failed to add content', 'error'); }
}

async function trackRankings(campaignId) {
  const btn = event?.target;
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Tracking...'; btn.disabled = true; }
  try {
    const res = await API.post(`/rank-tracking/track/${campaignId}`);
    const data = res.data;
    toast(`Tracked ${data.tracked} keywords! ${data.mode === 'demo' ? '(Demo data)' : ''}`);
    if (state.selectedCampaign?.id == campaignId) loadCampaignDetail(campaignId);
    if (state.page === 'keywords') { state.keywords = null; loadKeywords(); }
  } catch (e) { toast('Tracking failed', 'error'); }
  finally { if (btn) { btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Track Rankings Now'; btn.disabled = false; } }
}

async function trackLLM(campaignId) {
  const btn = event?.target;
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Checking...'; btn.disabled = true; }
  try {
    const res = await API.post(`/llm/track/${campaignId}`);
    toast(`Checked ${res.data.tracked} LLM prompts! ${res.data.mode === 'demo' ? '(Demo)' : ''}`);
    state.llmData = null;
    if (state.page === 'campaign_detail') loadCampaignDetail(campaignId);
    else loadLLM();
  } catch (e) { toast('LLM check failed', 'error'); }
  finally { if (btn) { btn.innerHTML = '<i class="fas fa-robot mr-2"></i>Check LLM Mentions'; btn.disabled = false; } }
}

async function trackAllLLM() {
  try {
    const campaigns = state.campaigns || (await API.get('/campaigns')).data;
    for (const ca of campaigns.filter(c => c.status === 'active')) {
      await API.post(`/llm/track/${ca.id}`);
    }
    toast('LLM tracking complete for all campaigns!');
    state.llmData = null;
    loadLLM();
  } catch (e) { toast('LLM tracking failed', 'error'); }
}

async function generateReport(campaignId) {
  const period = new Date().toLocaleString('en', {month:'long',year:'numeric'});
  const btn = event?.target;
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...'; btn.disabled = true; }
  try {
    const res = await API.post('/reports/generate', { campaign_id: campaignId, report_period: period });
    toast('Report generated!');
    window.open('/reports/view/' + res.data.report_token, '_blank');
    if (state.page === 'reports') { state.reports = null; loadReports(); }
  } catch (e) { toast('Report generation failed', 'error'); }
  finally { if (btn) { btn.innerHTML = '<i class="fas fa-chart-line mr-2"></i>Generate Report'; btn.disabled = false; } }
}

async function doGenerateReport() {
  const campaignId = document.getElementById('grCampaign')?.value;
  const period = document.getElementById('grPeriod')?.value;
  try {
    const res = await API.post('/reports/generate', {
      campaign_id: campaignId,
      report_period: period,
      report_type: document.getElementById('grType')?.value,
    });
    toast('Report generated!');
    closeModal('generate_report_modal');
    window.open('/reports/view/' + res.data.report_token, '_blank');
    state.reports = null;
    loadReports();
  } catch (e) { toast('Failed to generate report', 'error'); }
}

async function sendReport(id) {
  try {
    const res = await API.post(`/reports/${id}/send`);
    toast(`Report sent! View link: ${window.location.origin}${res.data.view_url}`);
    state.reports = null;
    loadReports();
  } catch (e) { toast('Failed to send report', 'error'); }
}

async function updateContentStatus(id, status) {
  try {
    await API.put(`/content/${id}`, { status });
    const item = state.contentItems?.find(i => i.id === id);
    if (item) item.status = status;
    toast('Status updated');
  } catch (e) { toast('Failed to update', 'error'); }
}

async function openBriefModal(ci) {
  document.getElementById('briefModalTitle').textContent = ci.title;
  if (ci.brief) {
    document.getElementById('briefContent').textContent = ci.brief;
    openModal('content_brief_modal');
    return;
  }
  document.getElementById('briefContent').textContent = 'Generating brief...';
  openModal('content_brief_modal');
  try {
    const res = await API.post('/content/generate-brief', {
      keyword: ci.target_keyword || ci.title,
      content_type: ci.content_type,
      client_id: ci.client_id,
      word_count: ci.word_count_target,
    });
    document.getElementById('briefContent').textContent = res.data.brief;
    // Save brief to item
    await API.put(`/content/${ci.id}`, { ...ci, brief: res.data.brief });
  } catch (e) { document.getElementById('briefContent').textContent = 'Failed to generate brief.'; }
}

async function autoGenerateBrief() {
  const keyword = document.getElementById('ncoKeyword')?.value;
  const type = document.getElementById('ncoType')?.value;
  if (!keyword) { toast('Enter a target keyword first', 'warning'); return; }
  try {
    const res = await API.post('/content/generate-brief', { keyword, content_type: type, word_count: document.getElementById('ncoWords')?.value });
    if (!document.getElementById('ncoTitle').value) {
      document.getElementById('ncoTitle').value = res.data.title;
    }
    toast('Brief generated! Save to view it.');
  } catch (e) { toast('Failed to generate brief', 'error'); }
}

function copyBrief() {
  const text = document.getElementById('briefContent')?.textContent;
  if (text) navigator.clipboard.writeText(text).then(() => toast('Brief copied!'));
}

// DataForSEO Tools
async function runKeywordResearch() {
  const keyword = document.getElementById('kwResearchInput')?.value;
  if (!keyword) { toast('Enter a keyword', 'warning'); return; }
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Researching...';
  btn.disabled = true;
  try {
    const res = await API.post('/dataforseo/keyword-research', {
      keyword,
      location_code: parseInt(document.getElementById('kwResearchLocation')?.value || '2840'),
    });
    const resultsDiv = document.getElementById('kwResearchResults');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = res.data.suggestions.map(s => `
      <div class="flex items-center justify-between p-2 text-xs border-b border-gray-50">
        <span class="font-medium text-gray-800">${s.keyword}</span>
        <div class="flex gap-3 text-gray-500">
          <span><i class="fas fa-chart-bar mr-1"></i>${s.search_volume?.toLocaleString() || '-'}</span>
          <span class="${s.keyword_difficulty > 70 ? 'text-red-500' : s.keyword_difficulty > 40 ? 'text-yellow-600' : 'text-green-600'}">${s.keyword_difficulty || '-'} KD</span>
          <span>$${s.cpc || '-'}</span>
        </div>
      </div>
    `).join('');
    toast(`Found ${res.data.suggestions.length} keywords`);
  } catch (e) { toast('Research failed', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-search mr-2"></i>Research Keywords'; btn.disabled = false; }
}

async function runSerpAnalysis() {
  const keyword = document.getElementById('serpAnalysisInput')?.value;
  if (!keyword) { toast('Enter a keyword', 'warning'); return; }
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing...';
  btn.disabled = true;
  try {
    const res = await API.get(`/rank-tracking/serp-analysis?keyword=${encodeURIComponent(keyword)}&location_code=${document.getElementById('serpLocation')?.value || '2840'}`);
    const resultsDiv = document.getElementById('serpResults');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      ${res.data.serp_features?.length ? `<p class="text-xs text-gray-500 mb-2">SERP Features: ${res.data.serp_features.join(', ')}</p>` : ''}
      ${res.data.organic_results?.map(r => `
        <div class="p-2 text-xs border-b border-gray-50">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded bg-gray-100 text-gray-600 flex items-center justify-center font-bold flex-shrink-0">${r.position}</span>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-blue-600 truncate">${r.title}</p>
              <p class="text-gray-400 truncate">${r.url}</p>
            </div>
          </div>
        </div>
      `).join('') || ''}
    `;
    toast('SERP analyzed!');
  } catch (e) { toast('SERP analysis failed', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-chart-bar mr-2"></i>Analyze SERP'; btn.disabled = false; }
}

async function runCompetitorAnalysis() {
  const domain = document.getElementById('compAnalysisInput')?.value;
  if (!domain) { toast('Enter a domain', 'warning'); return; }
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing...';
  btn.disabled = true;
  try {
    const res = await API.post('/dataforseo/competitor-analysis', { domain });
    const d = res.data;
    document.getElementById('compResults').innerHTML = `
      <div class="space-y-2 text-sm">
        <div class="grid grid-cols-3 gap-2">
          <div class="p-2 bg-blue-50 rounded-lg text-center">
            <div class="font-bold text-blue-700">${d.rank_overview?.organic_traffic?.toLocaleString() || '-'}</div>
            <div class="text-xs text-gray-500">Est. Traffic</div>
          </div>
          <div class="p-2 bg-green-50 rounded-lg text-center">
            <div class="font-bold text-green-700">${d.rank_overview?.organic_keywords?.toLocaleString() || '-'}</div>
            <div class="text-xs text-gray-500">Keywords</div>
          </div>
          <div class="p-2 bg-purple-50 rounded-lg text-center">
            <div class="font-bold text-purple-700">${d.rank_overview?.domain_rank || '-'}</div>
            <div class="text-xs text-gray-500">Domain Rank</div>
          </div>
        </div>
        <p class="font-medium text-xs text-gray-600 mt-2">Top Competitors:</p>
        ${d.competitors?.slice(0,5).map(c => `
          <div class="flex justify-between text-xs p-1 border-b border-gray-50">
            <span class="font-medium">${c.domain}</span>
            <span class="text-gray-500">${c.organic_traffic?.toLocaleString() || '-'} visits</span>
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('compResults').classList.remove('hidden');
    toast('Competitor analyzed!');
  } catch (e) { toast('Analysis failed', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-crosshairs mr-2"></i>Analyze Competitor'; btn.disabled = false; }
}

async function runBacklinkCheck() {
  const domain = document.getElementById('backlinkInput')?.value;
  if (!domain) { toast('Enter a domain', 'warning'); return; }
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Checking...';
  btn.disabled = true;
  try {
    const res = await API.post('/dataforseo/backlinks', { target: domain });
    const d = res.data;
    document.getElementById('backlinkResults').innerHTML = `
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="p-3 bg-blue-50 rounded-xl text-center">
          <div class="text-xl font-bold text-blue-700">${d.backlinks_count?.toLocaleString() || '-'}</div>
          <div class="text-xs text-gray-500">Backlinks</div>
        </div>
        <div class="p-3 bg-green-50 rounded-xl text-center">
          <div class="text-xl font-bold text-green-700">${d.referring_domains?.toLocaleString() || '-'}</div>
          <div class="text-xs text-gray-500">Ref. Domains</div>
        </div>
        <div class="p-3 bg-purple-50 rounded-xl text-center">
          <div class="text-xl font-bold text-purple-700">${d.domain_rank || '-'}</div>
          <div class="text-xs text-gray-500">Domain Rank</div>
        </div>
        <div class="p-3 bg-yellow-50 rounded-xl text-center">
          <div class="text-xl font-bold text-yellow-700">${d.spam_score || '0'}</div>
          <div class="text-xs text-gray-500">Spam Score</div>
        </div>
      </div>
    `;
    document.getElementById('backlinkResults').classList.remove('hidden');
    toast('Backlink check complete!');
  } catch (e) { toast('Backlink check failed', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-search mr-2"></i>Check Backlinks'; btn.disabled = false; }
}

// Filter functions
function filterClients(search) {
  const q = (search || document.getElementById('clientSearch')?.value || '').toLowerCase();
  const status = document.getElementById('clientStatusFilter')?.value || '';
  const filtered = state.clients.filter(cl => {
    const matchSearch = !q || cl.company_name.toLowerCase().includes(q) || cl.website.toLowerCase().includes(q) || cl.contact_email.toLowerCase().includes(q);
    const matchStatus = !status || cl.status === status;
    return matchSearch && matchStatus;
  });
  const listEl = document.getElementById('clientsList');
  if (listEl) listEl.innerHTML = renderClientCards(filtered);
}

function filterKeywords() {
  const campaign = document.getElementById('kwCampaignFilter')?.value;
  const group = document.getElementById('kwGroupFilter')?.value;
  const priority = document.getElementById('kwPriorityFilter')?.value;
  const filtered = (state.keywords || []).filter(k => {
    return (!campaign || k.campaign_id == campaign) && (!group || k.keyword_group === group) && (!priority || k.priority === priority);
  });
  const tableEl = document.getElementById('kwTable');
  if (tableEl) tableEl.innerHTML = renderKeywordRows(filtered);
}

function filterContent() {
  const status = document.getElementById('contentStatusFilter')?.value;
  const type = document.getElementById('contentTypeFilter')?.value;
  const filtered = (state.contentItems || []).filter(ci => {
    return (!status || ci.status === status) && (!type || ci.content_type === type);
  });
  const tableEl = document.getElementById('contentTable');
  if (tableEl) tableEl.innerHTML = renderContentRows(filtered);
}

// Modal helpers
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function openEditClientModal() {
  toast('Edit client form coming soon', 'warning');
}

function updateNkClient(val) {
  const opt = document.querySelector(`#nkCampaign option[value="${val}"]`);
  if (opt) document.getElementById('nkClientId').value = opt.dataset.client;
}

function updateNlClient(val) {
  const opt = document.querySelector(`#nlCampaign option[value="${val}"]`);
  if (opt) document.getElementById('nlClientId').value = opt.dataset.client;
}

function updateNcoClient(val) {
  const opt = document.querySelector(`#ncoCampaign option[value="${val}"]`);
  if (opt) document.getElementById('ncoClientId').value = opt.dataset.client;
}

function prefillProposalClient(clientId) {
  const client = state.clients?.find(c => c.id == clientId);
  if (client && client.website) {
    document.getElementById('pKeywords').value = '';
  }
}

function loading() {
  return `
    <div class="flex items-center justify-center py-20">
      <div class="text-center text-gray-400">
        <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
        <p class="text-sm">Loading data...</p>
      </div>
    </div>
  `;
}

function attachEvents() {
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el) el.classList.add('hidden');
    });
  });
}

// ==============================
// INIT
// ==============================
async function init() {
  await Promise.all([
    checkDataForSEOStatus(),
    loadClients(),
  ]);
  loadDashboard();
  navigate('dashboard');
}

init();
