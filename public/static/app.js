// =============================================================
// Digital Search Group - Campaign Management System
// Comprehensive Frontend v2.0
// =============================================================

const API = axios.create({ baseURL: '/api' });

// ---- Auth token injection ----
API.interceptors.request.use(cfg => {
  const token = localStorage.getItem('dsg_token');
  if (token) cfg.headers['Authorization'] = 'Bearer ' + token;
  return cfg;
});
API.interceptors.response.use(r => r, err => {
  if (err?.response?.status === 401 && !err.config.url.includes('/auth/')) {
    localStorage.removeItem('dsg_token'); localStorage.removeItem('dsg_user');
    window.location.href = '/login';
  }
  return Promise.reject(err);
});

// ---- State ----
let state = {
  page: 'dashboard',
  clients: [],
  campaigns: [],
  selectedClient: null,
  selectedCampaign: null,
  dataforseoStatus: null,
  editingClient: null,
  currentUser: null,      // logged-in team member
  planTiers: null,        // plan tier list cache
  campaignPlanData: null, // { plan, tasks, phases } for current campaign
  teamUsers: null,        // PM only: list of all team users
};

// ---- Role helpers ----
function isPM() { return state.currentUser?.role === 'project_manager'; }
function isExec() { return state.currentUser?.role === 'project_executor'; }
function can(permission) {
  if (!state.currentUser) return false;
  if (state.currentUser.role === 'project_manager') return true;
  const perms = state.currentUser.permissions || [];
  return perms.includes(permission);
}

// ---- Toast ----
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const msgEl = document.getElementById('toastMsg');
  if (!el) return;
  if (icon) {
    if (type === 'error') { icon.className = 'fas fa-circle-xmark'; icon.style.color = '#f87171'; }
    else if (type === 'warning') { icon.className = 'fas fa-triangle-exclamation'; icon.style.color = '#fbbf24'; }
    else { icon.className = 'fas fa-circle-check'; icon.style.color = '#34d474'; }
  }
  if (msgEl) msgEl.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ---- Helpers ----
function statusBadge(status) {
  const map = {
    active:        ['badge-green',  'fa-circle',        'Active'],
    prospect:      ['badge-amber',  'fa-clock',         'Prospect'],
    paused:        ['badge-slate',  'fa-pause',         'Paused'],
    churned:       ['badge-red',    'fa-xmark',         'Churned'],
    archived:      ['badge-slate',  'fa-box-archive',   'Archived'],
    draft:         ['badge-slate',  'fa-pencil',        'Draft'],
    sent:          ['badge-blue',   'fa-paper-plane',   'Sent'],
    approved:      ['badge-green',  'fa-check',         'Approved'],
    rejected:      ['badge-red',    'fa-xmark',         'Declined'],
    expired:       ['badge-purple', 'fa-hourglass-end', 'Expired'],
    planned:       ['badge-slate',  'fa-calendar',      'Planned'],
    briefed:       ['badge-purple', 'fa-file-lines',    'Briefed'],
    in_progress:   ['badge-amber',  'fa-spinner',       'In Progress'],
    review:        ['badge-blue',   'fa-eye',           'In Review'],
    published:     ['badge-green',  'fa-globe',         'Published'],
    cancelled:     ['badge-red',    'fa-ban',           'Cancelled'],
    distributed:   ['badge-blue',   'fa-satellite-dish','Distributed'],
    scoping:       ['badge-slate',  'fa-magnifying-glass','Scoping'],
    quoted:        ['badge-amber',  'fa-file-invoice',  'Quoted'],
    client_review: ['badge-blue',   'fa-user-clock',    'Client Review'],
    revisions:     ['badge-purple', 'fa-rotate',        'Revisions'],
    completed:     ['badge-green',  'fa-circle-check',  'Completed'],
    on_hold:       ['badge-slate',  'fa-hand',          'On Hold'],
    scheduled:     ['badge-blue',   'fa-calendar-check','Scheduled'],
    live:          ['badge-green',  'fa-signal',        'Live'],
    high:          ['badge-red',    'fa-arrow-up',      'High'],
    medium:        ['badge-amber',  'fa-minus',         'Medium'],
    low:           ['badge-slate',  'fa-arrow-down',    'Low'],
    not_started:   ['badge-slate',  'fa-circle',        'Not Started'],
    in_review:     ['badge-blue',   'fa-eye',           'In Review'],
  };
  const [cls, ic, label] = map[status] || ['badge-slate', 'fa-circle', status || 'Unknown'];
  return `<span class="badge ${cls}"><i class="fas ${ic}" style="font-size:9px"></i>${label}</span>`;
}

function rankChange(current, previous) {
  if (!current || !previous) return `<span style="color:#b0aac8">–</span>`;
  const diff = previous - current;
  if (diff > 0) return `<span class="rank-up">↑${diff}</span>`;
  if (diff < 0) return `<span class="rank-down">↓${Math.abs(diff)}</span>`;
  return `<span style="color:#b0aac8">→</span>`;
}

function rankBadge(pos) {
  if (!pos) return `<span style="color:#b0aac8;font-size:13px">–</span>`;
  const bg = pos <= 3 ? '#16a34a' : pos <= 10 ? '#7C5CFC' : pos <= 30 ? '#d97706' : '#94a3b8';
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;font-weight:800;font-size:12px;font-family:'Maven Pro',sans-serif">${pos}</span>`;
}

function ago(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmt(n) { return Number(n || 0).toLocaleString(); }

// ── Currency helpers ──────────────────────────────────────────
// Currency rules: AUS = AUD, UK = GBP, US = USD, default = USD
const CURRENCY_MAP = {
  'Australia': { code: 'AUD', symbol: 'A$', locale: 'en-AU', rate: 1.42 },
  'United Kingdom': { code: 'GBP', symbol: '£', locale: 'en-GB', rate: 0.70 },
  'United States': { code: 'USD', symbol: '$', locale: 'en-US', rate: 1.00 },
};
const DEFAULT_CURRENCY = { code: 'USD', symbol: '$', locale: 'en-US', rate: 1.00 };

function getCurrencyForCountry(country) {
  if (!country) return DEFAULT_CURRENCY;
  // Exact match first
  if (CURRENCY_MAP[country]) return CURRENCY_MAP[country];
  // Partial match
  const key = Object.keys(CURRENCY_MAP).find(k => country.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(country.toLowerCase()));
  return key ? CURRENCY_MAP[key] : DEFAULT_CURRENCY;
}

// Format a USD amount into the client's local currency
function fmtCurrencyFor(n, country) {
  const cur = getCurrencyForCountry(country);
  const localAmount = Math.round(Number(n || 0) * cur.rate);
  return cur.symbol + localAmount.toLocaleString(cur.locale, {minimumFractionDigits: 0, maximumFractionDigits: 0});
}

// Default fmtCurrency uses USD (fallback)
function fmtCurrency(n) { return '$' + Number(n || 0).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0}); }

// ── Country / State / Timezone lists ─────────────────────────
const COUNTRY_LIST = [
  'Australia','United States','United Kingdom','Canada','New Zealand',
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda',
  'Argentina','Armenia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh',
  'Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia',
  'Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso',
  'Burundi','Cabo Verde','Cambodia','Cameroon','Central African Republic','Chad',
  'Chile','China','Colombia','Comoros','Congo','Costa Rica','Croatia','Cuba',
  'Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic',
  'Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia',
  'Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia',
  'Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau',
  'Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran',
  'Iraq','Ireland','Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan',
  'Kenya','Kiribati','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho',
  'Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi',
  'Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius',
  'Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco',
  'Mozambique','Myanmar','Namibia','Nauru','Nepal','Netherlands','Nicaragua',
  'Niger','Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan',
  'Palau','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland',
  'Portugal','Qatar','Romania','Russia','Rwanda','Saint Kitts and Nevis',
  'Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino',
  'Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles',
  'Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia',
  'South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan',
  'Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania',
  'Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia',
  'Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine','United Arab Emirates',
  'Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam',
  'Yemen','Zambia','Zimbabwe'
];

const STATES_BY_COUNTRY = {
  'Australia': ['ACT','NSW','NT','QLD','SA','TAS','VIC','WA'],
  'United States': ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'],
  'United Kingdom': ['England','Scotland','Wales','Northern Ireland'],
  'Canada': ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'],
  'New Zealand': ['Auckland','Bay of Plenty','Canterbury','Gisborne','Hawke\'s Bay','Manawatu-Whanganui','Marlborough','Nelson','Northland','Otago','Southland','Taranaki','Tasman','Waikato','Wellington','West Coast'],
};

const TIMEZONE_LIST = [
  // Americas
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'America/Anchorage','Pacific/Honolulu','America/Toronto','America/Vancouver',
  'America/Mexico_City','America/Sao_Paulo','America/Argentina/Buenos_Aires',
  'America/Bogota','America/Lima','America/Santiago','America/Caracas',
  // Europe
  'Europe/London','Europe/Dublin','Europe/Paris','Europe/Berlin','Europe/Rome',
  'Europe/Madrid','Europe/Amsterdam','Europe/Brussels','Europe/Zurich',
  'Europe/Stockholm','Europe/Oslo','Europe/Copenhagen','Europe/Helsinki',
  'Europe/Warsaw','Europe/Prague','Europe/Budapest','Europe/Bucharest',
  'Europe/Athens','Europe/Istanbul','Europe/Moscow','Europe/Kiev',
  // Asia-Pacific
  'Asia/Dubai','Asia/Riyadh','Asia/Kolkata','Asia/Dhaka','Asia/Bangkok',
  'Asia/Jakarta','Asia/Singapore','Asia/Shanghai','Asia/Tokyo','Asia/Seoul',
  'Asia/Hong_Kong','Asia/Manila','Asia/Taipei','Asia/Karachi',
  // Oceania
  'Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Perth',
  'Australia/Adelaide','Australia/Hobart','Pacific/Auckland','Pacific/Auckland',
  'Pacific/Auckland','Pacific/Fiji',
  // Africa
  'Africa/Cairo','Africa/Johannesburg','Africa/Lagos','Africa/Nairobi',
];

function renderStateField(country, currentState) {
  const states = STATES_BY_COUNTRY[country];
  if (states) {
    return `<select id="cl_state" class="input-field">
      <option value="">Select...</option>
      ${states.map(s => `<option value="${s}" ${currentState === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select>`;
  }
  return `<input type="text" id="cl_state_input" class="input-field" value="${currentState || ''}" placeholder="State / Province / Region">`;
}

function onCountryChange(country) {
  const container = document.getElementById('cl_state_container');
  if (container) container.innerHTML = renderStateField(country, '');
  // Auto-set timezone based on country
  const tzEl = document.getElementById('cl_timezone');
  if (tzEl) {
    const defaultTz = {
      'Australia': 'Australia/Sydney', 'United States': 'America/New_York',
      'United Kingdom': 'Europe/London', 'Canada': 'America/Toronto',
      'New Zealand': 'Pacific/Auckland'
    }[country];
    if (defaultTz) tzEl.value = defaultTz;
  }
}

function loading() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:240px;gap:14px">
      <div style="width:44px;height:44px;border-radius:50%;border:3px solid #ede9f8;border-top-color:#7C5CFC;animation:spin 0.7s linear infinite"></div>
      <div style="font-size:13px;color:#9892b0;font-weight:500">Loading…</div>
    </div>`;
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

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
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-area">
        ${renderTopBar()}
        <main class="page-content">
          <div class="page-fade">
            ${renderPage()}
          </div>
        </main>
      </div>
    </div>
  `;
  attachEvents();
}

function renderSidebar() {
  const u = state.currentUser;
  const allLinks = [
    { id: 'dashboard',      icon: 'fa-gauge-high',            label: 'Dashboard',            section: null,      pmOnly: false },
    { id: 'clients',        icon: 'fa-users',                 label: 'Clients',               section: 'CRM',     pmOnly: false },
    { id: 'campaigns',      icon: 'fa-rocket',                label: 'Campaigns',             section: null,      pmOnly: false },
    { id: 'campaign_plans', icon: 'fa-list-check',            label: 'Task Board',            section: null,      pmOnly: false },
    { id: 'proposals',      icon: 'fa-file-contract',         label: 'Proposals',             section: null,      pmOnly: false },
    { id: 'payments',       icon: 'fa-credit-card',           label: 'Billing & Payments',    section: null,      pmOnly: true  },
    { id: 'keywords',       icon: 'fa-magnifying-glass-chart',label: 'Rank Tracking',         section: 'SEO',     pmOnly: false },
    { id: 'llm',            icon: 'fa-robot',                 label: 'AI Visibility',         section: null,      pmOnly: false },
    { id: 'content',        icon: 'fa-pen-nib',               label: 'Content',               section: null,      pmOnly: false },
    { id: 'social',         icon: 'fa-share-nodes',           label: 'Social Media',          section: 'MEDIA',   pmOnly: false },
    { id: 'press',          icon: 'fa-newspaper',             label: 'Press Releases',        section: null,      pmOnly: false },
    { id: 'wordpress',      icon: 'fa-wordpress',             label: 'WordPress Projects',    section: 'DEV',     pmOnly: false },
    { id: 'reports',        icon: 'fa-chart-line',            label: 'Reports',               section: 'TOOLS',   pmOnly: false },
    { id: 'dataforseo',     icon: 'fa-database',              label: 'DataForSEO',            section: null,      pmOnly: false },
    { id: 'onboarding',     icon: 'fa-clipboard-list',        label: 'Onboarding',            section: null,      pmOnly: false },
    { id: 'team',           icon: 'fa-user-shield',           label: 'Team Management',       section: 'ADMIN',   pmOnly: true  },
  ];
  const links = allLinks.filter(l => !l.pmOnly || isPM());
  const initials = u?.avatar_initials || (u?.full_name?.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()) || '?';
  const avatarColour = u?.avatar_colour || '#7C5CFC';
  const roleLabel = u?.role === 'project_manager' ? 'Project Manager' : 'Project Executor';
  const isLive = state.dataforseoStatus?.connected;

  let navHtml = '';
  let lastSection = null;
  for (const l of links) {
    if (l.section && l.section !== lastSection) {
      navHtml += `<div class="section-label">${l.section}</div>`;
      lastSection = l.section;
    }
    const active = state.page === l.id;
    navHtml += `<button onclick="navigate('${l.id}')" class="sb-link${active ? ' active' : ''}">
      <i class="fas ${l.icon} sb-icon"></i>
      <span>${l.label}</span>
    </button>`;
  }

  return `
    <aside class="sidebar">
      <!-- Logo -->
      <div class="sb-logo">
        <img
          src="https://www.digitalsearchgroup.co.uk/wp-content/uploads/2023/09/Logo-1.png.webp"
          alt="Digital Search Group"
          class="sb-logo-img"
          onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
        >
        <div class="sb-logo-fallback">
          <span style="color:#a07dff">DIGITAL</span> SEARCH
          <div style="font-size:10px;font-weight:500;color:rgba(255,255,255,0.35);letter-spacing:0.1em;margin-top:1px">CAMPAIGN MANAGER</div>
        </div>
        <div style="font-size:9.5px;color:rgba(255,255,255,0.28);margin-top:6px;letter-spacing:0.06em;text-transform:uppercase">Campaign Manager</div>
      </div>

      <!-- Nav -->
      <nav class="sb-nav">${navHtml}</nav>

      <!-- Footer -->
      <div class="sb-footer">
        <div class="sb-status">
          <div class="sb-status-dot" style="background:${isLive ? '#4ade80' : '#fbbf24'};box-shadow:0 0 6px ${isLive ? '#4ade80' : '#fbbf24'}"></div>
          <span style="font-size:11px;color:rgba(255,255,255,0.4)">DataForSEO:&nbsp;</span>
          <span style="font-size:11px;font-weight:600;color:${isLive ? '#4ade80' : '#fbbf24'}">${isLive ? 'Live' : 'Demo'}</span>
        </div>
        <div class="sb-user">
          <div class="sb-avatar" style="background:${avatarColour}">${initials}</div>
          <div style="flex:1;min-width:0">
            <div style="color:#fff;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u?.full_name || 'Team Member'}</div>
            <div style="color:rgba(255,255,255,0.38);font-size:10.5px;margin-top:1px">${roleLabel}</div>
          </div>
          <button onclick="handleLogout()" title="Sign out" style="background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.35);padding:4px;flex-shrink:0;transition:color 0.15s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.35)'">
            <i class="fas fa-right-from-bracket" style="font-size:13px"></i>
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderTopBar() {
  const titles = {
    dashboard: 'Dashboard', clients: 'Client Management', campaigns: 'Campaigns',
    proposals: 'Proposals', payments: 'Billing & Payments',
    keywords: 'Rank Tracking', llm: 'AI & LLM Visibility',
    content: 'Content Management', social: 'Social Media', press: 'Press Releases',
    wordpress: 'WordPress Projects', reports: 'Performance Reports',
    dataforseo: 'DataForSEO Tools',
    onboarding: 'Client Onboarding',
    team: 'Team Management',
    campaign_plans: 'Campaign Plans & Task Board',
    onboarding_detail: state.selectedOnboarding?.company_name ? `Onboarding – ${state.selectedOnboarding.company_name}` : 'Onboarding Detail',
    client_detail: state.selectedClient?.company_name || 'Client Detail',
    campaign_detail: state.selectedCampaign?.name || 'Campaign Detail',
    new_proposal: 'New Proposal', new_client: 'New Client',
    edit_client: `Edit – ${state.editingClient?.company_name || ''}`,
    wordpress_detail: state.selectedWpProject?.project_name || 'WordPress Project',
  };
  const addButtons = {
    clients: `<button onclick="navigate('new_client')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>New Client</button>`,
    proposals: `<button onclick="navigate('new_proposal')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>New Proposal</button>`,
    campaigns: `<button onclick="openModal('new_campaign_modal')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>New Campaign</button>`,
    keywords: `<button onclick="openModal('new_keyword_modal')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>Add Keywords</button>`,
    llm: `<button onclick="openModal('new_llm_modal')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>Add Prompt</button>`,
    content: `<button onclick="openModal('new_content_modal')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>New Content</button>`,
    social: `<button onclick="openModal('new_social_modal')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>New Post</button>`,
    press: `<button onclick="navigate('new_press')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>New Press Release</button>`,
    wordpress: `<button onclick="openModal('new_wp_modal')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>New WP Project</button>`,
    onboarding: isPM() ? `<button onclick="openModal('new_onboarding_modal')" class="btn-primary btn-sm"><i class="fas fa-plus"></i>New Onboarding</button>` : '',
    team: isPM() ? `<button onclick="openModal('new_user_modal')" class="btn-primary btn-sm"><i class="fas fa-user-plus"></i>Add Team Member</button>` : '',
  };
  const u = state.currentUser;
  const roleChip = u ? `<span class="badge ${u.role === 'project_manager' ? 'badge-purple' : 'badge-slate'}">${u.role === 'project_manager' ? 'Project Manager' : 'Project Executor'}</span>` : '';
  const title = titles[state.page] || state.page;
  const today = new Date().toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short', year:'numeric'});
  return `
    <header class="topbar">
      <div style="flex:1;min-width:0">
        <div class="topbar-title">${title}</div>
        <div class="topbar-sub">Digital Search Group &nbsp;·&nbsp; ${today}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        ${roleChip}
        ${addButtons[state.page] || ''}
      </div>
    </header>
  `;
}

function renderPage() {
  const pages = {
    dashboard: renderDashboard,
    clients: renderClients,
    campaigns: renderCampaigns,
    campaign_plans: renderCampaignPlans,
    proposals: renderProposals,
    payments: renderPayments,
    keywords: renderKeywords,
    llm: renderLLM,
    content: renderContent,
    social: renderSocial,
    press: renderPress,
    wordpress: renderWordPress,
    reports: renderReports,
    dataforseo: renderDataForSEO,
    client_detail: renderClientDetail,
    campaign_detail: renderCampaignDetail,
    new_proposal: renderNewProposal,
    new_client: renderNewClient,
    edit_client: renderEditClient,
    wordpress_detail: renderWpProjectDetail,
    new_press: renderNewPressRelease,
    onboarding: renderOnboarding,
    onboarding_detail: renderOnboardingDetail,
    team: renderTeam,
  };
  const fn = pages[state.page];
  const content = fn ? fn() : `<div class="text-gray-400 text-center py-20">Page not found</div>`;
  // Append change-password modal + new-user modal once per render
  return content + renderChangePwModal() + (isPM() ? renderNewUserModal() : '');
}

// ==============================
// DASHBOARD
// ==============================
function renderDashboard() {
  const d = state.dashboardData;
  if (!d) { loadDashboard(); return loading(); }
  const { clients = {}, campaigns = {}, keywords = {}, content = {}, proposals = {} } = d;
  const totalMrr = d.total_mrr || clients.total_mrr_clients || clients.total_mrr || 0;
  const activeClients = d.active_clients || clients.active || 0;

  const kpiTiles = [
    {
      icon: 'fa-magnifying-glass-chart', label: 'Keywords Tracking',
      val: keywords.total || 0, sub: `${keywords.top10 || 0} in Top 10`,
      iconBg: 'rgba(124,92,252,0.12)', iconColor: '#7C5CFC',
      accentColor: '#7C5CFC', page: 'keywords'
    },
    {
      icon: 'fa-robot', label: 'AI Prompts Tracked',
      val: d.llm_stats?.total_prompts || 0, sub: 'LLM visibility active',
      iconBg: 'rgba(62,207,207,0.12)', iconColor: '#0d9488',
      accentColor: '#0d9488', page: 'llm'
    },
    {
      icon: 'fa-pen-nib', label: 'Content in Pipeline',
      val: content.in_pipeline || 0, sub: `${content.published || 0} published`,
      iconBg: 'rgba(52,211,153,0.12)', iconColor: '#059669',
      accentColor: '#059669', page: 'content'
    },
    {
      icon: 'fa-file-contract', label: 'Pending Proposals',
      val: proposals.pending || 0, sub: `${proposals.approved || 0} approved total`,
      iconBg: 'rgba(251,191,36,0.12)', iconColor: '#d97706',
      accentColor: '#d97706', page: 'proposals'
    },
  ];

  return `
    <div style="display:flex;flex-direction:column;gap:20px">

      <!-- ── MRR Hero Card ── -->
      <div style="border-radius:16px;padding:28px 32px;background:linear-gradient(130deg,#1a1829 0%,#14112a 50%,#0e1628 100%);border:1px solid rgba(124,92,252,0.2);box-shadow:0 8px 32px rgba(0,0,0,0.25),0 0 0 1px rgba(255,255,255,0.04);position:relative;overflow:hidden">
        <div style="position:absolute;top:-40px;right:-40px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(124,92,252,0.18),transparent 70%);pointer-events:none"></div>
        <div style="position:absolute;bottom:-30px;left:30%;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,rgba(62,207,207,0.1),transparent 70%);pointer-events:none"></div>
        <div style="position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:20px">
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:rgba(255,255,255,0.4);margin-bottom:8px">Monthly Recurring Revenue</div>
            <div style="font-family:'Maven Pro',sans-serif;font-size:clamp(36px,4vw,52px);font-weight:900;color:#fff;line-height:1;letter-spacing:-0.02em">${fmtCurrency(totalMrr)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:8px">All active client contracts</div>
          </div>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[
              { val: activeClients,           label: 'Active Clients',   color: '#4ade80' },
              { val: clients.prospects || 0,  label: 'Prospects',        color: '#a07dff' },
              { val: campaigns.active || 0,   label: 'Campaigns Active', color: '#38bdf8' },
            ].map(s => `
              <div style="text-align:center;padding:16px 20px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.07);min-width:90px">
                <div style="font-family:'Maven Pro',sans-serif;font-size:28px;font-weight:900;color:${s.color};line-height:1">${s.val}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px;text-transform:uppercase;letter-spacing:0.06em">${s.label}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- ── KPI Tiles ── -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px">
        ${kpiTiles.map(s => `
          <div class="stat-card" onclick="navigate('${s.page}')" style="cursor:pointer">
            <div style="position:absolute;top:0;right:0;width:70px;height:70px;border-radius:0 14px 0 70%;background:${s.iconBg};opacity:0.5"></div>
            <div class="stat-card-icon" style="background:${s.iconBg}">
              <i class="fas ${s.icon}" style="color:${s.iconColor};font-size:17px"></i>
            </div>
            <div style="font-family:'Maven Pro',sans-serif;font-size:32px;font-weight:900;color:#1e1b30;line-height:1">${s.val}</div>
            <div style="font-size:12.5px;font-weight:600;color:#4a4468;margin-top:4px">${s.label}</div>
            <div style="font-size:11px;color:#9892b0;margin-top:3px">${s.sub}</div>
            <div style="height:3px;background:${s.iconBg};border-radius:99px;margin-top:14px;overflow:hidden">
              <div style="height:100%;width:${Math.min((s.val / Math.max(s.val,10)) * 100, 100)}%;background:${s.accentColor};border-radius:99px"></div>
            </div>
          </div>`).join('')}
      </div>

      <!-- ── Lower panels ── -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Awaiting Approval -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h3 style="font-size:13.5px;font-weight:700;color:#1e1b30;display:flex;align-items:center;gap:8px">
              <span style="width:28px;height:28px;border-radius:8px;background:rgba(124,92,252,0.1);display:inline-flex;align-items:center;justify-content:center">
                <i class="fas fa-file-contract" style="color:#7C5CFC;font-size:12px"></i>
              </span>
              Awaiting Approval
            </h3>
            ${(d.pending_proposals||[]).length ? `<span class="badge badge-purple">${(d.pending_proposals||[]).length}</span>` : ''}
          </div>
          ${!(d.pending_proposals || []).length
            ? `<div class="empty-state" style="padding:24px 0"><i class="fas fa-file-circle-check" style="font-size:28px;opacity:0.2;margin-bottom:8px;display:block"></i><p style="font-size:12px">No pending proposals</p></div>`
            : `<div style="display:flex;flex-direction:column;gap:8px">${(d.pending_proposals||[]).map(p => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#faf9ff;border-radius:10px;border:1px solid #ede9f8">
                <div>
                  <div style="font-weight:700;font-size:13px;color:#1e1b30">${p.company_name}</div>
                  <div style="font-size:11px;color:#9892b0;margin-top:2px">${p.title} · ${fmtCurrency(p.monthly_investment)}/mo</div>
                </div>
                <div style="text-align:right">
                  ${statusBadge('sent')}
                  <div style="font-size:10.5px;color:#b0aac8;margin-top:4px">${ago(p.sent_at)}</div>
                </div>
              </div>`).join('')}</div>`}
        </div>

        <!-- Upcoming Content Deadlines -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h3 style="font-size:13.5px;font-weight:700;color:#1e1b30;display:flex;align-items:center;gap:8px">
              <span style="width:28px;height:28px;border-radius:8px;background:rgba(52,211,153,0.1);display:inline-flex;align-items:center;justify-content:center">
                <i class="fas fa-calendar-days" style="color:#059669;font-size:12px"></i>
              </span>
              Upcoming Deadlines
            </h3>
          </div>
          ${!(d.upcoming_content || []).length
            ? `<div class="empty-state" style="padding:24px 0"><i class="fas fa-calendar-check" style="font-size:28px;opacity:0.2;margin-bottom:8px;display:block"></i><p style="font-size:12px">No upcoming content</p></div>`
            : `<div style="display:flex;flex-direction:column;gap:8px">${(d.upcoming_content||[]).map(ci => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f7fdf9;border-radius:10px;border:1px solid #dcfce7">
                <div>
                  <div style="font-weight:700;font-size:13px;color:#1e1b30">${ci.title}</div>
                  <div style="font-size:11px;color:#9892b0;margin-top:2px">${ci.company_name} · ${(ci.content_type||'').replace(/_/g,' ')}</div>
                </div>
                <div style="text-align:right">
                  ${statusBadge(ci.status)}
                  <div style="font-size:10.5px;color:#b0aac8;margin-top:4px">Due ${ci.due_date || 'TBD'}</div>
                </div>
              </div>`).join('')}</div>`}
        </div>

        <!-- Recent Activity (full width) -->
        <div class="card" style="grid-column:1/-1">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h3 style="font-size:13.5px;font-weight:700;color:#1e1b30;display:flex;align-items:center;gap:8px">
              <span style="width:28px;height:28px;border-radius:8px;background:rgba(124,92,252,0.08);display:inline-flex;align-items:center;justify-content:center">
                <i class="fas fa-bolt" style="color:#7C5CFC;font-size:11px"></i>
              </span>
              Recent Activity
            </h3>
          </div>
          ${!(d.recent_activity||[]).length
            ? `<div class="empty-state" style="padding:16px 0"><p style="font-size:12px">No recent activity</p></div>`
            : `<div style="display:flex;flex-direction:column;gap:0">
              ${(d.recent_activity||[]).map((a,i) => `
              <div style="display:flex;align-items:center;gap:12px;padding:11px 0;${i < (d.recent_activity.length-1) ? 'border-bottom:1px solid #f0edf8' : ''}">
                <div style="width:32px;height:32px;border-radius:10px;background:rgba(124,92,252,0.08);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <i class="fas ${activityIcon(a.activity_type)}" style="color:#7C5CFC;font-size:12px"></i>
                </div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:#1e1b30;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.description}</div>
                  <div style="font-size:11px;color:#9892b0;margin-top:1px">${a.company_name ? a.company_name + ' · ' : ''}${ago(a.created_at)}</div>
                </div>
              </div>`).join('')}</div>`}
        </div>
      </div>
    </div>
  `;
}

function activityIcon(type) {
  const map = {
    client_created: 'fa-user-plus', client_updated: 'fa-user-edit',
    proposal_created: 'fa-file-plus', proposal_sent: 'fa-paper-plane',
    proposal_approved: 'fa-check-circle', payment_received: 'fa-credit-card',
    wp_project_created: 'fa-wordpress', rank_tracked: 'fa-chart-line',
  };
  return map[type] || 'fa-circle-dot';
}

// ==============================
// CLIENTS
// ==============================
function renderClients() {
  if (!state.clients.length && !state._clientsLoaded) { loadClients(); return loading(); }
  const showArchived = state.showArchivedClients || false;
  return `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <input type="text" id="clientSearch" placeholder="🔍  Search clients…" class="input-field" style="max-width:260px" oninput="filterClients(this.value)">
        <select id="clientStatusFilter" class="input-field" style="width:160px" onchange="filterClients()">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="prospect">Prospect</option>
          <option value="paused">Paused</option>
          <option value="churned">Churned</option>
        </select>
        <button onclick="toggleArchivedClients()" class="btn-secondary btn-sm">
          <i class="fas fa-box-archive"></i>
          ${showArchived ? 'Hide Archived' : 'Show Archived'}
          ${state.archivedClientCount > 0 ? `<span class="badge badge-slate" style="margin-left:2px">${state.archivedClientCount}</span>` : ''}
        </button>
      </div>
      ${showArchived ? `
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f8f7ff;border:1px solid #e8e4f5;border-radius:11px;font-size:13px;color:#6b6585">
          <i class="fas fa-box-archive" style="color:#9892b0"></i>
          Showing archived clients. Data is preserved and can be restored at any time.
        </div>` : ''}
      <div id="clientsList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px">
        ${renderClientCards(state.clients)}
      </div>
      ${!state.clients.length ? `<div class="empty-state"><i class="fas fa-users"></i><p>No clients found</p></div>` : ''}
    </div>
  `;
}

function renderClientCards(clients) {
  const obColors = {
    not_sent: '#9892b0',
    sent: '#2563eb',
    in_progress: '#7C5CFC',
    submitted: '#7C5CFC',
    approved: '#059669',
  };
  const obIcons = {
    not_sent: 'fa-clipboard',
    sent: 'fa-envelope',
    in_progress: 'fa-pen-to-square',
    submitted: 'fa-hourglass-half',
    approved: 'fa-circle-check',
  };
  const obLabels = {
    not_sent: 'Not Onboarded',
    sent: 'Onboarding Sent',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    approved: 'Onboarded ✓',
  };
  // Generate consistent avatar color from name
  function clientColor(name) {
    const colors = ['#7C5CFC','#059669','#0284c7','#d97706','#dc2626','#0d9488','#7c3aed','#2563eb'];
    let h = 0; for (const c of name||'') h = (h*31 + c.charCodeAt(0)) & 0xffffffff;
    return colors[Math.abs(h) % colors.length];
  }
  return clients.map(cl => {
    const obStatus = cl.onboarding_status || 'not_sent';
    const isArchived = cl.is_archived == 1;
    const avatarColor = isArchived ? '#94a3b8' : clientColor(cl.company_name);
    const initials = cl.company_name?.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
    return `
    <div class="card" style="${isArchived ? 'opacity:0.65;background:#f8f7ff' : ''}cursor:default">
      ${isArchived ? `
        <div style="display:flex;align-items:center;gap:8px;margin:-20px -20px 14px;padding:10px 14px;background:#f1f0fb;border-bottom:1px solid #e8e4f5;border-radius:14px 14px 0 0">
          <i class="fas fa-box-archive" style="color:#9892b0;font-size:11px"></i>
          <span style="font-size:11px;color:#9892b0;font-weight:600">Archived ${cl.archived_at ? '· ' + cl.archived_at.slice(0,10) : ''}</span>
          <button onclick="restoreClient(${cl.id})" style="margin-left:auto;font-size:11px;color:#7C5CFC;font-weight:700;background:none;border:none;cursor:pointer;padding:0"><i class="fas fa-rotate-left" style="margin-right:4px"></i>Restore</button>
        </div>` : ''}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
        <div
          style="width:42px;height:42px;border-radius:12px;background:${avatarColor};display:flex;align-items:center;justify-content:center;font-family:'Maven Pro',sans-serif;font-weight:900;font-size:15px;color:#fff;cursor:pointer;flex-shrink:0;box-shadow:0 3px 10px ${avatarColor}55"
          onclick="navigate('client_detail', {selectedClient: ${JSON.stringify(cl).replace(/"/g, '&quot;')}})"
        >${initials}</div>
        <div style="display:flex;align-items:center;gap:6px">
          ${isArchived ? statusBadge('archived') : statusBadge(cl.status)}
          ${!isArchived ? `<button onclick='openEditClientModal(${JSON.stringify(cl).replace(/'/g,"&#39;")})' style="width:28px;height:28px;border-radius:8px;background:rgba(124,92,252,0.08);border:none;cursor:pointer;color:#7C5CFC;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s" onmouseover="this.style.background='rgba(124,92,252,0.16)'" onmouseout="this.style.background='rgba(124,92,252,0.08)'"><i class="fas fa-pen" style="font-size:11px"></i></button>` : ''}
        </div>
      </div>
      <div
        style="font-family:'Maven Pro',sans-serif;font-size:15px;font-weight:700;color:${isArchived ? '#6b6585' : '#1e1b30'};cursor:pointer;margin-bottom:3px"
        onclick="navigate('client_detail', {selectedClient: ${JSON.stringify(cl).replace(/"/g, '&quot;')}})"
        onmouseover="this.style.color='#7C5CFC'" onmouseout="this.style.color='${isArchived ? '#6b6585' : '#1e1b30'}'">
        ${cl.company_name}
      </div>
      <div style="font-size:12px;color:#9892b0;margin-bottom:2px">${cl.website || ''}</div>
      <div style="font-size:11.5px;color:#b0aac8">${cl.industry || ''}${cl.location ? ' · ' + cl.location : ''}</div>

      <div style="display:flex;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid #f0edf8;font-size:11.5px;color:#9892b0;align-items:center;flex-wrap:wrap">
        <span><i class="fas fa-rocket" style="color:#7C5CFC;margin-right:5px;font-size:10px"></i>${cl.campaign_count || 0} campaigns</span>
        <span><i class="fas fa-magnifying-glass" style="color:#0284c7;margin-right:5px;font-size:10px"></i>${cl.keyword_count || 0} keywords</span>
        ${cl.monthly_budget && !isArchived ? `<span style="margin-left:auto;font-family:'Maven Pro',sans-serif;font-weight:700;font-size:13px;color:#1e1b30">${fmtCurrencyFor(cl.monthly_budget, cl.country)}<span style="font-weight:500;color:#9892b0;font-size:11px">/mo</span></span>` : ''}
      </div>
      ${!isArchived ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;font-weight:600;color:${obColors[obStatus] || '#9892b0'}">
          <i class="fas ${obIcons[obStatus] || 'fa-clipboard'}" style="font-size:10px"></i>
          ${obLabels[obStatus] || 'Not Onboarded'}
        </div>` : `<div style="margin-top:8px;font-size:11px;color:#b0aac8;font-style:italic">${cl.archive_note ? '"' + cl.archive_note + '"' : 'No reason noted'}</div>`}
    </div>
  `;}).join('');
}

// ==============================
// CLIENT DETAIL
// ==============================
function renderClientDetail() {
  const cl = state.selectedClient;
  if (!cl) return '<p>No client selected</p>';
  if (!cl.campaigns) { loadClientDetail(cl.id); return loading(); }

  // Onboarding status banner
  const obStatus = cl.onboarding_status || 'not_sent';
  const obBannerMap = {
    not_sent: { cls: 'bg-gray-50 border-gray-200 text-gray-600', icon: 'fa-clipboard', msg: 'Onboarding form has not been sent to this client yet.', btn: true, btnLabel: 'Create & Send Onboarding', btnAction: `createOnboardingForClient(${cl.id})` },
    sent: { cls: 'bg-blue-50 border-blue-200 text-blue-700', icon: 'fa-envelope-open', msg: 'Onboarding form sent – awaiting client to start.', btn: true, btnLabel: 'Resend Reminder', btnAction: `resendOnboardingForClient(${cl.id})` },
    in_progress: { cls: 'bg-purple-50 border-purple-200 text-purple-700', icon: 'fa-pen-to-square', msg: 'Client is currently completing the onboarding form.', btn: true, btnLabel: 'Send Reminder', btnAction: `resendOnboardingForClient(${cl.id})` },
    submitted: { cls: 'bg-violet-50 border-violet-200 text-violet-700', icon: 'fa-hourglass-half', msg: 'Onboarding submitted by client – awaiting your review and approval.', btn: true, btnLabel: 'Review & Approve', btnAction: `reviewOnboardingForClient(${cl.id})` },
    approved: { cls: 'bg-green-50 border-green-200 text-green-700', icon: 'fa-circle-check', msg: 'Onboarding complete. All campaign information has been collected.', btn: false },
  };
  const ob = obBannerMap[obStatus] || obBannerMap.not_sent;
  const isBlocked = ['not_sent','sent','in_progress'].includes(obStatus);

  return `
    <div class="space-y-6">
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <button onclick="navigate('clients')" class="hover:text-violet-600"><i class="fas fa-arrow-left mr-1"></i>Clients</button>
        <i class="fas fa-chevron-right text-xs"></i>
        <span class="text-gray-900 font-medium">${cl.company_name}</span>
        ${cl.is_archived ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600"><i class="fas fa-archive"></i> Archived</span>' : ''}
      </div>

      <!-- Archive Banner (shown when archived) -->
      ${cl.is_archived ? `
      <div class="border-2 border-slate-300 rounded-xl px-5 py-4 bg-slate-50 flex items-start gap-4">
        <div class="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-archive text-slate-500"></i>
        </div>
        <div class="flex-1">
          <div class="font-semibold text-slate-800 text-sm mb-1">This client is archived</div>
          <div class="text-sm text-slate-600">All project data, reports, keyword rankings, and campaign plans are preserved and read-only.
          Archived ${cl.archived_at ? 'on ' + cl.archived_at.slice(0,10) : ''} ${cl.archived_by ? 'by ' + cl.archived_by : ''}.
          ${cl.archive_note ? '<br><span class="italic">"' + cl.archive_note + '"</span>' : ''}
          </div>
        </div>
        <div class="flex flex-col gap-2 flex-shrink-0">
          <button onclick="restoreClient(${cl.id})" class="btn-primary text-sm whitespace-nowrap">
            <i class="fas fa-undo mr-2"></i>Restore Client
          </button>
          <button onclick="loadArchiveLog(${cl.id})" class="btn-secondary text-xs whitespace-nowrap">
            <i class="fas fa-history mr-1"></i>Archive History
          </button>
        </div>
      </div>` : ''}

      <!-- Onboarding Status Banner (only for non-archived) -->
      ${!cl.is_archived ? `<div class="border rounded-xl px-5 py-4 flex items-center gap-4 ${ob.cls}">
        <i class="fas ${ob.icon} text-lg flex-shrink-0"></i>
        <div class="flex-1">
          <span class="font-semibold text-sm">Onboarding: </span>
          <span class="text-sm">${ob.msg}</span>
          ${isBlocked ? '<span class="ml-2 text-xs font-bold uppercase tracking-wide opacity-70">⚠ Campaign tasks on hold</span>' : ''}
        </div>
        ${ob.btn ? `<button onclick="${ob.btnAction}" class="flex-shrink-0 text-xs font-semibold px-4 py-2 rounded-lg border border-current hover:opacity-80 transition-opacity">${ob.btnLabel}</button>` : ''}
      </div>` : ''}

      <!-- Client Header Card -->
      <div class="card">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div class="flex gap-4 items-center">
            <div class="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-2xl">
              ${cl.company_name.charAt(0)}
            </div>
            <div>
              <h2 class="text-xl font-bold text-gray-900">${cl.company_name}</h2>
              <a href="https://${cl.website}" target="_blank" class="text-violet-600 text-sm hover:underline">${cl.website}</a>
              <div class="flex gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                ${cl.industry ? `<span>${cl.industry}</span>` : ''}
                ${cl.location ? `<span>· ${cl.location}</span>` : ''}
                ${cl.account_manager ? `<span>· AM: ${cl.account_manager}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            ${cl.is_archived ? statusBadge('archived') : statusBadge(cl.status)}
            ${!cl.is_archived ? `
              <button onclick='openEditClientModal(${JSON.stringify(cl).replace(/'/g,"&#39;")})' class="btn-secondary text-sm"><i class="fas fa-edit mr-1"></i>Edit Client</button>
              <button onclick="navigate('new_proposal', {selectedClient: state.selectedClient})" class="btn-primary text-sm">
                <i class="fas fa-file-plus mr-1"></i>New Proposal
              </button>
              <button onclick="openArchiveModal(${cl.id}, '${cl.status}', '${cl.company_name.replace(/'/g,'')}')" class="text-sm px-3 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 transition font-medium">
                <i class="fas fa-archive mr-1"></i>Archive
              </button>
            ` : `
              <button onclick="restoreClient(${cl.id})" class="btn-primary text-sm">
                <i class="fas fa-undo mr-2"></i>Restore Client
              </button>
            `}
          </div>
        </div>

        <!-- Contact & Financial Info Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div>
            <p class="text-xs text-gray-400">Primary Contact</p>
            <p class="font-medium text-sm">${cl.contact_name || '–'}</p>
            <p class="text-xs text-gray-500">${cl.contact_email}</p>
            ${cl.contact_phone ? `<p class="text-xs text-gray-500">${cl.contact_phone}</p>` : ''}
          </div>
          <div>
            <p class="text-xs text-gray-400">Monthly Retainer</p>
            <p class="font-bold text-xl text-violet-600">${fmtCurrencyFor(cl.monthly_budget, cl.country)}</p>
            ${cl.contract_start ? `<p class="text-xs text-gray-400">Since ${cl.contract_start}</p>` : ''}
          </div>
          <div>
            <p class="text-xs text-gray-400">ABN</p>
            <p class="font-medium text-sm">${cl.abn || '–'}</p>
            <p class="text-xs text-gray-400 mt-1">CMS</p>
            <p class="font-medium text-sm">${cl.cms_platform || 'WordPress'}</p>
          </div>
          <div>
            <p class="text-xs text-gray-400">Client Since</p>
            <p class="font-medium text-sm">${new Date(cl.created_at).toLocaleDateString('en-AU', {month:'short',year:'numeric'})}</p>
            ${cl.referral_source ? `<p class="text-xs text-gray-400 mt-1">Via: ${cl.referral_source}</p>` : ''}
          </div>
        </div>

        <!-- Digital Properties -->
        ${(cl.ga4_property_id || cl.gsc_property || cl.google_business_id) ? `
        <div class="mt-4 pt-4 border-t border-gray-100">
          <p class="text-xs font-medium text-gray-500 mb-2">Digital Properties</p>
          <div class="flex gap-4 flex-wrap text-xs text-gray-600">
            ${cl.ga4_property_id ? `<span><i class="fab fa-google mr-1"></i>GA4: ${cl.ga4_property_id}</span>` : ''}
            ${cl.gsc_property ? `<span><i class="fas fa-search mr-1"></i>GSC: ${cl.gsc_property}</span>` : ''}
            ${cl.google_business_id ? `<span><i class="fas fa-map-marker-alt mr-1"></i>GBP: ${cl.google_business_id}</span>` : ''}
          </div>
        </div>` : ''}
      </div>

      <!-- Active Campaigns -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900"><i class="fas fa-rocket text-violet-500 mr-2"></i>Active Campaigns</h3>
          <button onclick="openModal('new_campaign_modal')" class="btn-secondary text-xs"><i class="fas fa-plus mr-1"></i>New Campaign</button>
        </div>
        ${!(cl.campaigns || []).length ? '<p class="text-gray-400 text-sm">No campaigns yet</p>' :
          `<div class="space-y-2">
            ${(cl.campaigns || []).map(ca => `
              <div class="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition"
                onclick="navigate('campaign_detail', {selectedCampaign: ${JSON.stringify(ca).replace(/"/g,'&quot;')}})">
                <div>
                  <p class="font-medium text-gray-900">${ca.name}</p>
                  <p class="text-xs text-gray-500">${ca.campaign_type?.replace(/_/g,' ')} · Started ${ca.start_date}</p>
                </div>
                <div class="flex items-center gap-3">
                  <span class="font-semibold text-gray-700">${fmtCurrency(ca.monthly_investment)}/mo</span>
                  ${statusBadge(ca.status)}
                  <i class="fas fa-chevron-right text-gray-300"></i>
                </div>
              </div>`).join('')}
          </div>`}
      </div>

      <!-- Proposals -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900"><i class="fas fa-file-contract text-green-500 mr-2"></i>Proposals</h3>
          <button onclick="navigate('new_proposal', {selectedClient: state.selectedClient})" class="btn-secondary text-xs"><i class="fas fa-plus mr-1"></i>New Proposal</button>
        </div>
        ${!(cl.proposals || []).length ? '<p class="text-gray-400 text-sm">No proposals yet</p>' :
          `<div class="space-y-2">
            ${(cl.proposals || []).map(p => `
              <div class="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                <div>
                  <p class="font-medium text-sm">${p.title}</p>
                  <p class="text-xs text-gray-400">${fmtCurrency(p.monthly_investment)}/mo · ${p.contract_length}mo · ${p.created_at?.slice(0,10)}</p>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  ${statusBadge(p.status)}
                  ${p.status === 'draft' ? `<button onclick="sendProposal(${p.id})" class="btn-secondary text-xs">Send</button>` : ''}
                  ${p.status === 'sent' ? `<button onclick="copyApprovalLink('${p.approval_token}')" class="btn-secondary text-xs"><i class="fas fa-link mr-1"></i>Copy Link</button>` : ''}
                  ${p.status === 'approved' && !p.paid_at ? `<button onclick="activatePayment(${p.id})" class="btn-success text-xs"><i class="fas fa-bolt mr-1"></i>Activate</button>` : ''}
                </div>
              </div>`).join('')}
          </div>`}
      </div>

      <!-- Payments / Billing -->
      ${(cl.payments || []).length ? `
      <div class="card">
        <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-credit-card text-purple-500 mr-2"></i>Recent Payments</h3>
        <div class="space-y-2">
          ${cl.payments.map(pmt => `
            <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div><p class="text-sm font-medium">${pmt.description || 'Payment'}</p>
              <p class="text-xs text-gray-400">${pmt.invoice_number || ''} · ${pmt.paid_at?.slice(0,10) || pmt.created_at?.slice(0,10)}</p></div>
              <div class="text-right"><p class="font-semibold text-gray-900">${fmtCurrency(pmt.amount)}</p>${statusBadge(pmt.status)}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${renderNewCampaignModal()}
    </div>
  `;
}

// ==============================
// NEW CLIENT
// ==============================
function renderNewClient() {
  return renderClientForm(null, false);
}

function renderEditClient() {
  const cl = state.editingClient;
  if (!cl) return '<p>No client selected for editing</p>';
  return renderClientForm(cl, true);
}

function renderClientForm(cl, isEdit) {
  const v = (field, def = '') => cl ? (cl[field] ?? def) : def;
  return `
    <div class="max-w-4xl space-y-6">
      <button onclick="${isEdit ? "navigate('client_detail', {selectedClient: state.editingClient})" : "navigate('clients')"}" class="text-sm text-gray-500 hover:text-violet-600">
        <i class="fas fa-arrow-left mr-1"></i>Back
      </button>
      <div class="card">
        <h2 class="text-lg font-bold text-gray-900 mb-5">${isEdit ? 'Edit Client: ' + cl.company_name : 'Add New Client'}</h2>

        <!-- Section: Company -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 pb-1 border-b">Company Information</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2 md:col-span-1">
              <label class="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
              <input type="text" id="cl_company_name" class="input-field" value="${v('company_name')}" placeholder="Apex Plumbing Services">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Website *</label>
              <input type="text" id="cl_website" class="input-field" value="${v('website')}" placeholder="apexplumbing.com.au">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Industry</label>
              <input type="text" id="cl_industry" class="input-field" value="${v('industry')}" placeholder="Trades & Home Services">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ABN</label>
              <input type="text" id="cl_abn" class="input-field" value="${v('abn')}" placeholder="12 345 678 901">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select id="cl_status" class="input-field">
                ${['prospect','active','paused','churned'].map(s => `<option value="${s}" ${v('status','prospect') === s ? 'selected' : ''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Section: Address -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 pb-1 border-b">Address</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input type="text" id="cl_address" class="input-field" value="${v('address')}" placeholder="123 Main Street">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">City/Suburb</label>
              <input type="text" id="cl_city" class="input-field" value="${v('city')}" placeholder="Sydney">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <select id="cl_country" class="input-field" onchange="onCountryChange(this.value)">
                ${COUNTRY_LIST.map(c => `<option value="${c}" ${v('country','United States') === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">State / Region</label>
              <div id="cl_state_container">${renderStateField(v('country','United States'), v('state'))}</div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Postcode / ZIP</label>
              <input type="text" id="cl_postcode" class="input-field" value="${v('postcode')}" placeholder="e.g. 2000">
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">Location (Display)</label>
              <input type="text" id="cl_location" class="input-field" value="${v('location')}" placeholder="Sydney, NSW, Australia">
            </div>
          </div>
        </div>

        <!-- Section: Primary Contact -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 pb-1 border-b">Primary Contact</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
              <input type="text" id="cl_contact_name" class="input-field" value="${v('contact_name')}" placeholder="James Mitchell">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contact Email *</label>
              <input type="email" id="cl_contact_email" class="input-field" value="${v('contact_email')}" placeholder="james@company.com">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" id="cl_contact_phone" class="input-field" value="${v('contact_phone')}" placeholder="+61 2 9000 0000">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Secondary Contact Name</label>
              <input type="text" id="cl_secondary_contact_name" class="input-field" value="${v('secondary_contact_name')}">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Secondary Contact Email</label>
              <input type="email" id="cl_secondary_contact_email" class="input-field" value="${v('secondary_contact_email')}">
            </div>
          </div>
        </div>

        <!-- Section: Engagement -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 pb-1 border-b">Engagement Details</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Monthly Budget ($)</label>
              <input type="number" id="cl_monthly_budget" class="input-field" value="${v('monthly_budget',0)}" placeholder="2500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Account Manager</label>
              <input type="text" id="cl_account_manager" class="input-field" value="${v('account_manager')}" placeholder="Your name">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contract Start</label>
              <input type="date" id="cl_contract_start" class="input-field" value="${v('contract_start')}">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contract End</label>
              <input type="date" id="cl_contract_end" class="input-field" value="${v('contract_end')}">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Referral Source</label>
              <input type="text" id="cl_referral_source" class="input-field" value="${v('referral_source')}" placeholder="Google, Referral, Cold Outreach">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <select id="cl_timezone" class="input-field">
                ${TIMEZONE_LIST.map(tz => `<option value="${tz}" ${v('timezone','America/New_York') === tz ? 'selected' : ''}>${tz}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Section: Digital Properties -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 pb-1 border-b">Digital Properties & Social</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">CMS Platform</label>
              <select id="cl_cms_platform" class="input-field">
                ${['wordpress','shopify','wix','squarespace','webflow','custom','other'].map(s => `<option value="${s}" ${v('cms_platform','wordpress') === s ? 'selected' : ''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Hosting Provider</label>
              <input type="text" id="cl_hosting_provider" class="input-field" value="${v('hosting_provider')}" placeholder="Panthur, Kinsta, SiteGround">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">GA4 Property ID</label>
              <input type="text" id="cl_ga4_property_id" class="input-field" value="${v('ga4_property_id')}" placeholder="G-XXXXXXXXXX">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Google Search Console Property</label>
              <input type="text" id="cl_gsc_property" class="input-field" value="${v('gsc_property')}" placeholder="https://apexplumbing.com.au">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Google Business Profile ID</label>
              <input type="text" id="cl_google_business_id" class="input-field" value="${v('google_business_id')}">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
              <input type="text" id="cl_linkedin_url" class="input-field" value="${v('linkedin_url')}" placeholder="linkedin.com/company/...">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Facebook URL</label>
              <input type="text" id="cl_facebook_url" class="input-field" value="${v('facebook_url')}" placeholder="facebook.com/...">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Instagram Handle</label>
              <input type="text" id="cl_instagram_handle" class="input-field" value="${v('instagram_handle')}" placeholder="@apexplumbing">
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea id="cl_notes" class="input-field" rows="3" placeholder="Any notes about this client...">${v('notes')}</textarea>
        </div>

        <div class="flex gap-3 pt-4 border-t">
          ${isEdit ? `<button onclick="deleteClient(${cl.id})" class="btn-danger">Delete Client</button><div class="flex-1"></div>` : ''}
          <button onclick="navigate('${isEdit ? 'client_detail' : 'clients'}')" class="btn-secondary">Cancel</button>
          <button onclick="${isEdit ? `saveEditClient(${cl.id})` : 'saveNewClient()'}" class="btn-primary">
            <i class="fas fa-save mr-2"></i>${isEdit ? 'Save Changes' : 'Add Client'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function openEditClientModal(cl) {
  state.editingClient = typeof cl === 'string' ? JSON.parse(cl) : cl;
  navigate('edit_client', { editingClient: state.editingClient });
}

// ==============================
// CAMPAIGNS
// ==============================
function renderCampaigns() {
  if (!state.campaigns || !state.campaigns.length) { loadCampaigns(); return loading(); }
  return `
    <div class="space-y-4">
      ${state.campaigns.map(ca => `
        <div class="card hover:shadow-md transition cursor-pointer flex items-center justify-between"
          onclick="navigate('campaign_detail', {selectedCampaign: ${JSON.stringify(ca).replace(/"/g,'&quot;')}})">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <i class="fas fa-rocket text-violet-600"></i>
            </div>
            <div>
              <p class="font-semibold text-gray-900">${ca.name}</p>
              <p class="text-sm text-gray-500">${ca.company_name} · ${ca.campaign_type?.replace(/_/g,' ')} · ${ca.keyword_count || 0} keywords</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <p class="font-bold text-gray-700">${fmtCurrency(ca.monthly_investment)}/mo</p>
              <p class="text-xs text-gray-400">since ${ca.start_date}</p>
            </div>
            ${statusBadge(ca.status)}
            <i class="fas fa-chevron-right text-gray-300"></i>
          </div>
        </div>
      `).join('')}
      ${renderNewCampaignModal()}
    </div>
  `;
}

function renderCampaignDetail() {
  const ca = state.selectedCampaign;
  if (!ca) return '<p>No campaign selected</p>';
  if (!ca.keywords && !ca._loaded) { loadCampaignDetail(ca.id); return loading(); }
  const kws = ca.keywords || [];
  const top3 = kws.filter(k => k.current_rank && k.current_rank <= 3).length;
  const top10 = kws.filter(k => k.current_rank && k.current_rank <= 10).length;

  return `
    <div class="space-y-6">
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <button onclick="navigate('campaigns')" class="hover:text-violet-600"><i class="fas fa-arrow-left mr-1"></i>Campaigns</button>
        <i class="fas fa-chevron-right text-xs"></i>
        <span class="text-gray-900 font-medium">${ca.name}</span>
      </div>

      <div class="card">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 class="text-xl font-bold text-gray-900">${ca.name}</h2>
            <p class="text-sm text-gray-500">${ca.company_name || ''} · ${ca.campaign_type?.replace(/_/g,' ')} · Started ${ca.start_date}</p>
          </div>
          <div class="flex gap-2 items-center">
            <span class="font-bold text-xl text-violet-600">${fmtCurrency(ca.monthly_investment)}<span class="text-sm text-gray-400">/mo</span></span>
            ${statusBadge(ca.status)}
          </div>
        </div>
        <div class="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          ${[['Keywords', kws.length, 'fa-key'],['Top 3', top3, 'fa-trophy'],['Top 10', top10, 'fa-star'],['LLM Prompts', (ca.llm_prompts||[]).length, 'fa-robot']].map(([l,v,i]) => `
            <div class="text-center"><div class="text-2xl font-bold text-gray-900">${v}</div><div class="text-xs text-gray-400 mt-1"><i class="fas ${i} mr-1"></i>${l}</div></div>
          `).join('')}
        </div>
      </div>

      <div class="flex gap-3 flex-wrap">
        <button onclick="trackRankings('${ca.id}')" class="btn-primary"><i class="fas fa-sync-alt mr-2"></i>Track Rankings Now</button>
        <button onclick="trackLLM('${ca.id}')" class="btn-secondary"><i class="fas fa-robot mr-2"></i>Check LLM Mentions</button>
        <button onclick="generateReport('${ca.id}')" class="btn-success"><i class="fas fa-chart-line mr-2"></i>Generate Report</button>
      </div>

      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900"><i class="fas fa-magnifying-glass-chart text-violet-500 mr-2"></i>Keyword Rankings</h3>
          <button onclick="openModal('new_keyword_modal')" class="btn-secondary text-xs"><i class="fas fa-plus mr-1"></i>Add Keywords</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th class="px-3 py-2 rounded-l-lg">Keyword</th>
              <th class="px-3 py-2 text-center">Current</th>
              <th class="px-3 py-2 text-center">Previous</th>
              <th class="px-3 py-2 text-center">Change</th>
              <th class="px-3 py-2">Vol.</th>
              <th class="px-3 py-2 rounded-r-lg">Priority</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-50">
              ${kws.length === 0 ? '<tr><td colspan="6" class="px-3 py-8 text-center text-gray-400">No keywords yet</td></tr>' :
                kws.map(kw => `
                  <tr class="hover:bg-gray-50">
                    <td class="px-3 py-3"><div class="font-medium text-gray-900">${kw.keyword}</div>${kw.target_url ? `<div class="text-xs text-gray-400 truncate max-w-xs">${kw.target_url}</div>` : ''}</td>
                    <td class="px-3 py-3 text-center">${rankBadge(kw.current_rank)}</td>
                    <td class="px-3 py-3 text-center text-gray-400 text-sm">${kw.previous_rank || '–'}</td>
                    <td class="px-3 py-3 text-center">${rankChange(kw.current_rank, kw.previous_rank)}</td>
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
        ${(ca.llm_prompts||[]).length === 0 ? '<p class="text-gray-400 text-sm">No LLM prompts configured</p>' :
          `<div class="space-y-3">${(ca.llm_prompts||[]).map(p => `
            <div class="p-3 border border-gray-100 rounded-xl">
              <div class="flex items-start justify-between">
                <div class="flex-1"><p class="text-sm font-medium text-gray-800">"${p.prompt_text}"</p>
                <p class="text-xs text-gray-400 mt-1">Target: ${p.target_brand || 'N/A'} · Model: ${p.llm_model}</p></div>
                <span class="ml-4 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${p.latest_mentioned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                  ${p.latest_mentioned ? '✓ Mentioned' : '✗ Not Mentioned'}
                </span>
              </div>
            </div>`).join('')}</div>`}
      </div>

      <!-- Authority Task Board -->
      <div>
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900 text-lg"><i class="fas fa-tasks text-violet-500 mr-2"></i>Authority Task Board</h3>
          ${!state.campaignPlanData?.plan ? `<button onclick="openModal('new_plan_modal')" class="btn-primary text-sm"><i class="fas fa-magic mr-2"></i>Create Plan</button>` : ''}
        </div>
        ${renderCampaignTaskBoard()}
      </div>
    </div>
  `;
}

function renderNewCampaignModal() {
  return `
    <div id="new_campaign_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900">New Campaign</h3>
          <button onclick="closeModal('new_campaign_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select id="newCampaignClient" class="input-field">
              <option value="">Select client...</option>
              ${(state.clients||[]).map(cl => `<option value="${cl.id}" ${state.selectedClient?.id === cl.id ? 'selected' : ''}>${cl.company_name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input type="text" id="newCampaignName" class="input-field" placeholder="Organic SEO Campaign 2025">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select id="newCampaignType" class="input-field">
                <option value="organic_seo">Organic SEO</option>
                <option value="local_seo">Local SEO</option>
                <option value="content_marketing">Content Marketing</option>
                <option value="social_media">Social Media</option>
                <option value="full_service">Full Service</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Monthly ($)</label>
              <input type="number" id="newCampaignInvestment" class="input-field" placeholder="2500">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input type="date" id="newCampaignStart" class="input-field" value="${new Date().toISOString().slice(0,10)}">
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_campaign_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveNewCampaign()" class="btn-primary flex-1"><i class="fas fa-rocket mr-2"></i>Create Campaign</button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// CAMPAIGN PLANS & TASK BOARD
// ==============================

const PHASE_NAMES = {
  1: 'Authority Foundation',
  2: 'Authority Expansion',
  3: 'Authority Acceleration',
  4: 'Authority Compounding',
};
const PHASE_MONTHS = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] };
const PHASE_COLORS = {
  1: { bg: 'bg-violet-50', border: 'border-violet-200', accent: 'text-violet-700', badge: 'bg-violet-600', prog: 'bg-violet-500' },
  2: { bg: 'bg-purple-50', border: 'border-purple-200', accent: 'text-purple-700', badge: 'bg-purple-600', prog: 'bg-purple-500' },
  3: { bg: 'bg-violet-50', border: 'border-violet-200', accent: 'text-violet-700', badge: 'bg-violet-600', prog: 'bg-violet-500' },
  4: { bg: 'bg-green-50', border: 'border-green-200', accent: 'text-green-700', badge: 'bg-green-600', prog: 'bg-green-500' },
};
const CATEGORY_ICONS = {
  foundation: 'fa-layer-group', technical: 'fa-wrench', on_page: 'fa-file-alt',
  content: 'fa-pen-nib', authority_placement: 'fa-external-link-alt',
  media_authority: 'fa-newspaper', entity_reinforcement: 'fa-sitemap',
  amplification: 'fa-bolt', signal_acceleration: 'fa-tachometer-alt',
  social: 'fa-share-nodes', reporting: 'fa-chart-line', review: 'fa-comments',
  ai_visibility: 'fa-robot',
};
const TASK_STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-yellow-100 text-yellow-700',
  review: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-600',
  skipped: 'bg-gray-100 text-gray-400',
};

function renderCampaignPlans() {
  if (!state.campaignPlansList) { loadCampaignPlans(); return loading(); }
  const plans = state.campaignPlansList;

  // Tier summary cards
  const tierCounts = {};
  plans.forEach(p => { tierCounts[p.tier_key] = (tierCounts[p.tier_key] || 0) + 1; });

  return `
    <div class="space-y-6">
      <!-- Summary stats -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${[
          { key: 'basic', label: 'AI Authority Foundation', color: 'blue', icon: 'fa-seedling', price: '$1,497' },
          { key: 'core', label: 'AI Authority Growth', color: 'purple', icon: 'fa-chart-line', price: '$2,497' },
          { key: 'ultimate', label: 'AI Authority Accelerator', color: 'orange', icon: 'fa-rocket', price: '$3,997' },
          { key: 'xtreme', label: 'AI Market Domination', color: 'green', icon: 'fa-crown', price: '$5,997' },
        ].map(t => `
          <div class="card">
            <div class="w-10 h-10 rounded-xl bg-${t.color}-100 flex items-center justify-center mb-3">
              <i class="fas ${t.icon} text-${t.color}-600"></i>
            </div>
            <div class="text-2xl font-bold text-gray-900">${tierCounts[t.key] || 0}</div>
            <div class="text-sm text-gray-700 font-medium mt-0.5">${t.label}</div>
            <div class="text-xs text-gray-400 mt-1">${t.price}/mo · Active plans</div>
          </div>
        `).join('')}
      </div>

      <!-- Plans table -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900"><i class="fas fa-tasks text-violet-500 mr-2"></i>All Campaign Plans</h3>
          <button onclick="openModal('new_plan_modal')" class="btn-primary text-sm"><i class="fas fa-plus mr-2"></i>Create Plan</button>
        </div>
        ${plans.length === 0 ? `
          <div class="text-center py-12 text-gray-400">
            <i class="fas fa-tasks text-4xl mb-4 block"></i>
            <p class="text-lg font-medium mb-2">No campaign plans yet</p>
            <p class="text-sm mb-4">Create a plan to generate a 12-month task board for a campaign.</p>
            <button onclick="openModal('new_plan_modal')" class="btn-primary"><i class="fas fa-plus mr-2"></i>Create First Plan</button>
          </div>
        ` : `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th class="px-3 py-2 rounded-l-lg">Campaign</th>
                <th class="px-3 py-2">Tier</th>
                <th class="px-3 py-2">Progress</th>
                <th class="px-3 py-2 text-center">Tasks</th>
                <th class="px-3 py-2 text-center">Overdue</th>
                <th class="px-3 py-2">Started</th>
                <th class="px-3 py-2 rounded-r-lg">Action</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-50">
                ${plans.map(p => {
                  const pct = p.total_tasks ? Math.round((p.completed_tasks / p.total_tasks) * 100) : 0;
                  return `
                    <tr class="hover:bg-gray-50">
                      <td class="px-3 py-3">
                        <div class="font-medium text-gray-900">${p.campaign_name}</div>
                        <div class="text-xs text-gray-400">${p.company_name}</div>
                      </td>
                      <td class="px-3 py-3">
                        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700">${p.tier_client_name}</span>
                      </td>
                      <td class="px-3 py-3">
                        <div class="flex items-center gap-2">
                          <div class="flex-1 bg-gray-200 rounded-full h-2 min-w-20">
                            <div class="h-2 rounded-full" style="background:#7C5CFC;width:${pct}%"></div>
                          </div>
                          <span class="text-xs text-gray-500 whitespace-nowrap">${pct}%</span>
                        </div>
                      </td>
                      <td class="px-3 py-3 text-center">
                        <span class="font-medium">${p.completed_tasks}</span><span class="text-gray-400">/${p.total_tasks}</span>
                      </td>
                      <td class="px-3 py-3 text-center">
                        ${p.overdue_tasks > 0 ? `<span class="text-red-600 font-semibold">${p.overdue_tasks}</span>` : '<span class="text-gray-300">—</span>'}
                      </td>
                      <td class="px-3 py-3 text-xs text-gray-400">${p.start_date}</td>
                      <td class="px-3 py-3">
                        <div class="flex gap-1.5">
                          <button onclick="openPlanTaskBoard(${p.campaign_id})" class="btn-secondary text-xs"><i class="fas fa-th-list mr-1"></i>Task Board</button>
                          ${isPM() ? `<button onclick="deletePlan(${p.id})" class="text-xs px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 transition" title="Delete plan"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
    ${renderNewPlanModal()}
    ${renderTaskEditModal()}
  `;
}

function renderNewPlanModal() {
  const tiers = [
    { key: 'basic', label: 'AI Authority Foundation', price: '$1,497/mo' },
    { key: 'core', label: 'AI Authority Growth', price: '$2,497/mo' },
    { key: 'ultimate', label: 'AI Authority Accelerator', price: '$3,997/mo' },
    { key: 'xtreme', label: 'AI Market Domination', price: '$5,997/mo' },
  ];
  return `
    <div id="new_plan_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900">Create Campaign Plan</h3>
          <button onclick="closeModal('new_plan_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <p class="text-sm text-gray-500 mb-5">Select a campaign and tier to auto-generate a 12-month task board with all deliverables.</p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Campaign</label>
            <select id="planCampaignId" class="input-field">
              <option value="">Select campaign...</option>
              ${(state.campaigns||[]).map(ca => `<option value="${ca.id}" data-client="${ca.client_id}">${ca.name} (${ca.company_name||''})</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Authority Tier</label>
            <div class="space-y-2">
              ${tiers.map(t => `
                <label class="flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition hover:border-violet-300 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50">
                  <input type="radio" name="planTier" value="${t.key}" class="accent-violet-600">
                  <div class="flex-1">
                    <div class="font-medium text-sm text-gray-900">${t.label}</div>
                    <div class="text-xs text-gray-400">${t.price} · 12 months · Auto-generated deliverables</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Campaign Start Date</label>
            <input type="date" id="planStartDate" class="input-field" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea id="planNotes" class="input-field" rows="2" placeholder="Any notes about this plan..."></textarea>
          </div>
          <div class="flex gap-3 mt-2">
            <button onclick="closeModal('new_plan_modal')" class="btn-secondary flex-1">Cancel</button>
            <button onclick="saveNewPlan()" class="btn-primary flex-1"><i class="fas fa-magic mr-2"></i>Generate 12-Month Plan</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTaskEditModal() {
  return `
    <div id="task_edit_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900" id="taskEditTitle">Update Task</h3>
          <button onclick="closeModal('task_edit_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select id="taskEditStatus" class="input-field">
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="review">In Review</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
            <input type="text" id="taskEditAssigned" class="input-field" placeholder="Team member name or email">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Deliverable URL</label>
            <input type="url" id="taskEditDelivUrl" class="input-field" placeholder="https://...">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Reference URL</label>
            <input type="url" id="taskEditRefUrl" class="input-field" placeholder="https://...">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
            <textarea id="taskEditNotes" class="input-field" rows="3" placeholder="Notes for this task..."></textarea>
          </div>
          <div class="flex items-center gap-2">
            <input type="checkbox" id="taskEditClientVisible" class="w-4 h-4 accent-violet-600">
            <label class="text-sm text-gray-700">Show in client report</label>
          </div>
          <div id="taskEditClientLabelRow" class="hidden">
            <label class="block text-sm font-medium text-gray-700 mb-1">Client-Facing Label</label>
            <input type="text" id="taskEditClientLabel" class="input-field" placeholder="Override label shown to client">
          </div>
          <input type="hidden" id="taskEditId">
          <div class="flex gap-3">
            <button onclick="closeModal('task_edit_modal')" class="btn-secondary flex-1">Cancel</button>
            <button onclick="saveTaskEdit()" class="btn-primary flex-1"><i class="fas fa-save mr-2"></i>Save Task</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Render the full task board for a campaign
function renderCampaignTaskBoard() {
  const data = state.campaignPlanData;
  if (!data || !data.plan) {
    return `
      <div class="card text-center py-12 text-gray-400">
        <i class="fas fa-tasks text-4xl mb-4 block"></i>
        <p class="text-lg font-medium mb-2">No Campaign Plan Yet</p>
        <p class="text-sm mb-4">Create a plan to auto-generate the 12-month task board.</p>
        <button onclick="openModal('new_plan_modal')" class="btn-primary"><i class="fas fa-magic mr-2"></i>Create Plan</button>
      </div>
      ${renderNewPlanModal()}
      ${renderTaskEditModal()}
    `;
  }
  const { plan, tasks, phases } = data;

  // Build tasks grouped by month
  const byMonth = {};
  tasks.forEach(t => {
    if (!byMonth[t.month_number]) byMonth[t.month_number] = [];
    byMonth[t.month_number].push(t);
  });

  const currentFilter = state.taskBoardFilter || 'all';
  const currentPhase = state.taskBoardPhase || 0; // 0 = all phases shown

  return `
    <div class="space-y-6">
      <!-- Plan Header -->
      <div class="card bg-gradient-to-r from-slate-900 to-slate-700 text-white">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div class="text-slate-300 text-xs font-medium uppercase tracking-wide mb-1">Campaign Authority Plan</div>
            <h3 class="text-xl font-bold">${plan.campaign_name}</h3>
            <p class="text-slate-300 text-sm">${plan.company_name} · Started ${plan.start_date}</p>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold">${plan.tier_client_name}</div>
            <div class="text-slate-300 text-sm">${fmtCurrency(plan.monthly_price)}/month</div>
            ${isPM() ? `<button onclick="openReschedulePlanModal(${plan.id}, '${plan.start_date}')" class="mt-2 text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg transition"><i class="fas fa-calendar-alt mr-1"></i>Reschedule Plan</button>` : ''}
          </div>
        </div>
        <!-- Phase progress overview -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/20">
          ${phases.map(ph => {
            const col = PHASE_COLORS[ph.phase];
            return `
              <div class="bg-white/10 rounded-xl p-3 cursor-pointer hover:bg-white/20 transition ${state.taskBoardPhase === ph.phase ? 'ring-2 ring-white' : ''}"
                   onclick="filterTaskPhase(${ph.phase})">
                <div class="text-xs font-semibold text-white/70 uppercase tracking-wide">Phase ${ph.phase}</div>
                <div class="text-sm font-bold text-white mt-0.5">${ph.name}</div>
                <div class="flex items-center gap-2 mt-2">
                  <div class="flex-1 bg-white/20 rounded-full h-1.5">
                    <div class="bg-white h-1.5 rounded-full transition-all" style="width:${ph.pct}%"></div>
                  </div>
                  <span class="text-xs text-white/80">${ph.pct}%</span>
                </div>
                <div class="text-xs text-white/60 mt-1">${ph.completed}/${ph.total} tasks</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex gap-1 bg-gray-100 rounded-xl p-1">
          ${['all','pending','in_progress','review','completed','blocked'].map(s => `
            <button onclick="filterTasks('${s}')" class="px-3 py-1.5 rounded-lg text-xs font-medium transition ${currentFilter === s ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}">
              ${s === 'all' ? 'All Tasks' : s.replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          `).join('')}
        </div>
        <div class="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onclick="filterTaskPhase(0)" class="px-3 py-1.5 rounded-lg text-xs font-medium transition ${currentPhase === 0 ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}">All Phases</button>
          ${[1,2,3,4].map(ph => `
            <button onclick="filterTaskPhase(${ph})" class="px-3 py-1.5 rounded-lg text-xs font-medium transition ${currentPhase === ph ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}">Phase ${ph}</button>
          `).join('')}
        </div>
        <div class="flex gap-2 ml-auto">
          <button onclick="assignAllToMe()" class="text-xs px-3 py-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 transition font-medium"><i class="fas fa-user-check mr-1"></i>Assign All to Me</button>
          <span class="text-xs text-gray-400 self-center">${tasks.filter(t => t.status === 'completed').length}/${tasks.length} done</span>
        </div>
      </div>

      <!-- Task board by phase -->
      ${[1,2,3,4].filter(ph => currentPhase === 0 || currentPhase === ph).map(ph => {
        const col = PHASE_COLORS[ph];
        const months = PHASE_MONTHS[ph];
        const phaseTasksAll = tasks.filter(t => months.includes(t.month_number));
        const phaseTasks = phaseTasksAll.filter(t => currentFilter === 'all' || t.status === currentFilter);
        if (phaseTasks.length === 0 && currentFilter !== 'all') return '';
        const phInfo = phases.find(p => p.phase === ph) || {};

        return `
          <div class="${col.bg} border ${col.border} rounded-2xl overflow-hidden">
            <div class="px-6 py-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 ${col.badge} rounded-lg flex items-center justify-center text-white text-xs font-bold">${ph}</div>
                <div>
                  <div class="${col.accent} font-bold text-base">Phase ${ph} – ${PHASE_NAMES[ph]}</div>
                  <div class="text-xs text-gray-500">Months ${months[0]}–${months[months.length-1]} · ${phInfo.completed || 0}/${phInfo.total || 0} tasks complete</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-24 bg-gray-200 rounded-full h-2">
                  <div class="${col.prog} h-2 rounded-full transition-all" style="width:${phInfo.pct || 0}%"></div>
                </div>
                <span class="text-sm font-semibold ${col.accent}">${phInfo.pct || 0}%</span>
              </div>
            </div>

            <!-- Months within phase -->
            <div class="px-6 pb-6 space-y-4">
              ${months.map(m => {
                const monthTasks = phaseTasks.filter(t => t.month_number === m);
                if (monthTasks.length === 0) return '';
                const monthDone = monthTasks.filter(t => t.status === 'completed').length;
                return `
                  <div class="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                    <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">${m}</span>
                        <span class="font-semibold text-sm text-gray-800">Month ${m}</span>
                        <span class="text-xs text-gray-400">(${monthTasks.length} tasks, ${monthDone} done)</span>
                      </div>
                      <div class="flex items-center gap-2">
                        ${monthDone === monthTasks.length && monthTasks.length > 0 ? '<span class="text-xs text-green-600 font-semibold"><i class="fas fa-check-circle mr-1"></i>Complete</span>' : `<button onclick="bulkCompleteMonth(${m})" class="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition" title="Mark all month tasks complete"><i class="fas fa-check-double mr-1"></i>Complete Month</button>`}
                      </div>
                    </div>
                    <div class="divide-y divide-gray-50">
                      ${monthTasks.map(t => {
                        const statusCls = TASK_STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-500';
                        const catIcon = CATEGORY_ICONS[t.category] || 'fa-tasks';
                        const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
                        return `
                          <div class="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition group">
                            <div class="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <i class="fas ${catIcon} text-xs text-gray-500"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-start gap-2 flex-wrap">
                                <span class="text-sm font-medium text-gray-900 flex-1">${t.title}</span>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCls} flex-shrink-0">
                                  ${t.status.replace(/_/g,' ')}
                                </span>
                              </div>
                              <div class="flex items-center gap-3 mt-1 flex-wrap">
                                <span class="text-xs text-gray-400 capitalize">${(t.category||'').replace(/_/g,' ')}</span>
                                ${t.assigned_to ? `<span class="text-xs text-violet-600"><i class="fas fa-user mr-1"></i>${t.assigned_to}</span>` : ''}
                                ${t.due_date ? `<span class="text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400'}"><i class="fas fa-calendar mr-1"></i>${t.due_date}${isOverdue ? ' ⚠' : ''}</span>` : ''}
                                ${t.deliverable_url ? `<a href="${t.deliverable_url}" target="_blank" class="text-xs text-green-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>Deliverable</a>` : ''}
                                ${t.client_visible ? '<span class="text-xs text-purple-500"><i class="fas fa-eye mr-1"></i>Client visible</span>' : ''}
                              </div>
                              ${t.notes ? `<p class="text-xs text-gray-400 mt-1 line-clamp-1">${t.notes}</p>` : ''}
                            </div>
                            <div class="flex gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                              ${t.status !== 'completed' ? `
                                <button onclick="quickCompleteTask(${t.id})" class="w-7 h-7 rounded-lg bg-green-100 hover:bg-green-200 flex items-center justify-center text-green-600" title="Mark complete">
                                  <i class="fas fa-check text-xs"></i>
                                </button>
                              ` : ''}
                              <button onclick="openTaskEdit(${JSON.stringify(t).replace(/"/g,'&quot;')})" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600" title="Edit task">
                                <i class="fas fa-pen text-xs"></i>
                              </button>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                `;
              }).filter(Boolean).join('')}
              ${phaseTasks.length === 0 ? `<div class="text-center py-4 text-gray-400 text-sm">No ${currentFilter !== 'all' ? currentFilter.replace(/_/g,' ') : ''} tasks in this phase.</div>` : ''}
            </div>
          </div>
        `;
      }).filter(Boolean).join('')}
    </div>
    ${renderNewPlanModal()}
    ${renderTaskEditModal()}
  `;
}

// Task board helper functions
function filterTasks(status) {
  state.taskBoardFilter = status;
  render();
}
function filterTaskPhase(phase) {
  state.taskBoardPhase = phase === state.taskBoardPhase ? 0 : phase;
  render();
}

async function quickCompleteTask(taskId) {
  try {
    await API.patch(`/campaign-plans/tasks/${taskId}`, { status: 'completed' });
    toast('Task marked complete ✓');
    // Refresh plan data
    if (state.selectedCampaign) await loadCampaignPlanData(state.selectedCampaign.id);
    else if (state.campaignPlanData?.plan?.campaign_id) await loadCampaignPlanData(state.campaignPlanData.plan.campaign_id);
  } catch (e) { toast('Failed to update task', 'error'); }
}

function openTaskEdit(task) {
  if (typeof task === 'string') task = JSON.parse(task);
  document.getElementById('taskEditId').value = task.id;
  document.getElementById('taskEditTitle').textContent = task.title;
  document.getElementById('taskEditStatus').value = task.status;
  document.getElementById('taskEditAssigned').value = task.assigned_to || '';
  document.getElementById('taskEditDelivUrl').value = task.deliverable_url || '';
  document.getElementById('taskEditRefUrl').value = task.url_reference || '';
  document.getElementById('taskEditNotes').value = task.notes || '';
  document.getElementById('taskEditClientVisible').checked = !!task.client_visible;
  const labelRow = document.getElementById('taskEditClientLabelRow');
  labelRow.classList.toggle('hidden', !task.client_visible);
  document.getElementById('taskEditClientLabel').value = task.client_label || '';
  document.getElementById('taskEditClientVisible').onchange = function() {
    labelRow.classList.toggle('hidden', !this.checked);
  };
  openModal('task_edit_modal');
}

async function saveTaskEdit() {
  const id = document.getElementById('taskEditId').value;
  const data = {
    status: document.getElementById('taskEditStatus').value,
    assigned_to: document.getElementById('taskEditAssigned').value || null,
    deliverable_url: document.getElementById('taskEditDelivUrl').value || null,
    url_reference: document.getElementById('taskEditRefUrl').value || null,
    notes: document.getElementById('taskEditNotes').value || null,
    client_visible: document.getElementById('taskEditClientVisible').checked ? 1 : 0,
    client_label: document.getElementById('taskEditClientLabel').value || null,
  };
  try {
    await API.patch(`/campaign-plans/tasks/${id}`, data);
    closeModal('task_edit_modal');
    toast('Task updated');
    const campaignId = state.selectedCampaign?.id || state.campaignPlanData?.plan?.campaign_id;
    if (campaignId) await loadCampaignPlanData(campaignId);
  } catch (e) { toast('Failed to save task', 'error'); }
}

async function assignAllToMe() {
  const myName = state.currentUser?.full_name || state.currentUser?.email || 'Me';
  const tasks = state.campaignPlanData?.tasks || [];
  const pendingTasks = tasks.filter(t => !t.assigned_to && t.status !== 'completed');
  if (pendingTasks.length === 0) { toast('All tasks already assigned', 'warning'); return; }
  try {
    const taskIds = pendingTasks.map(t => t.id);
    await API.patch('/campaign-plans/tasks/bulk', { task_ids: taskIds, assigned_to: myName });
    toast(`Assigned ${taskIds.length} tasks to ${myName}`);
    const campaignId = state.selectedCampaign?.id || state.campaignPlanData?.plan?.campaign_id;
    if (campaignId) await loadCampaignPlanData(campaignId);
  } catch (e) { toast('Failed to assign tasks', 'error'); }
}

async function bulkCompleteMonth(monthNum) {
  const tasks = (state.campaignPlanData?.tasks || []).filter(t => t.month_number === monthNum && t.status !== 'completed');
  if (tasks.length === 0) { toast('All tasks in this month already complete', 'warning'); return; }
  try {
    await API.patch('/campaign-plans/tasks/bulk', { task_ids: tasks.map(t => t.id), status: 'completed' });
    toast(`Marked ${tasks.length} tasks complete for Month ${monthNum}`);
    const campaignId = state.selectedCampaign?.id || state.campaignPlanData?.plan?.campaign_id;
    if (campaignId) await loadCampaignPlanData(campaignId);
  } catch (e) { toast('Failed to bulk complete', 'error'); }
}

async function saveNewPlan() {
  const campaignSel = document.getElementById('planCampaignId');
  const tierSel = document.querySelector('input[name="planTier"]:checked');
  const startDate = document.getElementById('planStartDate').value;
  const notes = document.getElementById('planNotes').value;

  if (!campaignSel?.value) { toast('Please select a campaign', 'warning'); return; }
  if (!tierSel) { toast('Please select an authority tier', 'warning'); return; }
  if (!startDate) { toast('Please enter a start date', 'warning'); return; }

  const opt = campaignSel.options[campaignSel.selectedIndex];
  const clientId = opt.getAttribute('data-client');

  const btn = document.querySelector('#new_plan_modal button[onclick="saveNewPlan()"]') || event?.target;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...'; }

  try {
    const res = await API.post('/campaign-plans', {
      campaign_id: parseInt(campaignSel.value),
      client_id: parseInt(clientId),
      tier_key: tierSel.value,
      start_date: startDate,
      notes,
    });
    closeModal('new_plan_modal');
    toast(`Plan created! ${res.data.tasks_generated} tasks generated.`);
    state.campaignPlansList = null;
    await loadCampaignPlans();
    openPlanTaskBoard(parseInt(campaignSel.value));
  } catch (e) {
    const msg = e?.response?.data?.error || 'Failed to create plan';
    toast(msg, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate 12-Month Plan'; }
  }
}

async function openPlanTaskBoard(campaignId) {
  await loadCampaignPlanData(campaignId);
  // Find campaign
  const ca = state.campaigns.find(c => c.id === campaignId);
  if (ca) state.selectedCampaign = ca;
  navigate('campaign_detail', {});
}

async function deletePlan(planId) {
  if (!confirm('Delete this campaign plan and all tasks? This cannot be undone.')) return;
  try {
    await API.delete(`/campaign-plans/${planId}`);
    toast('Campaign plan deleted');
    state.campaignPlansList = null;
    state.campaignPlanData = null;
    await loadCampaignPlans();
  } catch (e) { toast('Failed to delete plan', 'error'); }
}

// ── Reschedule Plan ─────────────────────────────────────────
function openReschedulePlanModal(planId, currentStartDate) {
  // Inject modal if not already in DOM
  let modal = document.getElementById('reschedule_plan_modal');
  if (!modal) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="reschedule_plan_modal" class="modal-overlay hidden">
        <div class="modal-box p-6 max-w-md">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-900"><i class="fas fa-calendar-alt mr-2 text-violet-600"></i>Reschedule Campaign Plan</h3>
            <button onclick="closeModal('reschedule_plan_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <p class="text-sm text-gray-500 mb-4">Changing the start date will recalculate all task due dates proportionally across all 12 months.</p>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">New Start Date</label>
              <input type="date" id="reschedule_start_date" class="input-field">
            </div>
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              <i class="fas fa-exclamation-triangle mr-1"></i>
              This will update all pending task due dates. Completed tasks are not affected.
            </div>
          </div>
          <div class="flex gap-3 mt-5">
            <button onclick="closeModal('reschedule_plan_modal')" class="btn-secondary flex-1">Cancel</button>
            <button onclick="saveReschedulePlan()" id="reschedule_save_btn" class="btn-primary flex-1"><i class="fas fa-calendar-check mr-2"></i>Reschedule</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
    modal = document.getElementById('reschedule_plan_modal');
  }
  modal.setAttribute('data-plan-id', planId);
  document.getElementById('reschedule_start_date').value = currentStartDate || '';
  openModal('reschedule_plan_modal');
}

async function saveReschedulePlan() {
  const modal = document.getElementById('reschedule_plan_modal');
  const planId = modal?.getAttribute('data-plan-id');
  const newDate = document.getElementById('reschedule_start_date')?.value;
  if (!planId || !newDate) { toast('Please select a date', 'warning'); return; }
  const btn = document.getElementById('reschedule_save_btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Rescheduling...'; }
  try {
    await API.patch(`/campaign-plans/${planId}/reschedule`, { start_date: newDate });
    closeModal('reschedule_plan_modal');
    toast('Plan rescheduled – task due dates updated ✓');
    const campaignId = state.campaignPlanData?.plan?.campaign_id || state.selectedCampaign?.id;
    if (campaignId) await loadCampaignPlanData(campaignId);
    render();
  } catch (e) {
    toast(e?.response?.data?.error || 'Failed to reschedule plan', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-calendar-check mr-2"></i>Reschedule'; }
  }
}

// ==============================
// PROPOSALS
function renderProposals() {
  if (!state.proposals) { loadProposals(); return loading(); }
  return `
    <div class="space-y-4">
      <div class="flex gap-3 flex-wrap">
        <select id="proposalStatusFilter" class="input-field w-40" onchange="filterProposals()">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="approved">Approved</option>
          <option value="rejected">Declined</option>
        </select>
      </div>
      <div class="space-y-3">
        ${(state.proposals || []).length === 0 ? '<div class="card text-center py-12 text-gray-400">No proposals yet. <button onclick="navigate(\'new_proposal\')" class="text-violet-600 hover:underline ml-1">Create one</button></div>' :
          (state.proposals || []).map(p => `
            <div class="card">
              <div class="flex items-start justify-between flex-wrap gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2 flex-wrap mb-1">
                    <h3 class="font-semibold text-gray-900">${p.title}</h3>
                    ${statusBadge(p.status)}
                  </div>
                  <p class="text-sm text-gray-500">${p.company_name} · ${p.contact_email}</p>
                  <p class="text-xs text-gray-400 mt-1">
                    ${(p.proposal_type||'').replace(/_/g,' ')} ·
                    Created ${p.created_at?.slice(0,10)}
                    ${p.sent_at ? `· Sent ${p.sent_at?.slice(0,10)}` : ''}
                    ${p.approved_at ? `· Approved ${p.approved_at?.slice(0,10)}` : ''}
                  </p>
                </div>
                <div class="text-right flex flex-col items-end gap-2">
                  <span class="text-xl font-bold text-violet-600">${fmtCurrency(p.monthly_investment)}/mo</span>
                  <p class="text-xs text-gray-400">${p.contract_length} month contract</p>
                  ${p.setup_fee > 0 ? `<p class="text-xs text-gray-500">+ ${fmtCurrency(p.setup_fee)} setup fee</p>` : ''}
                  <div class="flex gap-2 flex-wrap justify-end">
                    ${p.status === 'draft' ? `<button onclick="sendProposal(${p.id})" class="btn-primary text-xs"><i class="fas fa-paper-plane mr-1"></i>Send to Client</button>` : ''}
                    ${p.status === 'sent' ? `
                      <button onclick="copyApprovalLink('${p.approval_token}')" class="btn-secondary text-xs"><i class="fas fa-link mr-1"></i>Copy Link</button>
                      <a href="/proposals/approve/${p.approval_token}" target="_blank" class="btn-secondary text-xs"><i class="fas fa-eye mr-1"></i>Preview</a>
                    ` : ''}
                    ${p.status === 'approved' && !p.paid_at ? `
                      <button onclick="activatePayment(${p.id})" class="btn-success text-xs"><i class="fas fa-bolt mr-1"></i>Activate Campaign</button>
                    ` : ''}
                    ${p.paid_at ? `<span class="text-xs text-green-600"><i class="fas fa-check-circle mr-1"></i>Active & Billing</span>` : ''}
                  </div>
                </div>
              </div>
              ${p.scope_summary ? `<p class="text-sm text-gray-500 mt-3 pt-3 border-t line-clamp-2">${p.scope_summary}</p>` : ''}
            </div>
          `).join('')}
      </div>
    </div>
  `;
}

// ==============================
// NEW PROPOSAL (Enhanced)
// ==============================
function renderNewProposal() {
  const preClient = state.selectedClient;
  const proposalTypes = [
    ['organic_seo','Organic SEO'],['local_seo','Local SEO'],
    ['content_marketing','Content Marketing'],['technical_seo','Technical SEO'],
    ['full_service','Full Service Digital Marketing'],['wordpress_dev','WordPress Development'],
    ['wordpress_maintenance','WordPress Maintenance'],['press_release','Press Release Package'],
    ['social_media','Social Media Management'],['ai_seo_content','AI SEO Content Package'],
    ['link_building','Link Building & Digital PR'],['ecommerce_seo','eCommerce SEO'],
    ['reputation_management','Reputation Management'],['custom','Custom Package'],
  ];
  return `
    <div class="max-w-4xl space-y-6">
      <button onclick="navigate('proposals')" class="text-sm text-gray-500 hover:text-violet-600">
        <i class="fas fa-arrow-left mr-1"></i>Back to Proposals
      </button>

      <div class="card">
        <h2 class="text-lg font-bold text-gray-900 mb-2">Create New Proposal</h2>
        <p class="text-sm text-gray-500 mb-5">Select an AI Authority Tier to auto-populate pricing, scope, and strategic framing.</p>

        <!-- Authority Tier Selector -->
        <div class="mb-5">
          <label class="block text-sm font-medium text-gray-700 mb-3"><i class="fas fa-layer-group text-violet-500 mr-1"></i>Select Authority Tier</label>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            ${[
              { key: 'basic', name: 'AI Authority Foundation', price: 1497, color: 'blue', icon: 'fa-seedling', desc: 'Core authority placement layer with foundational media trust signals.' },
              { key: 'core', name: 'AI Authority Growth', price: 2497, color: 'purple', icon: 'fa-chart-line', desc: 'Multi-tier authority placements with quarterly media injections.' },
              { key: 'ultimate', name: 'AI Authority Accelerator', price: 3997, color: 'orange', icon: 'fa-rocket', desc: 'High-velocity placements, premium media injections & amplification.' },
              { key: 'xtreme', name: 'AI Market Domination', price: 5997, color: 'green', icon: 'fa-crown', desc: 'Double media injections, aggressive entity saturation & amplification.' },
            ].map(t => `
              <label class="cursor-pointer group" onclick="selectTier('${t.key}', ${t.price})">
                <input type="radio" name="authorityTier" value="${t.key}" class="hidden">
                <div id="tierCard_${t.key}" class="border-2 border-gray-200 rounded-xl p-4 hover:border-${t.color}-400 transition-all">
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-8 h-8 rounded-lg bg-${t.color}-100 flex items-center justify-center">
                      <i class="fas ${t.icon} text-${t.color}-600 text-sm"></i>
                    </div>
                    <span class="text-sm font-bold text-gray-900">${fmtCurrency(t.price)}<span class="text-xs text-gray-400">/mo</span></span>
                  </div>
                  <div class="text-xs font-semibold text-gray-800 mb-1">${t.name}</div>
                  <div class="text-xs text-gray-400 leading-relaxed">${t.desc}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select id="pClientId" class="input-field">
              <option value="">Select client...</option>
              ${(state.clients || []).map(cl => `<option value="${cl.id}" ${preClient?.id == cl.id ? 'selected' : ''}>${cl.company_name}</option>`).join('')}
            </select>
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Service Type *</label>
            <select id="pType" class="input-field">
              ${proposalTypes.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Monthly Investment ($) *</label>
            <input type="number" id="pInvestment" class="input-field" value="3000" min="500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contract Length (months)</label>
            <input type="number" id="pContractLength" class="input-field" value="12" min="1">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Setup Fee ($)</label>
            <input type="number" id="pSetupFee" class="input-field" value="0" min="0" placeholder="0">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Account Manager</label>
            <input type="text" id="pAccountManager" class="input-field" placeholder="Your name">
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
        <h3 class="font-semibold text-gray-900 mb-4">Generated Proposal — Review & Edit</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Proposal Title</label>
            <input type="text" id="pTitle" class="input-field">
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Monthly Investment ($)</label>
              <input type="number" id="pInvestmentFinal" class="input-field">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contract Length (months)</label>
              <input type="number" id="pContractFinal" class="input-field">
            </div>
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
            <label class="block text-sm font-medium text-gray-700 mb-1">Campaign Goals</label>
            <textarea id="pGoalsFinal" class="input-field" rows="3"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Baseline Notes</label>
            <textarea id="pBaseline" class="input-field" rows="2"></textarea>
          </div>
        </div>

        <!-- Line Items -->
        <div class="mt-5 pt-5 border-t">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-semibold text-gray-800 text-sm">Deliverable Line Items</h4>
          </div>
          <div id="lineItemsList" class="space-y-2"></div>
        </div>

        <div class="flex gap-3 mt-5 pt-5 border-t">
          <button onclick="saveProposal('draft')" class="btn-secondary flex-1">Save as Draft</button>
          <button onclick="saveProposal('send')" class="btn-primary flex-1">
            <i class="fas fa-paper-plane mr-2"></i>Save & Send to Client
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// PAYMENTS & BILLING
// ==============================
function renderPayments() {
  if (!state.billingData) { loadBilling(); return loading(); }
  const d = state.billingData;
  const stats = d.stats || {};
  return `
    <div class="space-y-6">
      <!-- Stats Row -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${[
          { label: 'Monthly Recurring', val: fmtCurrency(stats.monthly_recurring), sub: `${stats.active_clients || 0} active clients`, color: 'blue' },
          { label: 'Total Collected', val: fmtCurrency(stats.total_collected), sub: 'All time', color: 'green' },
          { label: 'Active Schedules', val: stats.active_schedules || 0, sub: '28-day billing cycles', color: 'purple' },
          { label: 'Overdue', val: fmtCurrency(d.overdue?.total || 0), sub: `${d.overdue?.count || 0} schedules`, color: 'red' },
        ].map(s => `
          <div class="card">
            <div class="text-2xl font-bold text-${s.color}-600">${s.val}</div>
            <div class="text-sm text-gray-700 mt-0.5 font-medium">${s.label}</div>
            <div class="text-xs text-gray-400 mt-1">${s.sub}</div>
          </div>
        `).join('')}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Upcoming Billing -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-900"><i class="fas fa-calendar-alt text-violet-500 mr-2"></i>Upcoming Billing</h3>
            <button onclick="processBilling()" class="btn-secondary text-xs"><i class="fas fa-cogs mr-1"></i>Process Due Now</button>
          </div>
          ${!(d.upcoming_billing||[]).length ? '<p class="text-gray-400 text-sm">No upcoming billing</p>' :
            `<div class="space-y-2">
              ${(d.upcoming_billing||[]).slice(0,8).map(bs => `
                <div class="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                  <div>
                    <p class="font-medium text-sm text-gray-900">${bs.company_name}</p>
                    <p class="text-xs text-gray-500">${bs.campaign_name} · Cycle ${bs.cycle_number}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-semibold text-gray-900">${fmtCurrency(bs.amount)}</p>
                    <p class="text-xs ${new Date(bs.next_billing_date) < new Date() ? 'text-red-500 font-medium' : 'text-gray-400'}">${bs.next_billing_date}</p>
                  </div>
                </div>`).join('')}
            </div>`}
        </div>

        <!-- Recent Payments -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-receipt text-green-500 mr-2"></i>Recent Payments</h3>
          ${!(d.recent_payments||[]).length ? '<p class="text-gray-400 text-sm">No payments yet</p>' :
            `<div class="space-y-2">
              ${(d.recent_payments||[]).slice(0,8).map(pmt => `
                <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p class="text-sm font-medium text-gray-900">${pmt.company_name}</p>
                    <p class="text-xs text-gray-400">${pmt.invoice_number || ''} · ${pmt.paid_at?.slice(0,10) || pmt.created_at?.slice(0,10)}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-semibold text-gray-900">${fmtCurrency(pmt.amount)}</p>
                    ${statusBadge(pmt.status)}
                  </div>
                </div>`).join('')}
            </div>`}
        </div>
      </div>

      <!-- Manual Payment -->
      <div class="card">
        <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-plus-circle text-purple-500 mr-2"></i>Record Manual Payment</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select id="manualPayClient" class="input-field">
              <option value="">Select...</option>
              ${(state.clients||[]).map(cl => `<option value="${cl.id}">${cl.company_name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
            <input type="number" id="manualPayAmount" class="input-field" placeholder="2500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select id="manualPayType" class="input-field">
              <option value="first_payment">First Payment</option>
              <option value="recurring">Recurring</option>
              <option value="one_off">One-Off</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input type="text" id="manualPayDesc" class="input-field" placeholder="Invoice description">
          </div>
        </div>
        <button onclick="recordManualPayment()" class="btn-primary mt-4"><i class="fas fa-check mr-2"></i>Record Payment</button>
      </div>
    </div>
  `;
}

// ==============================
// WORDPRESS PROJECTS
// ==============================
function renderWordPress() {
  if (!state.wpProjects) { loadWpProjects(); return loading(); }
  return `
    <div class="space-y-4">
      ${(state.wpProjects||[]).length === 0 ? `
        <div class="card text-center py-12">
          <i class="fab fa-wordpress text-5xl text-gray-200 mb-4"></i>
          <p class="text-gray-500 mb-2">No WordPress projects yet</p>
          <button onclick="openModal('new_wp_modal')" class="btn-primary"><i class="fas fa-plus mr-2"></i>New WP Project</button>
        </div>` :
        (state.wpProjects||[]).map(wp => `
          <div class="card hover:shadow-md transition cursor-pointer" onclick="navigate('wordpress_detail', {selectedWpProject: ${JSON.stringify(wp).replace(/"/g,'&quot;')}})">
            <div class="flex items-start justify-between">
              <div class="flex gap-4 items-start">
                <div class="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <i class="fab fa-wordpress text-violet-600 text-lg"></i>
                </div>
                <div>
                  <h3 class="font-semibold text-gray-900">${wp.project_name}</h3>
                  <p class="text-sm text-gray-500">${wp.company_name} · ${wp.project_type?.replace(/_/g,' ')}</p>
                  ${wp.site_url ? `<p class="text-xs text-violet-500 mt-0.5">${wp.site_url}</p>` : ''}
                  <div class="flex gap-4 mt-2 text-xs text-gray-400">
                    ${wp.theme_used ? `<span><i class="fas fa-palette mr-1"></i>${wp.theme_used}</span>` : ''}
                    ${wp.page_builder ? `<span><i class="fas fa-th-large mr-1"></i>${wp.page_builder}</span>` : ''}
                    ${wp.block_count ? `<span><i class="fas fa-puzzle-piece mr-1"></i>${wp.blocks_completed||0}/${wp.block_count} blocks done</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="flex flex-col items-end gap-2">
                ${statusBadge(wp.status)}
                ${wp.project_budget ? `<span class="text-sm font-semibold text-gray-700">${fmtCurrency(wp.project_budget)}</span>` : ''}
                ${wp.go_live_date ? `<span class="text-xs text-gray-400">Live: ${wp.go_live_date}</span>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      ${renderNewWpModal()}
    </div>
  `;
}

function renderWpProjectDetail() {
  const wp = state.selectedWpProject;
  if (!wp) return '<p>No project selected</p>';
  if (!wp.blocks && !wp._loaded) { loadWpProjectDetail(wp.id); return loading(); }

  const blocks = wp.blocks || [];
  const completed = blocks.filter(b => b.status === 'completed').length;
  const total_hours = blocks.reduce((a, b) => a + (b.hours_estimated || 0), 0);

  return `
    <div class="space-y-6">
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <button onclick="navigate('wordpress')" class="hover:text-violet-600"><i class="fas fa-arrow-left mr-1"></i>WordPress Projects</button>
        <i class="fas fa-chevron-right text-xs"></i>
        <span class="text-gray-900 font-medium">${wp.project_name}</span>
      </div>

      <div class="card">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 class="text-xl font-bold text-gray-900">${wp.project_name}</h2>
            <p class="text-sm text-gray-500">${wp.company_name} · ${wp.project_type?.replace(/_/g,' ')}</p>
            ${wp.site_url ? `<a href="${wp.site_url}" target="_blank" class="text-violet-600 text-sm hover:underline">${wp.site_url}</a>` : ''}
          </div>
          <div class="flex gap-2 items-center flex-wrap">
            ${statusBadge(wp.status)}
            ${wp.project_budget ? `<span class="font-bold text-xl text-violet-600">${fmtCurrency(wp.project_budget)}</span>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div><p class="text-xs text-gray-400">Theme</p><p class="font-medium text-sm">${wp.theme_used || '–'}</p></div>
          <div><p class="text-xs text-gray-400">Page Builder</p><p class="font-medium text-sm">${wp.page_builder || '–'}</p></div>
          <div><p class="text-xs text-gray-400">Hours</p><p class="font-medium text-sm">${wp.hours_used || 0} / ${wp.hours_quoted || 0} quoted</p></div>
          <div><p class="text-xs text-gray-400">Go-Live</p><p class="font-medium text-sm">${wp.go_live_date || 'TBD'}</p></div>
        </div>
      </div>

      <!-- Implementation Blocks Progress -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900"><i class="fas fa-puzzle-piece text-violet-500 mr-2"></i>Implementation Blocks (${completed}/${blocks.length})</h3>
          <button onclick="openModal('new_wp_block_modal')" class="btn-secondary text-xs"><i class="fas fa-plus mr-1"></i>Add Block</button>
        </div>
        <!-- Progress bar -->
        <div class="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div class="h-2 rounded-full transition-all" style="background:#7C5CFC;width: ${blocks.length ? Math.round(completed/blocks.length*100) : 0}%"></div>
        </div>
        <p class="text-xs text-gray-500 mb-4">${completed} of ${blocks.length} blocks completed · ${total_hours}h estimated total</p>

        <div class="space-y-2">
          ${blocks.length === 0 ? '<p class="text-gray-400 text-sm">No implementation blocks yet</p>' :
            blocks.map(blk => `
              <div class="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div class="flex-shrink-0">
                  <button onclick="updateBlockStatus(${blk.id}, '${blk.status === 'completed' ? 'pending' : 'completed'}')"
                    class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition
                      ${blk.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-500'}">
                    ${blk.status === 'completed' ? '<i class="fas fa-check text-xs"></i>' : ''}
                  </button>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-medium text-sm text-gray-900 ${blk.status === 'completed' ? 'line-through text-gray-400' : ''}">${blk.block_name}</p>
                    ${statusBadge(blk.status)}
                  </div>
                  ${blk.description ? `<p class="text-xs text-gray-400 mt-0.5">${blk.description}</p>` : ''}
                </div>
                <div class="text-right flex-shrink-0">
                  ${blk.hours_estimated ? `<p class="text-xs text-gray-500">${blk.hours_estimated}h</p>` : ''}
                  ${blk.price ? `<p class="text-xs font-semibold text-gray-700">${fmtCurrency(blk.price)}</p>` : ''}
                </div>
              </div>
            `).join('')}
        </div>
      </div>

      ${renderNewWpBlockModal(wp.id)}
    </div>
  `;
}

function renderNewWpModal() {
  return `
    <div id="new_wp_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900">New WordPress Project</h3>
          <button onclick="closeModal('new_wp_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select id="wpClientId" class="input-field">
              <option value="">Select client...</option>
              ${(state.clients||[]).map(cl => `<option value="${cl.id}">${cl.company_name}</option>`).join('')}
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
            <input type="text" id="wpProjectName" class="input-field" placeholder="New Website Redesign 2025"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Project Type</label>
              <select id="wpProjectType" class="input-field">
                <option value="new_site">New Site</option>
                <option value="redesign">Redesign</option>
                <option value="plugin_dev">Plugin Dev</option>
                <option value="consultancy">Consultancy</option>
                <option value="maintenance">Maintenance</option>
                <option value="migration">Migration</option>
              </select></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Budget ($)</label>
              <input type="number" id="wpBudget" class="input-field" placeholder="5000"></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Theme</label>
              <input type="text" id="wpTheme" class="input-field" placeholder="Astra, GeneratePress..."></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Page Builder</label>
              <select id="wpBuilder" class="input-field">
                <option value="elementor">Elementor</option>
                <option value="gutenberg">Gutenberg (Block Editor)</option>
                <option value="divi">Divi</option>
                <option value="beaverbuilder">Beaver Builder</option>
                <option value="wpbakery">WPBakery</option>
                <option value="custom">Custom</option>
              </select></div>
          </div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Go-Live Date</label>
            <input type="date" id="wpGoLive" class="input-field"></div>
          <div class="flex items-center gap-2">
            <input type="checkbox" id="wpDefaultBlocks" class="rounded" checked>
            <label class="text-sm text-gray-700">Add default implementation blocks automatically</label>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_wp_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveWpProject()" class="btn-primary flex-1"><i class="fab fa-wordpress mr-2"></i>Create Project</button>
        </div>
      </div>
    </div>
  `;
}

function renderNewWpBlockModal(projectId) {
  return `
    <div id="new_wp_block_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900">Add Implementation Block</h3>
          <button onclick="closeModal('new_wp_block_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Block Type</label>
            <select id="newBlockType" class="input-field" onchange="prefillBlockName(this.value)">
              <option value="homepage">Homepage</option>
              <option value="about_page">About Page</option>
              <option value="service_page">Service Page</option>
              <option value="contact_page">Contact Page</option>
              <option value="blog_setup">Blog Setup</option>
              <option value="landing_page">Landing Page</option>
              <option value="calculator_tool">Calculator Tool</option>
              <option value="lead_form">Lead Capture Form</option>
              <option value="booking_system">Booking System</option>
              <option value="woocommerce_setup">WooCommerce Setup</option>
              <option value="seo_setup">SEO Foundation Setup</option>
              <option value="speed_optimisation">Speed Optimisation</option>
              <option value="security_hardening">Security Hardening</option>
              <option value="backup_setup">Backup Setup</option>
              <option value="google_analytics">Google Analytics 4 + GSC</option>
              <option value="schema_markup">Advanced Schema Markup</option>
              <option value="custom">Custom</option>
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Block Name</label>
            <input type="text" id="newBlockName" class="input-field"></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea id="newBlockDesc" class="input-field" rows="2"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
              <input type="number" id="newBlockHours" class="input-field" placeholder="4" step="0.5"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
              <input type="number" id="newBlockPrice" class="input-field" placeholder="0"></div>
          </div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_wp_block_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveWpBlock(${projectId})" class="btn-primary flex-1"><i class="fas fa-plus mr-2"></i>Add Block</button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// SOCIAL MEDIA
// ==============================
function renderSocial() {
  if (!state.socialPosts) { loadSocialPosts(); return loading(); }
  const platforms = ['facebook','instagram','linkedin','twitter','google_business'];
  const platformIcons = { facebook: 'fa-facebook', instagram: 'fa-instagram', linkedin: 'fa-linkedin', twitter: 'fa-twitter', google_business: 'fa-google' };

  return `
    <div class="space-y-6">
      <!-- Platform filter tabs -->
      <div class="flex gap-2 flex-wrap">
        <button onclick="filterSocial('')" class="px-4 py-2 rounded-xl text-sm font-medium ${!state.socialFilter ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">All</button>
        ${platforms.map(p => `
          <button onclick="filterSocial('${p}')" class="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${state.socialFilter === p ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
            <i class="fab ${platformIcons[p] || 'fa-share'}"></i>${p.replace(/_/g,' ')}
          </button>
        `).join('')}
      </div>

      <!-- Posts grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${(state.socialPosts||[]).length === 0 ? `
          <div class="col-span-3 card text-center py-12 text-gray-400">
            No social posts yet. <button onclick="openModal('new_social_modal')" class="text-violet-600 hover:underline ml-1">Create one</button>
          </div>` :
          (state.socialPosts||[]).map(post => `
            <div class="card">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <i class="fab ${platformIcons[post.platform] || 'fa-share'} text-violet-500"></i>
                  <span class="text-sm font-medium text-gray-700">${post.platform?.replace(/_/g,' ')}</span>
                  ${statusBadge(post.status)}
                </div>
                <span class="text-xs text-gray-400">${post.scheduled_at ? post.scheduled_at.slice(0,10) : post.created_at?.slice(0,10)}</span>
              </div>
              <p class="text-sm text-gray-700 mb-2 line-clamp-3">${post.caption || '(No caption)'}</p>
              ${post.hashtags ? `<p class="text-xs text-violet-500 mb-2 line-clamp-1">${post.hashtags}</p>` : ''}
              <p class="text-xs text-gray-400">${post.company_name}</p>
              ${post.status === 'published' ? `
                <div class="flex gap-4 mt-2 text-xs text-gray-500 pt-2 border-t">
                  <span><i class="fas fa-heart mr-1"></i>${post.likes || 0}</span>
                  <span><i class="fas fa-comment mr-1"></i>${post.comments || 0}</span>
                  <span><i class="fas fa-share mr-1"></i>${post.shares || 0}</span>
                  ${post.reach ? `<span><i class="fas fa-eye mr-1"></i>${fmt(post.reach)}</span>` : ''}
                </div>` : ''}
            </div>
          `).join('')}
      </div>
      ${renderNewSocialModal()}
    </div>
  `;
}

function renderNewSocialModal() {
  return `
    <div id="new_social_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900">New Social Post</h3>
          <button onclick="closeModal('new_social_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select id="socialClientId" class="input-field">
              <option value="">Select client...</option>
              ${(state.clients||[]).map(cl => `<option value="${cl.id}">${cl.company_name}</option>`).join('')}
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Platform(s)</label>
            <div class="flex gap-2 flex-wrap" id="platformCheckboxes">
              ${['facebook','instagram','linkedin','twitter','google_business'].map(p => `
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" name="socialPlatform" value="${p}" class="rounded">
                  <span class="text-sm">${p.replace(/_/g,' ')}</span>
                </label>
              `).join('')}
            </div></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Post Type</label>
            <select id="socialPostType" class="input-field">
              <option value="organic">Organic Post</option>
              <option value="story">Story</option>
              <option value="reel">Reel</option>
              <option value="carousel">Carousel</option>
              <option value="video">Video</option>
              <option value="testimonial">Testimonial</option>
              <option value="blog_share">Blog Share</option>
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Caption</label>
            <textarea id="socialCaption" class="input-field" rows="4" placeholder="Write your caption here..."></textarea></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Hashtags</label>
            <input type="text" id="socialHashtags" class="input-field" placeholder="#sydney #plumber #homeservices"></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Schedule Date/Time</label>
            <input type="datetime-local" id="socialScheduled" class="input-field"></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Link URL</label>
            <input type="text" id="socialLinkUrl" class="input-field" placeholder="https://..."></div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_social_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveSocialPost()" class="btn-primary flex-1"><i class="fas fa-share-nodes mr-2"></i>Create Post(s)</button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// PRESS RELEASES
// ==============================
function renderPress() {
  if (!state.pressReleases) { loadPressReleases(); return loading(); }
  return `
    <div class="space-y-4">
      ${(state.pressReleases||[]).length === 0 ? `
        <div class="card text-center py-12">
          <i class="fas fa-newspaper text-5xl text-gray-200 mb-4"></i>
          <p class="text-gray-500 mb-2">No press releases yet</p>
          <button onclick="navigate('new_press')" class="btn-primary"><i class="fas fa-plus mr-2"></i>Write Press Release</button>
        </div>` :
        (state.pressReleases||[]).map(pr => `
          <div class="card cursor-pointer hover:shadow-md transition" onclick="navigate('edit_press', {selectedPressRelease: ${JSON.stringify(pr).replace(/"/g,'&quot;')}})">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <h3 class="font-semibold text-gray-900">${pr.headline}</h3>
                  ${statusBadge(pr.status)}
                </div>
                ${pr.subheadline ? `<p class="text-sm text-gray-500">${pr.subheadline}</p>` : ''}
                <p class="text-xs text-gray-400 mt-1">${pr.company_name} · ${pr.distribution_date ? 'Distributing: ' + pr.distribution_date : 'Draft'}</p>
              </div>
              <div class="ml-4 text-right">
                ${pr.published_urls ? '<span class="text-xs text-green-600"><i class="fas fa-check-circle mr-1"></i>Distributed</span>' : ''}
              </div>
            </div>
          </div>
        `).join('')}
    </div>
  `;
}

function renderNewPressRelease() {
  const cl = state.selectedClient;
  return `
    <div class="max-w-4xl space-y-6">
      <button onclick="navigate('press')" class="text-sm text-gray-500 hover:text-violet-600">
        <i class="fas fa-arrow-left mr-1"></i>Back to Press Releases
      </button>
      <div class="card">
        <h2 class="text-lg font-bold text-gray-900 mb-5">Create Press Release</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select id="prClientId" class="input-field">
              <option value="">Select client...</option>
              ${(state.clients||[]).map(c => `<option value="${c.id}" ${cl?.id == c.id ? 'selected' : ''}>${c.company_name}</option>`).join('')}
            </select>
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Topic / Story Angle</label>
            <input type="text" id="prTopic" class="input-field" placeholder="e.g. Company wins industry award, launches new service">
          </div>
          <div class="col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Key Message</label>
            <input type="text" id="prKeyMessage" class="input-field" placeholder="e.g. major expansion into Queensland market">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Quote Person / Title</label>
            <input type="text" id="prQuotePerson" class="input-field" placeholder="CEO, Managing Director...">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Distribution Date</label>
            <input type="date" id="prDistDate" class="input-field">
          </div>
        </div>
        <button onclick="generatePressRelease()" class="btn-primary mt-4 w-full">
          <i class="fas fa-magic mr-2"></i>Generate Press Release Template
        </button>
      </div>

      <div id="prPreview" class="hidden card">
        <h3 class="font-semibold text-gray-900 mb-4">Press Release — Edit & Review</h3>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Headline *</label>
            <input type="text" id="prHeadline" class="input-field"></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Subheadline</label>
            <input type="text" id="prSubheadline" class="input-field"></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Body Text</label>
            <textarea id="prBody" class="input-field" rows="10"></textarea></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Quote</label>
              <textarea id="prQuote" class="input-field" rows="3"></textarea></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Quote Attribution</label>
              <input type="text" id="prQuoteAttrib" class="input-field"></div>
          </div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Boilerplate (About the Company)</label>
            <textarea id="prBoilerplate" class="input-field" rows="4"></textarea></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Contact Information</label>
            <textarea id="prContact" class="input-field" rows="3"></textarea></div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Target Publications</label>
              <textarea id="prPublications" class="input-field" rows="2"></textarea></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">SEO Keywords</label>
              <input type="text" id="prSeoKeywords" class="input-field"></div>
          </div>
        </div>
        <div class="flex gap-3 mt-5 pt-5 border-t">
          <button onclick="savePressRelease('draft')" class="btn-secondary flex-1">Save as Draft</button>
          <button onclick="savePressRelease('review')" class="btn-primary flex-1">
            <i class="fas fa-check mr-2"></i>Save for Review
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// KEYWORDS / RANK TRACKING
// ==============================
function renderKeywords() {
  if (!state.keywordData) { loadKeywords(); return loading(); }
  const kws = state.keywordData;
  return `
    <div class="space-y-4">
      <div class="flex gap-3 flex-wrap">
        <select id="kwCampaignFilter" class="input-field w-48" onchange="filterKeywords()">
          <option value="">All Campaigns</option>
          ${(state.campaigns||[]).map(ca => `<option value="${ca.id}">${ca.name}</option>`).join('')}
        </select>
        <button onclick="trackAllRankings()" class="btn-primary"><i class="fas fa-sync-alt mr-2"></i>Track All Keywords</button>
      </div>
      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th class="px-3 py-2 rounded-l-lg">Keyword</th>
            <th class="px-3 py-2">Client / Campaign</th>
            <th class="px-3 py-2 text-center">Rank</th>
            <th class="px-3 py-2 text-center">Prev</th>
            <th class="px-3 py-2 text-center">Change</th>
            <th class="px-3 py-2">Volume</th>
            <th class="px-3 py-2">KD</th>
            <th class="px-3 py-2 rounded-r-lg">Priority</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${kws.length === 0 ? '<tr><td colspan="8" class="px-3 py-8 text-center text-gray-400">No keywords yet. Add keywords to a campaign to start tracking.</td></tr>' :
              kws.map(kw => `
                <tr class="hover:bg-gray-50">
                  <td class="px-3 py-3">
                    <div class="font-medium text-gray-900">${kw.keyword}</div>
                    ${kw.target_url ? `<div class="text-xs text-gray-400 truncate max-w-xs">${kw.target_url}</div>` : ''}
                  </td>
                  <td class="px-3 py-3"><div class="text-xs text-gray-700">${kw.company_name || ''}</div><div class="text-xs text-gray-400">${kw.campaign_name || ''}</div></td>
                  <td class="px-3 py-3 text-center">${rankBadge(kw.current_rank)}</td>
                  <td class="px-3 py-3 text-center text-gray-400 text-xs">${kw.previous_rank || '–'}</td>
                  <td class="px-3 py-3 text-center">${rankChange(kw.current_rank, kw.previous_rank)}</td>
                  <td class="px-3 py-3 text-xs text-gray-500">${kw.monthly_search_volume ? kw.monthly_search_volume.toLocaleString() : '–'}</td>
                  <td class="px-3 py-3 text-xs ${kw.keyword_difficulty > 70 ? 'text-red-500' : kw.keyword_difficulty > 40 ? 'text-yellow-600' : 'text-green-600'}">${kw.keyword_difficulty || '–'}</td>
                  <td class="px-3 py-3">${statusBadge(kw.priority)}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
      ${renderNewKeywordModal()}
    </div>
  `;
}

function renderNewKeywordModal() {
  return `
    <div id="new_keyword_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900">Add Keywords</h3>
          <button onclick="closeModal('new_keyword_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Campaign</label>
            <select id="newKwCampaign" class="input-field">
              <option value="">Select campaign...</option>
              ${(state.campaigns||[]).map(ca => `<option value="${ca.id}" data-client="${ca.client_id}">${ca.name} (${ca.company_name})</option>`).join('')}
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Keywords (one per line)</label>
            <textarea id="newKwList" class="input-field" rows="6" placeholder="plumber sydney&#10;emergency plumber sydney&#10;blocked drain sydney"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select id="newKwLocation" class="input-field">
                <option value="2036">Australia</option>
                <option value="2840">United States</option>
                <option value="2826">United Kingdom</option>
                <option value="2124">Canada</option>
              </select></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select id="newKwPriority" class="input-field">
                <option value="high">High</option>
                <option value="medium" selected>Medium</option>
                <option value="low">Low</option>
              </select></div>
          </div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Target URL (optional)</label>
            <input type="text" id="newKwUrl" class="input-field" placeholder="https://..."></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Keyword Group (optional)</label>
            <input type="text" id="newKwGroup" class="input-field" placeholder="e.g. Service, Location, Brand"></div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_keyword_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveKeywords()" class="btn-primary flex-1"><i class="fas fa-plus mr-2"></i>Add Keywords</button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// LLM / AI VISIBILITY
// ==============================
function renderLLM() {
  if (!state.llmData) { loadLLM(); return loading(); }
  const { prompts = [], recent_mentions = [] } = state.llmData;
  return `
    <div class="space-y-6">
      <div class="card">
        <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-robot text-purple-500 mr-2"></i>AI/LLM Visibility Prompts</h3>
        ${prompts.length === 0 ? '<p class="text-gray-400 text-sm">No prompts configured. Add prompts to track AI visibility.</p>' :
          `<div class="space-y-3">
            ${prompts.map(p => `
              <div class="p-4 border border-gray-100 rounded-xl hover:bg-gray-50">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <p class="text-sm font-medium text-gray-800">"${p.prompt_text}"</p>
                    <p class="text-xs text-gray-400 mt-1">Target: ${p.target_brand || 'N/A'} · Model: ${p.llm_model} · Campaign: ${p.campaign_name || p.campaign_id}</p>
                  </div>
                  <div class="ml-4 flex flex-col items-end gap-1">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${p.latest_mentioned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                      ${p.latest_mentioned ? '✓ Mentioned' : '✗ Not Mentioned'}
                    </span>
                    ${p.latest_sentiment ? statusBadge(p.latest_sentiment) : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>`}
      </div>

      ${recent_mentions.length > 0 ? `
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-history text-violet-500 mr-2"></i>Recent LLM Mention History</h3>
          <div class="space-y-3">
            ${recent_mentions.map(m => `
              <div class="p-3 border border-gray-100 rounded-xl">
                <div class="flex items-start justify-between mb-2">
                  <p class="text-xs text-gray-500 truncate">"${m.prompt_text}"</p>
                  <span class="ml-2 text-xs ${m.is_mentioned ? 'text-green-600' : 'text-gray-400'}">${m.is_mentioned ? '✓ Mentioned' : '✗ Not'}</span>
                </div>
                ${m.response_snippet ? `<p class="text-xs text-gray-600 italic">"${m.response_snippet}"</p>` : ''}
                <p class="text-xs text-gray-400 mt-1">${m.company_name || ''} · ${ago(m.tracked_at)}</p>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

      ${renderNewLlmModal()}
    </div>
  `;
}

function renderNewLlmModal() {
  return `
    <div id="new_llm_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900">Add LLM Visibility Prompt</h3>
          <button onclick="closeModal('new_llm_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Campaign</label>
            <select id="newLlmCampaign" class="input-field">
              <option value="">Select campaign...</option>
              ${(state.campaigns||[]).map(ca => `<option value="${ca.id}" data-client="${ca.client_id}">${ca.name}</option>`).join('')}
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Prompt / Question to Track</label>
            <textarea id="newLlmPrompt" class="input-field" rows="3" placeholder="Who are the best plumbers in Sydney for emergency plumbing?"></textarea></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Target Brand</label>
              <input type="text" id="newLlmBrand" class="input-field" placeholder="Company name to track"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">LLM Model</label>
              <select id="newLlmModel" class="input-field">
                <option value="chatgpt">ChatGPT</option>
                <option value="gemini">Google Gemini</option>
                <option value="claude">Claude (Anthropic)</option>
                <option value="perplexity">Perplexity</option>
                <option value="copilot">Microsoft Copilot</option>
              </select></div>
          </div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select id="newLlmCategory" class="input-field">
              <option value="brand_mention">Brand Mention</option>
              <option value="service_query">Service Query</option>
              <option value="local_query">Local Query</option>
              <option value="competitor_comparison">Competitor Comparison</option>
              <option value="industry_query">Industry Query</option>
            </select></div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="closeModal('new_llm_modal')" class="btn-secondary flex-1">Cancel</button>
          <button onclick="saveLlmPrompt()" class="btn-primary flex-1"><i class="fas fa-plus mr-2"></i>Add Prompt</button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// CONTENT
// ==============================
function renderContent() {
  if (!state.contentItems) { loadContent(); return loading(); }
  const items = state.contentItems || [];
  const contentTypeIcons = {
    blog_post: 'fa-blog', landing_page: 'fa-file-alt', guide: 'fa-book',
    whitepaper: 'fa-file-pdf', press_release: 'fa-newspaper',
    social_post: 'fa-share-nodes', infographic: 'fa-image',
    video_script: 'fa-video', faq_page: 'fa-question-circle',
    meta_optimization: 'fa-tags', guestpost: 'fa-external-link-alt'
  };

  return `
    <div class="space-y-4">
      <div class="flex gap-3 flex-wrap">
        <select id="contentStatusFilter" class="input-field w-40" onchange="filterContent()">
          <option value="">All Statuses</option>
          <option value="planned">Planned</option>
          <option value="briefed">Briefed</option>
          <option value="in_progress">In Progress</option>
          <option value="review">In Review</option>
          <option value="published">Published</option>
        </select>
        <select id="contentTypeFilter" class="input-field w-44" onchange="filterContent()">
          <option value="">All Types</option>
          <option value="blog_post">Blog Post</option>
          <option value="landing_page">Landing Page</option>
          <option value="guide">Guide</option>
          <option value="whitepaper">White Paper</option>
          <option value="press_release">Press Release</option>
          <option value="social_post">Social Post</option>
          <option value="infographic">Infographic</option>
          <option value="video_script">Video Script</option>
        </select>
      </div>
      <div class="space-y-2" id="contentList">
        ${items.length === 0 ? `<div class="card text-center py-12 text-gray-400">No content items yet.</div>` :
          items.map(ci => `
            <div class="card hover:shadow-md transition">
              <div class="flex items-start justify-between">
                <div class="flex gap-3 items-start flex-1">
                  <div class="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i class="fas ${contentTypeIcons[ci.content_type] || 'fa-file'} text-green-600 text-xs"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-medium text-gray-900">${ci.title}</h3>
                      ${statusBadge(ci.status)}
                    </div>
                    <p class="text-xs text-gray-500 mt-0.5">${ci.company_name} · ${ci.campaign_name} · ${ci.content_type?.replace(/_/g,' ')}</p>
                    ${ci.target_keyword ? `<p class="text-xs text-violet-500 mt-0.5"><i class="fas fa-key mr-1"></i>${ci.target_keyword}</p>` : ''}
                  </div>
                </div>
                <div class="flex items-center gap-3 ml-3 flex-shrink-0">
                  <div class="text-right">
                    <p class="text-xs text-gray-500">${ci.word_count_target ? ci.word_count_target + ' words' : ''}</p>
                    <p class="text-xs text-gray-400">Due: ${ci.due_date || 'TBD'}</p>
                    ${ci.assigned_to ? `<p class="text-xs text-gray-400">${ci.assigned_to}</p>` : ''}
                  </div>
                  <div class="flex gap-1">
                    <button onclick="openBriefModal(${JSON.stringify(ci).replace(/"/g,'&quot;')})" class="text-xs btn-secondary px-2 py-1"><i class="fas fa-align-left mr-1"></i>Brief</button>
                    <select class="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600" onchange="updateContentStatus(${ci.id}, this.value)">
                      ${['planned','briefed','in_progress','review','approved','published','cancelled'].map(s => `<option value="${s}" ${ci.status === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`).join('')}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
      </div>
      ${renderNewContentModal()}
      ${renderBriefModal()}
    </div>
  `;
}

function renderNewContentModal() {
  return `
    <div id="new_content_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900">New Content Item</h3>
          <button onclick="closeModal('new_content_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Campaign</label>
            <select id="ncoClient" class="input-field" onchange="loadCampaignsForContent(this.value)">
              <option value="">Select client...</option>
              ${(state.clients||[]).map(cl => `<option value="${cl.id}">${cl.company_name}</option>`).join('')}
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Campaign</label>
            <select id="ncoCampaign" class="input-field">
              <option value="">Select campaign first...</option>
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
            <select id="ncoType" class="input-field">
              <option value="blog_post">Blog Post</option>
              <option value="landing_page">SEO Landing Page</option>
              <option value="guide">Guide / How-To</option>
              <option value="whitepaper">White Paper</option>
              <option value="press_release">Press Release</option>
              <option value="social_post">Social Post</option>
              <option value="infographic">Infographic</option>
              <option value="video_script">Video Script</option>
              <option value="faq_page">FAQ Page</option>
              <option value="meta_optimization">Meta Optimisation</option>
              <option value="guestpost">Guest Post</option>
            </select></div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" id="ncoTitle" class="input-field" placeholder="Content title"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Target Keyword</label>
              <input type="text" id="ncoKeyword" class="input-field" placeholder="primary keyword"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Word Count</label>
              <input type="number" id="ncoWords" class="input-field" value="1500"></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" id="ncoDue" class="input-field"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
              <input type="text" id="ncoAssigned" class="input-field" placeholder="Writer name"></div>
          </div>
          <div><label class="block text-sm font-medium text-gray-700 mb-1">Target URL</label>
            <input type="text" id="ncoUrl" class="input-field" placeholder="https://..."></div>
        </div>
        <div class="flex gap-3 mt-5">
          <button onclick="autoGenerateBrief()" class="btn-secondary flex-1"><i class="fas fa-magic mr-1"></i>Auto-Brief</button>
          <button onclick="saveNewContent()" class="btn-primary flex-1"><i class="fas fa-plus mr-2"></i>Add Content</button>
        </div>
      </div>
    </div>
  `;
}

function renderBriefModal() {
  return `
    <div id="content_brief_modal" class="modal-overlay hidden">
      <div class="modal-box p-6">
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-gray-900" id="briefModalTitle">Content Brief</h3>
          <button onclick="closeModal('content_brief_modal')" class="text-gray-400"><i class="fas fa-times"></i></button>
        </div>
        <div id="briefContent" class="text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto bg-gray-50 p-4 rounded-xl"></div>
        <div class="flex gap-3 mt-5">
          <button onclick="copyBrief()" class="btn-secondary flex-1"><i class="fas fa-copy mr-1"></i>Copy</button>
          <button onclick="closeModal('content_brief_modal')" class="btn-primary flex-1">Close</button>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// REPORTS
// ==============================
function renderReports() {
  if (!state.reports) { loadReports(); return loading(); }
  return `
    <div class="space-y-6">

      <!-- Authority Reporting Overview -->
      <div class="card bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <div class="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div class="text-slate-300 text-xs font-semibold uppercase tracking-widest mb-1">Authority Velocity Reporting</div>
            <h2 class="text-xl font-bold">Client Performance Reports</h2>
            <p class="text-slate-300 text-sm mt-1">Generate authority velocity snapshots with AI visibility indicators and phase-based progress reporting.</p>
          </div>
          <button onclick="navigate('campaign_detail')" class="btn-secondary text-sm bg-white/10 hover:bg-white/20 border-0 text-white">
            <i class="fas fa-chart-line mr-2"></i>Generate from Campaign
          </button>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/20">
          ${[
            { label: 'Total Reports', val: (state.reports||[]).length, icon: 'fa-file-chart-line' },
            { label: 'Sent to Clients', val: (state.reports||[]).filter(r => r.status === 'sent' || r.status === 'viewed').length, icon: 'fa-paper-plane' },
            { label: 'Viewed', val: (state.reports||[]).filter(r => r.status === 'viewed').length, icon: 'fa-eye' },
            { label: 'Draft', val: (state.reports||[]).filter(r => r.status === 'draft').length, icon: 'fa-file-pen' },
          ].map(s => `
            <div class="bg-white/10 rounded-xl p-3">
              <div class="text-2xl font-bold text-white">${s.val}</div>
              <div class="text-xs text-slate-300 mt-0.5"><i class="fas ${s.icon} mr-1"></i>${s.label}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Report Format Guide -->
      <div class="card border-l-4 border-violet-500">
        <h3 class="font-semibold text-gray-900 mb-3"><i class="fas fa-info-circle text-blue-500 mr-2"></i>Authority Report Format</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          ${[
            { icon: 'fa-bolt', title: 'Authority Velocity Snapshot', desc: 'Overall authority momentum – keyword movement, domain authority trajectory, media placements completed this period.' },
            { icon: 'fa-newspaper', title: 'Media & Authority Layer Update', desc: 'Summary of all authority placements, media injections, and amplification frameworks deployed.' },
            { icon: 'fa-robot', title: 'AI Visibility Indicators', desc: 'Brand mention rates in ChatGPT, Gemini, Perplexity, and Google AI Overviews vs. competitors.' },
            { icon: 'fa-chess', title: 'Competitive Authority Movement', desc: 'Side-by-side authority gap analysis showing your position vs. top competitors.' },
          ].map(s => `
            <div class="flex gap-3">
              <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <i class="fas ${s.icon} text-violet-600 text-xs"></i>
              </div>
              <div>
                <div class="font-medium text-gray-800 text-xs mb-0.5">${s.title}</div>
                <div class="text-xs text-gray-500">${s.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Reports List -->
      <div class="space-y-3">
        ${(state.reports||[]).length === 0 ? `
          <div class="card text-center py-12 text-gray-400">
            <i class="fas fa-chart-line text-4xl mb-4 block"></i>
            <p class="text-lg font-medium mb-2">No reports yet</p>
            <p class="text-sm">Generate a report from a campaign's detail page.</p>
          </div>
        ` :
          (state.reports||[]).map(r => `
            <div class="card">
              <div class="flex items-start justify-between flex-wrap gap-4">
                <div class="flex gap-4">
                  <div class="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-chart-line text-violet-600"></i>
                  </div>
                  <div>
                    <h3 class="font-semibold text-gray-900">${r.company_name} — ${r.report_period}</h3>
                    <p class="text-sm text-gray-500">${r.campaign_name} · ${r.report_type} report</p>
                    <div class="flex gap-4 mt-2 text-xs flex-wrap">
                      <span class="text-green-600"><i class="fas fa-arrow-up mr-1"></i>${r.keywords_improved} keywords improved</span>
                      <span class="text-violet-600"><i class="fas fa-star mr-1"></i>${r.top10_keywords} in top 10</span>
                      <span class="text-purple-600"><i class="fas fa-trophy mr-1"></i>${r.top3_keywords || 0} in top 3</span>
                      <span class="text-gray-500"><i class="fas fa-pen-nib mr-1"></i>${r.content_published} published</span>
                    </div>
                    ${r.viewed_at ? `<p class="text-xs text-green-600 mt-1"><i class="fas fa-eye mr-1"></i>Viewed ${ago(r.viewed_at)}</p>` : ''}
                  </div>
                </div>
                <div class="flex gap-2 items-center">
                  ${statusBadge(r.status)}
                  ${r.report_token ? `
                    <a href="/reports/view/${r.report_token}" target="_blank" class="btn-secondary text-xs"><i class="fas fa-eye mr-1"></i>View</a>
                    ${r.status === 'draft' || r.status === 'ready' ? `<button onclick="sendReport(${r.id})" class="btn-primary text-xs"><i class="fas fa-paper-plane mr-1"></i>Send to Client</button>` : ''}
                  ` : ''}
                </div>
              </div>
              ${r.summary ? `<p class="text-sm text-gray-500 mt-3 pt-3 border-t line-clamp-2">${r.summary}</p>` : ''}
            </div>
          `).join('')}
      </div>
    </div>
  `;
}

// ==============================
// DATAFORSEO TOOLS
// ==============================
function renderDataForSEO() {
  return `
    <div class="space-y-6">
      <div class="flex items-center gap-3 p-4 rounded-xl ${state.dataforseoStatus?.connected ? 'bg-green-50 border border-green-100' : 'bg-yellow-50 border border-yellow-100'}">
        <div class="w-10 h-10 rounded-full ${state.dataforseoStatus?.connected ? 'bg-green-100' : 'bg-yellow-100'} flex items-center justify-center">
          <i class="fas fa-database ${state.dataforseoStatus?.connected ? 'text-green-600' : 'text-yellow-600'}"></i>
        </div>
        <div>
          <p class="font-semibold ${state.dataforseoStatus?.connected ? 'text-green-800' : 'text-yellow-800'}">
            ${state.dataforseoStatus?.connected ? 'Live Mode' : 'Demo Mode'}
          </p>
          <p class="text-xs text-gray-500">
            ${state.dataforseoStatus?.email || 'Not configured'} ·
            Balance: ${state.dataforseoStatus?.balance ? '$' + state.dataforseoStatus.balance : 'N/A'}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Keyword Research -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-search text-blue-500 mr-2"></i>Keyword Research</h3>
          <div class="space-y-3">
            <input type="text" id="kwResearchInput" class="input-field" placeholder="Enter seed keyword...">
            <div class="flex gap-2">
              <select id="kwResearchLocation" class="input-field flex-1">
                <option value="2036">Australia</option>
                <option value="2840">United States</option>
                <option value="2826">United Kingdom</option>
              </select>
              <button onclick="runKeywordResearch()" class="btn-primary flex-shrink-0">
                <i class="fas fa-search mr-2"></i>Research
              </button>
            </div>
          </div>
          <div id="kwResearchResults" class="hidden mt-4 max-h-80 overflow-y-auto"></div>
        </div>

        <!-- SERP Analysis -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-chart-bar text-green-500 mr-2"></i>SERP Analysis</h3>
          <div class="space-y-3">
            <input type="text" id="serpAnalysisInput" class="input-field" placeholder="Enter keyword to analyze...">
            <div class="flex gap-2">
              <select id="serpLocation" class="input-field flex-1">
                <option value="2036">Australia</option>
                <option value="2840">United States</option>
              </select>
              <button onclick="runSerpAnalysis()" class="btn-primary flex-shrink-0">
                <i class="fas fa-chart-bar mr-2"></i>Analyze
              </button>
            </div>
          </div>
          <div id="serpResults" class="hidden mt-4 max-h-80 overflow-y-auto"></div>
        </div>

        <!-- Competitor Analysis -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-crosshairs text-red-500 mr-2"></i>Competitor Analysis</h3>
          <div class="space-y-3">
            <input type="text" id="compAnalysisInput" class="input-field" placeholder="Enter domain (e.g. competitor.com.au)">
            <button onclick="runCompetitorAnalysis()" class="btn-primary w-full">
              <i class="fas fa-crosshairs mr-2"></i>Analyze Competitor
            </button>
          </div>
          <div id="compResults" class="hidden mt-4"></div>
        </div>

        <!-- Backlink Checker -->
        <div class="card">
          <h3 class="font-semibold text-gray-900 mb-4"><i class="fas fa-link text-purple-500 mr-2"></i>Backlink Checker</h3>
          <div class="space-y-3">
            <input type="text" id="backlinkInput" class="input-field" placeholder="Enter domain to check...">
            <button onclick="runBacklinkCheck()" class="btn-primary w-full">
              <i class="fas fa-search mr-2"></i>Check Backlinks
            </button>
          </div>
          <div id="backlinkResults" class="hidden mt-4"></div>
        </div>
      </div>
    </div>
  `;
}

// ==============================
// DATA LOADING FUNCTIONS
// ==============================
async function loadDashboard() {
  try {
    const [dashRes, dfsRes] = await Promise.all([
      API.get('/dashboard/overview'),
      API.get('/dataforseo/status').catch(() => ({ data: { connected: false } }))
    ]);
    state.dashboardData = dashRes.data;
    state.dataforseoStatus = dfsRes.data;
    render();
  } catch (e) { console.error('Dashboard load failed:', e); }
}

async function loadClients() {
  try {
    const showArchived = state.showArchivedClients || false;
    const url = showArchived ? '/clients?archived_only=1' : '/clients';
    const res = await API.get(url);
    state.clients = res.data;
    state._clientsLoaded = true;
    // Also fetch the archived count for the toggle badge (always)
    if (!showArchived) {
      try {
        const arRes = await API.get('/clients?archived_only=1');
        state.archivedClientCount = arRes.data.length;
      } catch (_) {}
    } else {
      state.archivedClientCount = res.data.length;
    }
    render();
  } catch (e) { console.error('Clients load failed:', e); }
}

async function toggleArchivedClients() {
  state.showArchivedClients = !state.showArchivedClients;
  state.clients = []; state._clientsLoaded = false;
  await loadClients();
}

async function loadClientDetail(id) {
  try {
    const res = await API.get('/clients/' + id);
    state.selectedClient = { ...res.data };
    render();
  } catch (e) { toast('Failed to load client details', 'error'); }
}

async function loadCampaigns() {
  try {
    const res = await API.get('/campaigns');
    state.campaigns = res.data;
    render();
  } catch (e) { console.error('Campaigns load failed:', e); }
}

async function loadCampaignDetail(id) {
  try {
    const res = await API.get('/campaigns/' + id);
    state.selectedCampaign = { ...res.data, _loaded: true };
    // Also load the campaign plan if not already loaded
    if (!state.campaignPlanData || state.campaignPlanData.plan?.campaign_id !== id) {
      await loadCampaignPlanData(id);
    }
    render();
  } catch (e) { toast('Failed to load campaign', 'error'); }
}

async function loadCampaignPlanData(campaignId) {
  try {
    const res = await API.get(`/campaign-plans/campaign/${campaignId}`);
    state.campaignPlanData = res.data;
  } catch (e) { state.campaignPlanData = { plan: null, tasks: [], phases: [] }; }
}

async function loadCampaignPlans() {
  try {
    const res = await API.get('/campaign-plans');
    state.campaignPlansList = res.data;
    render();
  } catch (e) { console.error('Campaign plans load failed:', e); }
}

async function loadProposals() {
  try {
    const res = await API.get('/proposals');
    state.proposals = res.data;
    render();
  } catch (e) { console.error('Proposals load failed:', e); }
}

async function loadBilling() {
  try {
    const res = await API.get('/payments/billing/overview');
    state.billingData = res.data;
    render();
  } catch (e) { console.error('Billing load failed:', e); }
}

async function loadKeywords() {
  try {
    const res = await API.get('/keywords');
    state.keywordData = res.data;
    render();
  } catch (e) { console.error('Keywords load failed:', e); }
}

async function loadLLM() {
  try {
    const res = await API.get('/llm/prompts');
    state.llmData = res.data;
    render();
  } catch (e) { console.error('LLM load failed:', e); }
}

async function loadContent() {
  try {
    const res = await API.get('/content');
    state.contentItems = res.data;
    render();
  } catch (e) { console.error('Content load failed:', e); }
}

async function loadReports() {
  try {
    const res = await API.get('/reports');
    state.reports = res.data;
    render();
  } catch (e) { console.error('Reports load failed:', e); }
}

async function loadWpProjects() {
  try {
    const res = await API.get('/wordpress');
    state.wpProjects = res.data;
    render();
  } catch (e) { console.error('WP projects load failed:', e); }
}

async function loadWpProjectDetail(id) {
  try {
    const res = await API.get('/wordpress/' + id);
    state.selectedWpProject = { ...res.data, _loaded: true };
    render();
  } catch (e) { toast('Failed to load project', 'error'); }
}

async function loadSocialPosts() {
  try {
    const params = state.socialFilter ? `?platform=${state.socialFilter}` : '';
    const res = await API.get('/social' + params);
    state.socialPosts = res.data;
    render();
  } catch (e) { console.error('Social load failed:', e); }
}

async function loadPressReleases() {
  try {
    const res = await API.get('/press-releases');
    state.pressReleases = res.data;
    render();
  } catch (e) { console.error('Press releases load failed:', e); }
}

// ==============================
// ACTION FUNCTIONS
// ==============================

// Client actions
function getClientFormData() {
  const f = id => document.getElementById(id)?.value || '';
  return {
    company_name: f('cl_company_name'), website: f('cl_website'), industry: f('cl_industry'),
    abn: f('cl_abn'), status: f('cl_status'),
    address: f('cl_address'), city: f('cl_city'),
    state: f('cl_state_input') || f('cl_state') || '',
    postcode: f('cl_postcode'), country: f('cl_country'), location: f('cl_location'),
    contact_name: f('cl_contact_name'), contact_email: f('cl_contact_email'),
    contact_phone: f('cl_contact_phone'),
    secondary_contact_name: f('cl_secondary_contact_name'),
    secondary_contact_email: f('cl_secondary_contact_email'),
    monthly_budget: parseFloat(f('cl_monthly_budget')) || 0,
    account_manager: f('cl_account_manager'),
    contract_start: f('cl_contract_start') || null, contract_end: f('cl_contract_end') || null,
    referral_source: f('cl_referral_source'), timezone: f('cl_timezone'),
    cms_platform: f('cl_cms_platform'), hosting_provider: f('cl_hosting_provider'),
    ga4_property_id: f('cl_ga4_property_id'), gsc_property: f('cl_gsc_property'),
    google_business_id: f('cl_google_business_id'),
    linkedin_url: f('cl_linkedin_url'), facebook_url: f('cl_facebook_url'),
    instagram_handle: f('cl_instagram_handle'), notes: f('cl_notes'),
  };
}

async function saveNewClient() {
  const data = getClientFormData();
  if (!data.company_name || !data.contact_email || !data.website) {
    toast('Company name, email and website are required', 'warning'); return;
  }
  try {
    await API.post('/clients', data);
    state.clients = []; state._clientsLoaded = false;
    toast('Client added!');
    navigate('clients');
  } catch (e) {
    const msg = e?.response?.data?.error || 'Failed to save client';
    toast(msg, 'error');
  }
}

async function saveEditClient(id) {
  const data = getClientFormData();
  if (!data.company_name || !data.contact_email || !data.website) {
    toast('Company name, email and website are required', 'warning'); return;
  }
  // Track previous status to detect paused/churned transition
  const prevStatus = state.editingClient?.status;
  const newStatus = data.status;

  try {
    await API.put('/clients/' + id, data);

    // If contract_start is set, offer to sync campaign start_date too
    // (always offer when contract_start has a value, regardless of whether it changed)
    if (data.contract_start) {
      const prevDate = state.editingClient?.contract_start;
      const dateChanged = data.contract_start !== prevDate;
      const syncMsg = dateChanged
        ? `Contract start date updated to ${data.contract_start}.\n\nSync this as the launch date for all active campaigns and campaign plans for this client?`
        : `Contract start date is set to ${data.contract_start}.\n\nSync this as the launch date for all active campaigns and campaign plans for this client?\n\n(This will update the "Started" date shown on all campaigns.)`;
      const syncCampaigns = confirm(syncMsg);
      if (syncCampaigns) {
        try {
          const syncRes = await API.patch(`/clients/${id}/sync-campaign-dates`, { start_date: data.contract_start });
          const updated = syncRes?.data;
          const detail = updated ? ` (${updated.campaigns_updated || 0} campaign(s), ${updated.plans_updated || 0} plan(s) updated)` : '';
          toast(`Launch dates synced${detail}`);
        } catch (e) { toast('Client updated, but campaign sync failed', 'warning'); }
      }
    }

    state.clients = []; state._clientsLoaded = false;
    state.editingClient = null;
    toast('Client updated!');

    // If status changed TO paused or churned, offer to archive
    if (['paused','churned'].includes(newStatus) && prevStatus !== newStatus) {
      // Small delay so toast is visible first
      setTimeout(() => {
        openArchiveModal(id, newStatus, data.company_name);
      }, 400);
      navigate('clients');
      return;
    }

    navigate('clients');
  } catch (e) {
    const msg = e?.response?.data?.error || 'Failed to update client';
    toast(msg, 'error');
  }
}

async function deleteClient(id) {
  if (!confirm('Delete this client and all their data? This cannot be undone.')) return;
  try {
    await API.delete('/clients/' + id);
    state.clients = []; state._clientsLoaded = false;
    state.editingClient = null;
    toast('Client deleted');
    navigate('clients');
  } catch (e) { toast('Failed to delete client', 'error'); }
}

// ══════════════════════════════════════════════════════════════
// ARCHIVE SYSTEM
// ══════════════════════════════════════════════════════════════

function openArchiveModal(clientId, currentStatus, clientName) {
  // Inject modal into DOM if not present
  let modal = document.getElementById('archive_client_modal');
  if (!modal) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="archive_client_modal" class="modal-overlay hidden">
        <div class="modal-box p-6 max-w-lg">
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <i class="fas fa-archive text-slate-500"></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-gray-900">Archive Client</h3>
                <p class="text-xs text-gray-500" id="archive_client_subtitle"></p>
              </div>
            </div>
            <button onclick="closeModal('archive_client_modal')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>

          <!-- What gets archived info box -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 text-sm text-slate-700 space-y-2">
            <p class="font-semibold text-slate-800 mb-2"><i class="fas fa-shield-alt mr-2 text-slate-500"></i>What gets archived:</p>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="flex items-center gap-2"><i class="fas fa-check text-green-500"></i>All campaign data & tasks</div>
              <div class="flex items-center gap-2"><i class="fas fa-check text-green-500"></i>Keyword rankings history</div>
              <div class="flex items-center gap-2"><i class="fas fa-check text-green-500"></i>Reports & proposals</div>
              <div class="flex items-center gap-2"><i class="fas fa-check text-green-500"></i>Billing & payment history</div>
              <div class="flex items-center gap-2"><i class="fas fa-check text-green-500"></i>Campaign plans & tasks</div>
              <div class="flex items-center gap-2"><i class="fas fa-check text-green-500"></i>Content & media items</div>
            </div>
            <p class="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
              <i class="fas fa-info-circle mr-1"></i>
              Everything is preserved and can be fully restored at any time.
            </p>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Archive Reason</label>
              <div class="grid grid-cols-3 gap-2" id="archive_reason_btns">
                <button onclick="selectArchiveReason('paused')" class="archive-reason-btn px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-medium hover:border-slate-400 transition text-center" data-reason="paused">
                  <i class="fas fa-pause-circle block text-lg mb-1 text-gray-400"></i>Paused
                </button>
                <button onclick="selectArchiveReason('churned')" class="archive-reason-btn px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-medium hover:border-red-400 transition text-center" data-reason="churned">
                  <i class="fas fa-times-circle block text-lg mb-1 text-red-400"></i>Churned
                </button>
                <button onclick="selectArchiveReason('other')" class="archive-reason-btn px-3 py-2 rounded-xl border-2 border-gray-200 text-sm font-medium hover:border-slate-400 transition text-center" data-reason="other">
                  <i class="fas fa-ellipsis-circle block text-lg mb-1 text-gray-400"></i>Other
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Note <span class="text-gray-400 font-normal">(optional)</span></label>
              <textarea id="archive_note" rows="2" class="input-field resize-none" placeholder="e.g. Client requested a break, will re-engage in Q3..."></textarea>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button onclick="closeModal('archive_client_modal')" class="btn-secondary flex-1">Cancel</button>
            <button onclick="confirmArchiveClient()" id="archive_confirm_btn"
              class="flex-1 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-semibold text-sm transition disabled:opacity-50">
              <i class="fas fa-archive mr-2"></i>Archive Client
            </button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
    modal = document.getElementById('archive_client_modal');
  }

  // Pre-select reason based on current status
  modal.setAttribute('data-client-id', clientId);
  document.getElementById('archive_client_subtitle').textContent = clientName;
  document.getElementById('archive_note').value = '';

  // Auto-select reason if paused/churned
  const autoReason = ['paused','churned'].includes(currentStatus) ? currentStatus : 'other';
  selectArchiveReason(autoReason);
  openModal('archive_client_modal');
}

function selectArchiveReason(reason) {
  document.querySelectorAll('.archive-reason-btn').forEach(btn => {
    const isSelected = btn.getAttribute('data-reason') === reason;
    const colors = { paused: 'border-slate-500 bg-slate-50', churned: 'border-red-500 bg-red-50', other: 'border-slate-500 bg-slate-50' };
    btn.className = `archive-reason-btn px-3 py-2 rounded-xl border-2 text-sm font-medium transition text-center ${isSelected ? colors[reason] : 'border-gray-200 hover:border-slate-400'}`;
  });
  document.getElementById('archive_client_modal').setAttribute('data-reason', reason);
}

async function confirmArchiveClient() {
  const modal = document.getElementById('archive_client_modal');
  const clientId = modal.getAttribute('data-client-id');
  const reason = modal.getAttribute('data-reason') || 'other';
  const note = document.getElementById('archive_note').value.trim();
  const performedBy = state.currentUser?.full_name || state.currentUser?.email || 'team';

  const btn = document.getElementById('archive_confirm_btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Archiving...';

  try {
    const res = await API.post(`/clients/${clientId}/archive`, { reason, note, performed_by: performedBy });
    closeModal('archive_client_modal');
    toast(`Client archived. ${res.data.campaigns_archived} campaign(s) also archived. Restore anytime.`, 'success');
    // Reset client state and reload
    state.clients = []; state._clientsLoaded = false;
    state.selectedClient = null;
    state.showArchivedClients = false;
    await loadClients();
    navigate('clients');
  } catch (e) {
    toast(e?.response?.data?.error || 'Failed to archive client', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-archive mr-2"></i>Archive Client';
  }
}

async function restoreClient(clientId) {
  const performedBy = state.currentUser?.full_name || state.currentUser?.email || 'team';
  if (!confirm('Restore this client and all their campaigns from archive?')) return;
  try {
    const res = await API.post(`/clients/${clientId}/restore`, { restore_campaigns: true, performed_by: performedBy });
    toast(`Client restored! ${res.data.campaigns_restored} campaign(s) re-activated.`);
    state.clients = []; state._clientsLoaded = false;
    state.selectedClient = null;
    await loadClients();
    navigate('clients');
  } catch (e) { toast(e?.response?.data?.error || 'Failed to restore client', 'error'); }
}

async function loadArchiveLog(clientId) {
  try {
    const res = await API.get(`/clients/${clientId}/archive-log`);
    const log = res.data;
    if (!log.length) { toast('No archive history for this client', 'warning'); return; }

    let html = `<div id="archive_log_modal" class="modal-overlay">
      <div class="modal-box p-6 max-w-lg">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-gray-900"><i class="fas fa-history mr-2 text-slate-500"></i>Archive History</h3>
          <button onclick="document.getElementById('archive_log_modal').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-3">
          ${log.map(entry => `
            <div class="flex items-start gap-3 p-3 rounded-xl ${entry.action === 'archived' ? 'bg-slate-50 border border-slate-200' : 'bg-green-50 border border-green-200'}">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${entry.action === 'archived' ? 'bg-slate-200' : 'bg-green-200'}">
                <i class="fas ${entry.action === 'archived' ? 'fa-archive text-slate-600' : 'fa-undo text-green-600'} text-xs"></i>
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-sm capitalize text-gray-900">${entry.action}</span>
                  ${entry.reason ? `<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">${entry.reason}</span>` : ''}
                </div>
                ${entry.note ? `<p class="text-xs text-gray-500 mt-0.5 italic">"${entry.note}"</p>` : ''}
                <div class="flex gap-3 text-xs text-gray-400 mt-1">
                  <span><i class="fas fa-user mr-1"></i>${entry.performed_by || 'System'}</span>
                  <span><i class="fas fa-clock mr-1"></i>${entry.performed_at?.slice(0,16).replace('T',' ')}</span>
                  ${entry.campaigns_affected ? `<span><i class="fas fa-rocket mr-1"></i>${entry.campaigns_affected} campaigns</span>` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <button onclick="document.getElementById('archive_log_modal').remove()" class="btn-secondary w-full mt-4">Close</button>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) { toast('Failed to load archive history', 'error'); }
}

// Campaign actions
async function saveNewCampaign() {
  const clientId = document.getElementById('newCampaignClient')?.value;
  const name = document.getElementById('newCampaignName')?.value;
  const type = document.getElementById('newCampaignType')?.value;
  const investment = document.getElementById('newCampaignInvestment')?.value;
  const startDate = document.getElementById('newCampaignStart')?.value;

  if (!clientId || !name) { toast('Please fill in all required fields', 'warning'); return; }
  try {
    await API.post('/campaigns', { client_id: clientId, name, campaign_type: type, monthly_investment: parseFloat(investment) || 0, start_date: startDate });
    closeModal('new_campaign_modal');
    state.campaigns = [];
    toast('Campaign created!');
    navigate('campaigns');
  } catch (e) { toast('Failed to create campaign', 'error'); }
}

// Proposal actions
const TIER_PRICES = { basic: 1497, core: 2497, ultimate: 3997, xtreme: 5997 };
function selectTier(tierKey, price) {
  // Update visual selection
  ['basic','core','ultimate','xtreme'].forEach(k => {
    const card = document.getElementById(`tierCard_${k}`);
    if (!card) return;
    card.className = card.className.replace(/border-(blue|purple|orange|green)-500 bg-(blue|purple|orange|green)-50/g, 'border-gray-200');
  });
  const colors = { basic: 'blue', core: 'purple', ultimate: 'orange', xtreme: 'green' };
  const card = document.getElementById(`tierCard_${tierKey}`);
  if (card) {
    const col = colors[tierKey];
    card.className = `border-2 border-${col}-500 bg-${col}-50 rounded-xl p-4 transition-all`;
  }
  // Set price
  const priceEl = document.getElementById('pInvestment');
  if (priceEl) priceEl.value = price;
  // Set radio
  const radio = document.querySelector(`input[name="authorityTier"][value="${tierKey}"]`);
  if (radio) radio.checked = true;
  // Store selected tier
  state._selectedTier = tierKey;
}

async function generateProposal() {
  const clientId = document.getElementById('pClientId')?.value;
  if (!clientId) { toast('Please select a client first', 'warning'); return; }
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
  btn.disabled = true;
  try {
    const res = await API.post('/proposals/generate', {
      client_id: clientId,
      proposal_type: document.getElementById('pType')?.value,
      monthly_investment: document.getElementById('pInvestment')?.value,
      contract_length: document.getElementById('pContractLength')?.value,
      setup_fee: document.getElementById('pSetupFee')?.value || 0,
      target_keywords: document.getElementById('pKeywords')?.value,
      competitor_domains: document.getElementById('pCompetitors')?.value,
      goals: document.getElementById('pGoals')?.value,
      tier_key: state._selectedTier || null,
    });
    const d = res.data;
    state._generatedProposal = d;
    document.getElementById('pTitle').value = d.title;
    document.getElementById('pInvestmentFinal').value = d.monthly_investment;
    document.getElementById('pContractFinal').value = d.contract_length;
    document.getElementById('pScope').value = d.scope_summary;
    document.getElementById('pDeliverables').value = d.deliverables;
    document.getElementById('pGoalsFinal').value = d.goals;
    document.getElementById('pBaseline').value = d.baseline_data;

    // Render line items
    const li = d.line_items || [];
    document.getElementById('lineItemsList').innerHTML = li.map((item, i) => `
      <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
        <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">${item.category}</span>
        <span class="flex-1">${item.item_name}</span>
        ${item.description ? `<span class="text-xs text-gray-400 truncate max-w-xs hidden md:block">${item.description}</span>` : ''}
      </div>
    `).join('');

    document.getElementById('proposalPreview').classList.remove('hidden');
    document.getElementById('proposalPreview').scrollIntoView({ behavior: 'smooth' });
    toast('Proposal generated!');
  } catch (e) { toast('Failed to generate proposal', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-magic mr-2"></i>Auto-Generate Proposal Content'; btn.disabled = false; }
}

async function saveProposal(action) {
  const clientId = document.getElementById('pClientId')?.value;
  if (!clientId) { toast('Please select a client', 'warning'); return; }

  const data = {
    client_id: clientId,
    title: document.getElementById('pTitle')?.value,
    proposal_type: document.getElementById('pType')?.value,
    monthly_investment: parseFloat(document.getElementById('pInvestmentFinal')?.value || document.getElementById('pInvestment')?.value),
    contract_length: parseInt(document.getElementById('pContractFinal')?.value || document.getElementById('pContractLength')?.value),
    setup_fee: parseFloat(document.getElementById('pSetupFee')?.value) || 0,
    account_manager: document.getElementById('pAccountManager')?.value || '',
    scope_summary: document.getElementById('pScope')?.value,
    deliverables: document.getElementById('pDeliverables')?.value,
    target_keywords: document.getElementById('pKeywords')?.value,
    competitor_domains: document.getElementById('pCompetitors')?.value,
    goals: document.getElementById('pGoalsFinal')?.value,
    baseline_data: document.getElementById('pBaseline')?.value,
    line_items: state._generatedProposal?.line_items || [],
  };

  try {
    const res = await API.post('/proposals', data);
    const proposalId = res.data.id;

    if (action === 'send') {
      await API.post('/proposals/' + proposalId + '/send');
      toast('Proposal saved and sent!');
    } else {
      toast('Proposal saved as draft!');
    }
    state.proposals = null;
    navigate('proposals');
  } catch (e) { toast('Failed to save proposal', 'error'); }
}

async function sendProposal(id) {
  try {
    const res = await API.post('/proposals/' + id + '/send');
    toast('Proposal sent to client!');
    const url = window.location.origin + res.data.approval_url;
    navigator.clipboard?.writeText(url);
    toast('Approval link copied to clipboard!');
    state.proposals = null;
    if (state.page === 'client_detail') loadClientDetail(state.selectedClient?.id);
    else navigate('proposals');
  } catch (e) { toast('Failed to send proposal', 'error'); }
}

function copyApprovalLink(token) {
  const url = window.location.origin + '/proposals/approve/' + token;
  navigator.clipboard?.writeText(url).then(() => toast('Approval link copied!'));
}

async function activatePayment(proposalId) {
  if (!confirm('Activate this campaign and create the first payment + billing schedule?')) return;
  try {
    const res = await API.post('/payments/demo-activate/' + proposalId);
    toast('Campaign activated! First payment recorded and 28-day billing schedule created.');
    state.proposals = null;
    state.billingData = null;
    if (state.page === 'client_detail') loadClientDetail(state.selectedClient?.id);
    else navigate('payments');
  } catch (e) { toast('Activation failed', 'error'); }
}

async function processBilling() {
  try {
    const res = await API.post('/payments/process-billing');
    toast(`Processed ${res.data.processed} billing cycle(s)!`);
    state.billingData = null;
    navigate('payments');
  } catch (e) { toast('Billing processing failed', 'error'); }
}

async function recordManualPayment() {
  const clientId = document.getElementById('manualPayClient')?.value;
  const amount = parseFloat(document.getElementById('manualPayAmount')?.value);
  const type = document.getElementById('manualPayType')?.value;
  const desc = document.getElementById('manualPayDesc')?.value;
  if (!clientId || !amount) { toast('Client and amount are required', 'warning'); return; }
  try {
    const res = await API.post('/payments/manual', { client_id: clientId, amount, payment_type: type, description: desc });
    toast(`Payment recorded! Invoice: ${res.data.invoice_number}`);
    state.billingData = null;
    navigate('payments');
  } catch (e) { toast('Failed to record payment', 'error'); }
}

// WordPress actions
async function saveWpProject() {
  const clientId = document.getElementById('wpClientId')?.value;
  const name = document.getElementById('wpProjectName')?.value;
  if (!clientId || !name) { toast('Client and project name are required', 'warning'); return; }
  try {
    await API.post('/wordpress', {
      client_id: clientId, project_name: name,
      project_type: document.getElementById('wpProjectType')?.value,
      project_budget: parseFloat(document.getElementById('wpBudget')?.value) || 0,
      theme_used: document.getElementById('wpTheme')?.value || '',
      page_builder: document.getElementById('wpBuilder')?.value || 'elementor',
      go_live_date: document.getElementById('wpGoLive')?.value || null,
      include_default_blocks: document.getElementById('wpDefaultBlocks')?.checked || false,
    });
    closeModal('new_wp_modal');
    state.wpProjects = null;
    toast('WordPress project created!');
    navigate('wordpress');
  } catch (e) { toast('Failed to create project', 'error'); }
}

async function saveWpBlock(projectId) {
  const name = document.getElementById('newBlockName')?.value;
  if (!name) { toast('Block name is required', 'warning'); return; }
  try {
    await API.post('/wordpress/' + projectId + '/blocks', {
      block_type: document.getElementById('newBlockType')?.value,
      block_name: name,
      description: document.getElementById('newBlockDesc')?.value || '',
      hours_estimated: parseFloat(document.getElementById('newBlockHours')?.value) || 0,
      price: parseFloat(document.getElementById('newBlockPrice')?.value) || 0,
    });
    closeModal('new_wp_block_modal');
    loadWpProjectDetail(projectId);
    toast('Block added!');
  } catch (e) { toast('Failed to add block', 'error'); }
}

async function updateBlockStatus(blockId, newStatus) {
  const wp = state.selectedWpProject;
  if (!wp) return;
  try {
    const block = (wp.blocks || []).find(b => b.id === blockId);
    if (!block) return;
    await API.put('/wordpress/' + wp.id + '/blocks/' + blockId, { ...block, status: newStatus });
    loadWpProjectDetail(wp.id);
  } catch (e) { toast('Failed to update block', 'error'); }
}

function prefillBlockName(type) {
  const names = {
    homepage: 'Homepage', about_page: 'About Page', service_page: 'Service Page',
    contact_page: 'Contact Page', blog_setup: 'Blog Setup', landing_page: 'Landing Page',
    calculator_tool: 'Interactive Calculator', lead_form: 'Lead Capture Form',
    booking_system: 'Booking System', woocommerce_setup: 'WooCommerce Setup',
    seo_setup: 'SEO Foundation Setup', speed_optimisation: 'Speed Optimisation',
    security_hardening: 'Security Hardening', backup_setup: 'Backup Setup',
    google_analytics: 'Google Analytics 4 + GSC', schema_markup: 'Advanced Schema Markup',
  };
  const nameEl = document.getElementById('newBlockName');
  if (nameEl && names[type]) nameEl.value = names[type];
}

// Social media actions
async function saveSocialPost() {
  const clientId = document.getElementById('socialClientId')?.value;
  const platforms = [...document.querySelectorAll('input[name="socialPlatform"]:checked')].map(el => el.value);
  if (!clientId || platforms.length === 0) { toast('Select client and at least one platform', 'warning'); return; }
  try {
    await API.post('/social', {
      client_id: clientId, platform: platforms.length === 1 ? platforms[0] : platforms,
      post_type: document.getElementById('socialPostType')?.value,
      caption: document.getElementById('socialCaption')?.value,
      hashtags: document.getElementById('socialHashtags')?.value,
      scheduled_at: document.getElementById('socialScheduled')?.value || null,
      link_url: document.getElementById('socialLinkUrl')?.value,
    });
    closeModal('new_social_modal');
    state.socialPosts = null;
    toast(`Social post(s) created on ${platforms.length} platform(s)!`);
    navigate('social');
  } catch (e) { toast('Failed to create post', 'error'); }
}

function filterSocial(platform) {
  state.socialFilter = platform;
  state.socialPosts = null;
  navigate('social');
}

// Press release actions
async function generatePressRelease() {
  const clientId = document.getElementById('prClientId')?.value;
  if (!clientId) { toast('Select a client first', 'warning'); return; }
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
  btn.disabled = true;
  try {
    const res = await API.post('/press-releases/generate', {
      client_id: clientId,
      topic: document.getElementById('prTopic')?.value,
      key_message: document.getElementById('prKeyMessage')?.value,
      quote_person: document.getElementById('prQuotePerson')?.value,
    });
    const d = res.data;
    state._generatedPR = { ...d, client_id: clientId, distribution_date: document.getElementById('prDistDate')?.value || null };
    document.getElementById('prHeadline').value = d.headline;
    document.getElementById('prSubheadline').value = d.subheadline;
    document.getElementById('prBody').value = d.body_text;
    document.getElementById('prQuote').value = d.quote;
    document.getElementById('prQuoteAttrib').value = d.quote_attribution;
    document.getElementById('prBoilerplate').value = d.boilerplate;
    document.getElementById('prContact').value = d.contact_info;
    document.getElementById('prPublications').value = d.target_publications;
    document.getElementById('prSeoKeywords').value = d.seo_keywords;
    document.getElementById('prPreview').classList.remove('hidden');
    document.getElementById('prPreview').scrollIntoView({ behavior: 'smooth' });
    toast('Press release template generated!');
  } catch (e) { toast('Failed to generate', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate Press Release Template'; btn.disabled = false; }
}

async function savePressRelease(status) {
  const clientId = document.getElementById('prClientId')?.value || state._generatedPR?.client_id;
  const headline = document.getElementById('prHeadline')?.value;
  if (!clientId || !headline) { toast('Client and headline are required', 'warning'); return; }
  try {
    await API.post('/press-releases', {
      client_id: clientId, headline, status,
      subheadline: document.getElementById('prSubheadline')?.value,
      body_text: document.getElementById('prBody')?.value,
      quote: document.getElementById('prQuote')?.value,
      quote_attribution: document.getElementById('prQuoteAttrib')?.value,
      boilerplate: document.getElementById('prBoilerplate')?.value,
      contact_info: document.getElementById('prContact')?.value,
      target_publications: document.getElementById('prPublications')?.value,
      seo_keywords: document.getElementById('prSeoKeywords')?.value,
      distribution_date: state._generatedPR?.distribution_date || null,
    });
    state.pressReleases = null;
    state._generatedPR = null;
    toast('Press release saved!');
    navigate('press');
  } catch (e) { toast('Failed to save press release', 'error'); }
}

// Keywords & LLM tracking
async function saveKeywords() {
  const campaignEl = document.getElementById('newKwCampaign');
  const campaignId = campaignEl?.value;
  const clientId = campaignEl?.options[campaignEl.selectedIndex]?.dataset?.client;
  const rawKws = document.getElementById('newKwList')?.value;
  if (!campaignId || !rawKws) { toast('Campaign and keywords are required', 'warning'); return; }

  const keywords = rawKws.split('\n').map(k => k.trim()).filter(Boolean);
  let saved = 0;
  for (const kw of keywords) {
    try {
      await API.post('/keywords', {
        campaign_id: campaignId, client_id: clientId,
        keyword: kw,
        location_code: parseInt(document.getElementById('newKwLocation')?.value) || 2036,
        priority: document.getElementById('newKwPriority')?.value || 'medium',
        target_url: document.getElementById('newKwUrl')?.value || '',
        keyword_group: document.getElementById('newKwGroup')?.value || '',
      });
      saved++;
    } catch (e) {}
  }
  closeModal('new_keyword_modal');
  state.keywordData = null;
  toast(`${saved} keyword(s) added!`);
  navigate('keywords');
}

async function saveLlmPrompt() {
  const campaignEl = document.getElementById('newLlmCampaign');
  const campaignId = campaignEl?.value;
  const clientId = campaignEl?.options[campaignEl.selectedIndex]?.dataset?.client;
  const prompt = document.getElementById('newLlmPrompt')?.value;
  if (!campaignId || !prompt) { toast('Campaign and prompt are required', 'warning'); return; }
  try {
    await API.post('/llm/prompts', {
      campaign_id: campaignId, client_id: clientId,
      prompt_text: prompt,
      target_brand: document.getElementById('newLlmBrand')?.value,
      llm_model: document.getElementById('newLlmModel')?.value,
      prompt_category: document.getElementById('newLlmCategory')?.value,
    });
    closeModal('new_llm_modal');
    state.llmData = null;
    toast('LLM prompt added!');
    navigate('llm');
  } catch (e) { toast('Failed to add prompt', 'error'); }
}

async function saveNewContent() {
  const clientId = document.getElementById('ncoClient')?.value;
  const campaignId = document.getElementById('ncoCampaign')?.value;
  const title = document.getElementById('ncoTitle')?.value;
  if (!clientId || !campaignId || !title) { toast('Please fill all required fields', 'warning'); return; }
  try {
    await API.post('/content', {
      client_id: clientId, campaign_id: campaignId,
      title, content_type: document.getElementById('ncoType')?.value,
      target_keyword: document.getElementById('ncoKeyword')?.value,
      word_count_target: parseInt(document.getElementById('ncoWords')?.value) || 1500,
      due_date: document.getElementById('ncoDue')?.value || null,
      assigned_to: document.getElementById('ncoAssigned')?.value,
      target_url: document.getElementById('ncoUrl')?.value,
    });
    closeModal('new_content_modal');
    state.contentItems = null;
    toast('Content item added!');
    navigate('content');
  } catch (e) { toast('Failed to add content', 'error'); }
}

async function loadCampaignsForContent(clientId) {
  const sel = document.getElementById('ncoCampaign');
  if (!clientId || !sel) return;
  const filtered = (state.campaigns || []).filter(ca => ca.client_id == clientId);
  sel.innerHTML = '<option value="">Select campaign...</option>' + filtered.map(ca => `<option value="${ca.id}">${ca.name}</option>`).join('');
}

async function trackRankings(campaignId) {
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Tracking...';
  btn.disabled = true;
  try {
    const res = await API.post('/rank-tracking/track-campaign', { campaign_id: campaignId });
    toast(`Tracked ${res.data.tracked || 0} keywords!`);
    loadCampaignDetail(campaignId);
  } catch (e) { toast('Rank tracking failed', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Track Rankings Now'; btn.disabled = false; }
}

async function trackAllRankings() {
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Tracking all...';
  btn.disabled = true;
  try {
    const campaigns = state.campaigns || [];
    let total = 0;
    for (const ca of campaigns.filter(c => c.status === 'active')) {
      const res = await API.post('/rank-tracking/track-campaign', { campaign_id: ca.id });
      total += res.data.tracked || 0;
    }
    toast(`Tracked ${total} keywords across all campaigns!`);
    state.keywordData = null;
    navigate('keywords');
  } catch (e) { toast('Failed to track all rankings', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i>Track All Keywords'; btn.disabled = false; }
}

async function trackLLM(campaignId) {
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Checking...';
  btn.disabled = true;
  try {
    const res = await API.post('/llm/track-campaign', { campaign_id: campaignId });
    toast(`Checked ${res.data.tracked || 0} LLM prompt(s)!`);
    loadCampaignDetail(campaignId);
  } catch (e) { toast('LLM tracking failed', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-robot mr-2"></i>Check LLM Mentions'; btn.disabled = false; }
}

async function generateReport(campaignId) {
  // Show a quick period picker
  const now = new Date();
  const defaultPeriod = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const period = prompt('Report period (e.g. "March 2025"):', defaultPeriod);
  if (!period) return;

  const btn = event?.target;
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...'; btn.disabled = true; }
  try {
    const res = await API.post('/reports/generate', {
      campaign_id: campaignId,
      report_period: period,
      report_type: 'monthly'
    });
    const viewUrl = '/reports/view/' + res.data.report_token;
    window.open(viewUrl, '_blank');
    toast('Authority report generated!');
    state.reports = null;
  } catch (e) { toast('Report generation failed', 'error'); }
  finally { if (btn) { btn.innerHTML = '<i class="fas fa-chart-line mr-2"></i>Generate Report'; btn.disabled = false; } }
}

async function sendReport(id) {
  try {
    const res = await API.post('/reports/' + id + '/send');
    toast('Report sent!');
    state.reports = null;
    navigate('reports');
  } catch (e) { toast('Failed to send report', 'error'); }
}

async function updateContentStatus(id, status) {
  try {
    await API.put('/content/' + id, { status });
    const item = state.contentItems?.find(i => i.id === id);
    if (item) item.status = status;
    toast('Status updated');
  } catch (e) { toast('Failed to update', 'error'); }
}

async function openBriefModal(ci) {
  if (typeof ci === 'string') ci = JSON.parse(ci.replace(/&quot;/g, '"'));
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
    await API.put('/content/' + ci.id, { ...ci, brief: res.data.brief });
  } catch (e) { document.getElementById('briefContent').textContent = 'Failed to generate brief.'; }
}

async function autoGenerateBrief() {
  const keyword = document.getElementById('ncoKeyword')?.value;
  const type = document.getElementById('ncoType')?.value;
  if (!keyword) { toast('Enter a target keyword first', 'warning'); return; }
  try {
    const res = await API.post('/content/generate-brief', { keyword, content_type: type, word_count: document.getElementById('ncoWords')?.value });
    if (!document.getElementById('ncoTitle').value) document.getElementById('ncoTitle').value = res.data.title;
    toast('Brief generated!');
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
      keyword, location_code: parseInt(document.getElementById('kwResearchLocation')?.value || '2036'),
    });
    const resultsDiv = document.getElementById('kwResearchResults');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = res.data.suggestions.map(s => `
      <div class="flex items-center justify-between p-2 text-xs border-b border-gray-50 last:border-0">
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
  finally { btn.innerHTML = '<i class="fas fa-search mr-2"></i>Research'; btn.disabled = false; }
}

async function runSerpAnalysis() {
  const keyword = document.getElementById('serpAnalysisInput')?.value;
  if (!keyword) { toast('Enter a keyword', 'warning'); return; }
  const btn = event.target;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing...';
  btn.disabled = true;
  try {
    const res = await API.get(`/rank-tracking/serp-analysis?keyword=${encodeURIComponent(keyword)}&location_code=${document.getElementById('serpLocation')?.value || '2036'}`);
    const resultsDiv = document.getElementById('serpResults');
    resultsDiv.classList.remove('hidden');
    resultsDiv.innerHTML = `
      ${res.data.serp_features?.length ? `<p class="text-xs text-gray-500 mb-2">SERP Features: ${res.data.serp_features.join(', ')}</p>` : ''}
      ${(res.data.organic_results||[]).map(r => `
        <div class="p-2 text-xs border-b border-gray-50 last:border-0">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded bg-gray-100 text-gray-600 flex items-center justify-center font-bold flex-shrink-0">${r.position}</span>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-violet-600 truncate">${r.title}</p>
              <p class="text-gray-400 truncate">${r.url}</p>
            </div>
          </div>
        </div>
      `).join('')}
    `;
    toast('SERP analyzed!');
  } catch (e) { toast('SERP analysis failed', 'error'); }
  finally { btn.innerHTML = '<i class="fas fa-chart-bar mr-2"></i>Analyze'; btn.disabled = false; }
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
          <div class="p-2 bg-blue-50 rounded-lg text-center"><div class="font-bold text-blue-700">${d.rank_overview?.organic_traffic?.toLocaleString() || '-'}</div><div class="text-xs text-gray-500">Est. Traffic</div></div>
          <div class="p-2 bg-green-50 rounded-lg text-center"><div class="font-bold text-green-700">${d.rank_overview?.organic_keywords?.toLocaleString() || '-'}</div><div class="text-xs text-gray-500">Keywords</div></div>
          <div class="p-2 bg-purple-50 rounded-lg text-center"><div class="font-bold text-purple-700">${d.rank_overview?.domain_rank || '-'}</div><div class="text-xs text-gray-500">Domain Rank</div></div>
        </div>
        <p class="font-medium text-xs text-gray-600 mt-2">Top Competitors:</p>
        ${(d.competitors||[]).slice(0,5).map(c => `<div class="flex justify-between text-xs p-1 border-b border-gray-50"><span class="font-medium">${c.domain}</span><span class="text-gray-500">${c.organic_traffic?.toLocaleString() || '-'} visits</span></div>`).join('')}
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
        <div class="p-3 bg-violet-50 rounded-xl text-center"><div class="text-xl font-bold text-blue-700">${d.backlinks_count?.toLocaleString() || '-'}</div><div class="text-xs text-gray-500">Backlinks</div></div>
        <div class="p-3 bg-green-50 rounded-xl text-center"><div class="text-xl font-bold text-green-700">${d.referring_domains?.toLocaleString() || '-'}</div><div class="text-xs text-gray-500">Ref. Domains</div></div>
        <div class="p-3 bg-purple-50 rounded-xl text-center"><div class="text-xl font-bold text-purple-700">${d.domain_rank || '-'}</div><div class="text-xs text-gray-500">Domain Rank</div></div>
        <div class="p-3 bg-yellow-50 rounded-xl text-center"><div class="text-xl font-bold text-yellow-700">${d.spam_score || '0'}</div><div class="text-xs text-gray-500">Spam Score</div></div>
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
    const matchSearch = !q || cl.company_name.toLowerCase().includes(q) || cl.website.toLowerCase().includes(q) || (cl.contact_email||'').toLowerCase().includes(q);
    const matchStatus = !status || cl.status === status;
    return matchSearch && matchStatus;
  });
  const listEl = document.getElementById('clientsList');
  if (listEl) listEl.innerHTML = renderClientCards(filtered);
}

function filterKeywords() {
  const campaign = document.getElementById('kwCampaignFilter')?.value;
  if (!campaign) { state.keywordData = null; loadKeywords(); return; }
  API.get('/keywords?campaign_id=' + campaign).then(r => { state.keywordData = r.data; render(); });
}

function filterContent() {
  const status = document.getElementById('contentStatusFilter')?.value;
  const type = document.getElementById('contentTypeFilter')?.value;
  let url = '/content?';
  if (status) url += 'status=' + status + '&';
  if (type) url += 'content_type=' + type;
  API.get(url).then(r => { state.contentItems = r.data; render(); });
}

function filterProposals() {
  const status = document.getElementById('proposalStatusFilter')?.value;
  const url = status ? '/proposals?status=' + status : '/proposals';
  API.get(url).then(r => { state.proposals = r.data; render(); });
}

// Event attachment (for keyboard shortcuts, etc.)
function attachEvents() {
  // ESC closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    }
  }, { once: true });
}

// ==============================
// ONBOARDING
// ==============================
function renderOnboarding() {
  if (!state.onboardingList) { loadOnboarding(); return loading(); }
  const list = state.onboardingList;
  const statusColors = {
    not_sent: ['bg-gray-100 text-gray-500','Not Sent'],
    pending: ['bg-yellow-100 text-yellow-700','Pending'],
    sent: ['bg-blue-100 text-blue-600','Sent'],
    in_progress: ['bg-purple-100 text-purple-600','In Progress'],
    submitted: ['bg-violet-100 text-violet-600','Submitted'],
    approved: ['bg-green-100 text-green-700','Approved'],
  };
  return `
    <div class="space-y-6">
      <!-- Summary cards -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        ${['pending','sent','in_progress','submitted','approved'].map(s => {
          const count = list.filter(o => o.status === s).length;
          const [cls, lbl] = statusColors[s];
          return `<div class="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
            <div class="text-2xl font-bold text-gray-800">${count}</div>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}">${lbl}</span>
          </div>`;
        }).join('')}
      </div>

      <!-- Pending reminders alert -->
      ${(() => {
        const overdue = list.filter(o => o.status !== 'approved' && o.status !== 'archived' && o.next_reminder_at && new Date(o.next_reminder_at) < new Date());
        return overdue.length ? `<div class="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
          <i class="fas fa-bell text-violet-500 mt-0.5"></i>
          <div><div class="font-semibold text-violet-700">${overdue.length} reminder${overdue.length>1?'s':''} due</div>
          <div class="text-sm text-violet-600">${overdue.map(o=>o.company_name).join(', ')} – onboarding overdue</div></div>
          <button onclick="processReminders()" class="ml-auto text-xs bg-violet-500 text-white px-3 py-1.5 rounded-lg hover:bg-violet-600"><i class="fas fa-paper-plane mr-1"></i>Send Now</button>
        </div>` : '';
      })()}

      <!-- Table -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 class="font-semibold text-gray-800">All Onboarding Forms</h3>
          <button onclick="processReminders()" class="text-xs text-violet-600 hover:underline"><i class="fas fa-sync-alt mr-1"></i>Process Due Reminders</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-5 py-3 text-left">Client</th>
                <th class="px-5 py-3 text-left">Status</th>
                <th class="px-5 py-3 text-left">Reminders</th>
                <th class="px-5 py-3 text-left">Last Sent</th>
                <th class="px-5 py-3 text-left">Submitted</th>
                <th class="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${list.length === 0 ? `<tr><td colspan="6" class="px-5 py-12 text-center text-gray-400">No onboarding records yet. Create one when a client approves a proposal.</td></tr>` : list.map(o => {
                const [cls, lbl] = statusColors[o.status] || ['bg-gray-100 text-gray-500', o.status];
                return `<tr class="hover:bg-blue-50/30 cursor-pointer" onclick="viewOnboarding(${o.id})">
                  <td class="px-5 py-4">
                    <div class="font-semibold text-gray-800">${o.company_name}</div>
                    <div class="text-xs text-gray-400">${o.contact_email || ''}</div>
                  </td>
                  <td class="px-5 py-4"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}">${lbl}</span></td>
                  <td class="px-5 py-4 text-gray-600">${o.reminders_sent || 0} sent</td>
                  <td class="px-5 py-4 text-gray-500">${o.last_reminder_sent_at ? ago(o.last_reminder_sent_at) : '–'}</td>
                  <td class="px-5 py-4">${o.submitted_at ? `<span class="text-green-600"><i class="fas fa-check mr-1"></i>${ago(o.submitted_at)}</span>` : '<span class="text-gray-400">–</span>'}</td>
                  <td class="px-5 py-4">
                    <div class="flex gap-2">
                      <button onclick="event.stopPropagation(); sendOnboardingReminder(${o.id})" class="text-xs bg-violet-50 text-violet-600 px-2.5 py-1.5 rounded-lg hover:bg-violet-100" title="Send/Resend form link"><i class="fas fa-paper-plane"></i></button>
                      ${o.status === 'submitted' ? `<button onclick="event.stopPropagation(); approveOnboarding(${o.id})" class="text-xs bg-green-50 text-green-600 px-2.5 py-1.5 rounded-lg hover:bg-green-100" title="Approve onboarding"><i class="fas fa-check"></i></button>` : ''}
                      <button onclick="event.stopPropagation(); copyOnboardingLink(${o.id}, '${o.onboarding_token}')" class="text-xs bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100" title="Copy form link"><i class="fas fa-copy"></i></button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- New Onboarding Modal -->
    <div id="new_onboarding_modal" class="modal-overlay hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 class="text-lg font-bold mb-4">Create Onboarding Form</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Client <span class="text-red-500">*</span></label>
            <select id="ob_client" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">— Select client —</option>
              ${state.clients.map(c => `<option value="${c.id}">${c.company_name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Reminder Channel</label>
            <select id="ob_channel" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="email">Email only</option>
              <option value="sms">SMS only</option>
              <option value="both">Email + SMS</option>
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="closeModal('new_onboarding_modal')" class="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onclick="createOnboarding()" class="flex-1 text-white py-2.5 rounded-xl text-sm font-bold" style="background:#7C5CFC">Create & Send</button>
        </div>
      </div>
    </div>
  `;
}

function renderOnboardingDetail() {
  const o = state.selectedOnboarding;
  if (!o) return loading();

  const comp = o.completion || {};
  const secs = comp.sections || {};
  const statusColors = { pending:'bg-yellow-100 text-yellow-700', sent:'bg-blue-100 text-blue-600', in_progress:'bg-purple-100 text-purple-600', submitted:'bg-violet-100 text-violet-600', approved:'bg-green-100 text-green-700' };
  const [cls] = Object.entries(statusColors).find(([k]) => k === o.status) || ['bg-gray-100 text-gray-500'];

  const sectionLabels = { brand:'Brand & Business', audience:'Target Audience', content:'Brand Voice & Content', seo:'SEO & Goals', social:'Social Media', website:'Website' };

  return `
    <div class="space-y-6">
      <button onclick="navigate('onboarding')" class="text-sm text-blue-600 hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to Onboarding</button>

      <!-- Header -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-xl font-bold text-gray-800">${o.company_name}</h2>
            <p class="text-sm text-gray-500">${o.contact_email || ''} · ${o.contact_phone || ''}</p>
          </div>
          <span class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold ${cls}">${o.status}</span>
        </div>

        <!-- Overall completion bar -->
        <div class="mt-6">
          <div class="flex justify-between text-sm mb-2">
            <span class="text-gray-600 font-medium">Overall Completion</span>
            <span class="font-bold" style="color:#7C5CFC">${comp.overall || 0}%</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-3">
            <div class="h-3 rounded-full transition-all" style="background:#7C5CFC;width:${comp.overall || 0}%"></div>
          </div>
        </div>

        <!-- Section completion pills -->
        <div class="mt-4 flex flex-wrap gap-3">
          ${Object.entries(secs).map(([key, pct]) => `
            <div class="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <div class="w-16 bg-gray-200 rounded-full h-1.5">
                <div class="bg-blue-500 h-1.5 rounded-full" style="width:${pct}%"></div>
              </div>
              <span class="text-xs text-gray-600">${sectionLabels[key] || key} <strong>${pct}%</strong></span>
            </div>
          `).join('')}
        </div>

        <!-- Actions -->
        <div class="mt-6 flex flex-wrap gap-3">
          <button onclick="sendOnboardingReminder(${o.id})" class="btn-secondary text-sm"><i class="fas fa-paper-plane mr-2"></i>Send/Resend Form</button>
          <button onclick="copyOnboardingLink(${o.id}, '${o.onboarding_token}')" class="btn-secondary text-sm"><i class="fas fa-copy mr-2"></i>Copy Link</button>
          ${o.status === 'submitted' ? `<button onclick="approveOnboarding(${o.id})" class="btn-primary text-sm"><i class="fas fa-check-circle mr-2"></i>Approve Onboarding</button>` : ''}
        </div>
      </div>

      <!-- Form Data Sections -->
      ${Object.entries(o.sections || {}).filter(([,v]) => v && Object.keys(v).length > 1).map(([key, data]) => `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div class="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <i class="fas fa-circle-check text-green-500 text-sm"></i>
            <h3 class="font-semibold text-gray-700">${sectionLabels[key] || key}</h3>
            <span class="ml-auto text-xs text-gray-400">${secs[key] || 0}% complete</span>
          </div>
          <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            ${Object.entries(data).filter(([k]) => !['id','onboarding_id','created_at','updated_at'].includes(k) && data[k]).map(([k, v]) => `
              <div>
                <div class="text-xs text-gray-400 uppercase tracking-wide">${k.replace(/_/g,' ')}</div>
                <div class="text-sm text-gray-800 mt-1 break-words">${(() => {
                  let s = String(v);
                  if (s.startsWith('[') || s.startsWith('{')) try { const p = JSON.parse(s); return Array.isArray(p) ? p.map(x=>typeof x==='object'?JSON.stringify(x):x).join(', ') : JSON.stringify(p, null, 2); } catch {}
                  return s === '1' ? '<i class="fas fa-check text-green-500"></i>' : s === '0' ? '<i class="fas fa-times text-gray-300"></i>' : s;
                })()}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}

      <!-- Reminder History -->
      ${o.reminders?.length ? `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div class="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <h3 class="font-semibold text-gray-700">Reminder History</h3>
          </div>
          <div class="divide-y divide-gray-50">
            ${o.reminders.map(r => `
              <div class="px-6 py-3 flex items-center justify-between">
                <div class="text-sm text-gray-600"><i class="fas fa-${r.channel === 'sms' ? 'mobile-alt' : 'envelope'} mr-2 text-blue-400"></i>${r.channel} reminder</div>
                <span class="text-xs px-2 py-1 rounded-full ${r.status==='sent'?'bg-green-50 text-green-600':'bg-red-50 text-red-500'}">${r.status}</span>
                <div class="text-xs text-gray-400">${r.sent_at ? ago(r.sent_at) : '–'}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

async function loadOnboarding() {
  try {
    const res = await API.get('/onboarding');
    state.onboardingList = res.data;
    render();
  } catch(e) { console.error(e); }
}

async function viewOnboarding(id) {
  try {
    const res = await API.get(`/onboarding/${id}`);
    state.selectedOnboarding = res.data;
    navigate('onboarding_detail');
  } catch(e) { toast('Failed to load onboarding record', 'error'); }
}

async function createOnboarding() {
  const clientId = document.getElementById('ob_client').value;
  const channel = document.getElementById('ob_channel').value;
  if (!clientId) { toast('Please select a client', 'error'); return; }
  try {
    const res = await API.post('/onboarding', { client_id: parseInt(clientId), reminder_channel: channel });
    closeModal('new_onboarding_modal');
    toast('Onboarding record created');
    // auto-send
    await API.post(`/onboarding/${res.data.id}/send`);
    toast('Onboarding form sent to client');
    state.onboardingList = null;
    navigate('onboarding');
  } catch(e) { toast('Failed to create onboarding', 'error'); }
}

async function sendOnboardingReminder(id) {
  const btn = event.target.closest('button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    const res = await API.post(`/onboarding/${id}/send`);
    toast(`Onboarding form sent${res.data.email_sent ? ' via email' : ''}${res.data.sms_sent ? ' + SMS' : ''}`);
    state.onboardingList = null;
    if (state.page === 'onboarding') navigate('onboarding');
    if (state.page === 'onboarding_detail') { const dr = await API.get(`/onboarding/${id}`); state.selectedOnboarding = dr.data; render(); }
  } catch(e) { toast('Failed to send reminder', 'error'); } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i>'; }
  }
}

async function approveOnboarding(id) {
  if (!confirm('Mark this onboarding as approved? This will unblock all campaign tasks.')) return;
  try {
    await API.post(`/onboarding/${id}/approve`, { approved_by: 'Account Manager' });
    toast('Onboarding approved – campaign tasks unblocked');
    state.onboardingList = null;
    if (state.selectedOnboarding) { const r = await API.get(`/onboarding/${id}`); state.selectedOnboarding = r.data; }
    render();
  } catch(e) { toast('Failed to approve', 'error'); }
}

function copyOnboardingLink(id, token) {
  const url = `${window.location.origin}/onboarding/${token}`;
  navigator.clipboard.writeText(url).then(() => toast('Onboarding link copied to clipboard'));
}

async function processReminders() {
  try {
    const res = await API.post('/onboarding/process-reminders');
    toast(`${res.data.sent} reminder(s) sent out of ${res.data.processed} due`);
    state.onboardingList = null;
    navigate('onboarding');
  } catch(e) { toast('Failed to process reminders', 'error'); }
}

async function createOnboardingForClient(clientId) {
  try {
    const res = await API.post('/onboarding', { client_id: clientId, reminder_channel: 'email' });
    await API.post(`/onboarding/${res.data.id}/send`);
    toast('Onboarding form created and sent to client');
    // Refresh client detail
    await loadClientDetail(clientId);
  } catch(e) { toast('Failed to create onboarding', 'error'); }
}

async function resendOnboardingForClient(clientId) {
  try {
    // Find the onboarding record for this client
    const res = await API.get(`/onboarding?client_id=${clientId}`);
    const records = res.data;
    const active = records.find(r => !['approved','archived'].includes(r.status));
    if (!active) { toast('No active onboarding record found', 'error'); return; }
    await API.post(`/onboarding/${active.id}/send`);
    toast('Reminder sent to client');
  } catch(e) { toast('Failed to send reminder', 'error'); }
}

async function reviewOnboardingForClient(clientId) {
  try {
    const res = await API.get(`/onboarding?client_id=${clientId}`);
    const records = res.data;
    const submitted = records.find(r => r.status === 'submitted');
    if (submitted) {
      state.selectedOnboarding = null;
      const detail = await API.get(`/onboarding/${submitted.id}`);
      state.selectedOnboarding = detail.data;
      navigate('onboarding_detail');
    }
  } catch(e) { toast('Failed to load onboarding', 'error'); }
}

// ==============================
// TEAM MANAGEMENT (PM only)
// ==============================
function renderTeam() {
  if (!isPM()) return `<div class="text-center py-20 text-gray-400"><i class="fas fa-lock text-4xl mb-3 block"></i><p>Project Manager access required</p></div>`;
  if (!state.teamUsers) { loadTeamUsers(); return loading(); }
  const users = state.teamUsers;
  const roleColors = { project_manager: 'bg-blue-100 text-blue-700', project_executor: 'bg-purple-100 text-purple-700' };
  const roleLabels = { project_manager: 'Project Manager', project_executor: 'Project Executor' };

  return `
    <div class="space-y-6">
      <!-- Summary -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white rounded-xl p-5 border border-gray-100 shadow-sm text-center">
          <div class="text-3xl font-bold text-gray-800">${users.length}</div>
          <div class="text-sm text-gray-500 mt-1">Total Team Members</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100 shadow-sm text-center">
          <div class="text-3xl font-bold" style="color:#7C5CFC">${users.filter(u=>u.role==='project_manager'&&u.is_active).length}</div>
          <div class="text-sm text-gray-500 mt-1">Project Managers</div>
        </div>
        <div class="bg-white rounded-xl p-5 border border-gray-100 shadow-sm text-center">
          <div class="text-3xl font-bold text-purple-600">${users.filter(u=>u.role==='project_executor'&&u.is_active).length}</div>
          <div class="text-sm text-gray-500 mt-1">Project Executors</div>
        </div>
      </div>

      <!-- Role legend -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <div class="flex items-center gap-2 mb-3">
            <i class="fas fa-user-tie text-violet-600"></i>
            <span class="font-bold text-blue-800">Project Manager</span>
          </div>
          <ul class="text-sm text-blue-700 space-y-1.5">
            <li><i class="fas fa-check-circle mr-2 text-blue-400"></i>Full system access – all pages, data, and actions</li>
            <li><i class="fas fa-check-circle mr-2 text-blue-400"></i>View billing, payments, and financial data</li>
            <li><i class="fas fa-check-circle mr-2 text-blue-400"></i>Approve proposals and onboarding submissions</li>
            <li><i class="fas fa-check-circle mr-2 text-blue-400"></i>Create, edit, and deactivate team members</li>
            <li><i class="fas fa-check-circle mr-2 text-blue-400"></i>Delete clients and campaigns</li>
          </ul>
        </div>
        <div class="bg-purple-50 border border-purple-100 rounded-xl p-5">
          <div class="flex items-center gap-2 mb-3">
            <i class="fas fa-user-cog text-purple-600"></i>
            <span class="font-bold text-purple-800">Project Executor</span>
          </div>
          <ul class="text-sm text-purple-700 space-y-1.5">
            <li><i class="fas fa-check-circle mr-2 text-purple-400"></i>View and update clients, campaigns, and tasks</li>
            <li><i class="fas fa-check-circle mr-2 text-purple-400"></i>Create and update content, social posts, press releases</li>
            <li><i class="fas fa-check-circle mr-2 text-purple-400"></i>Run rank tracking, AI visibility, and DataForSEO tools</li>
            <li><i class="fas fa-check-circle mr-2 text-purple-400"></i>Generate and view reports</li>
            <li><i class="fas fa-times-circle mr-2 text-purple-300"></i>No access to billing, payments, or financial data</li>
            <li><i class="fas fa-times-circle mr-2 text-purple-300"></i>Cannot approve proposals, onboarding, or delete records</li>
          </ul>
        </div>
      </div>

      <!-- Users table -->
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-50">
          <h3 class="font-semibold text-gray-800">Team Members</h3>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="px-5 py-3 text-left">Member</th>
              <th class="px-5 py-3 text-left">Role</th>
              <th class="px-5 py-3 text-left">Status</th>
              <th class="px-5 py-3 text-left">Last Login</th>
              <th class="px-5 py-3 text-left">Logins</th>
              <th class="px-5 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${users.map(u => `
              <tr class="${!u.is_active ? 'opacity-50 bg-gray-50' : 'hover:bg-blue-50/20'}">
                <td class="px-5 py-4">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style="background:${u.avatar_colour||'#2563eb'}">
                      ${u.avatar_initials || u.full_name.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div class="font-semibold text-gray-800">${u.full_name}</div>
                      <div class="text-xs text-gray-400">${u.email}</div>
                    </div>
                  </div>
                </td>
                <td class="px-5 py-4">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[u.role]||'bg-gray-100 text-gray-500'}">${roleLabels[u.role]||u.role}</span>
                  ${u.force_password_change ? '<span class="ml-1 text-xs text-violet-500" title="Must change password"><i class="fas fa-exclamation-triangle"></i></span>' : ''}
                </td>
                <td class="px-5 py-4">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">${u.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td class="px-5 py-4 text-gray-500 text-xs">${u.last_login_at ? ago(u.last_login_at) : 'Never'}</td>
                <td class="px-5 py-4 text-gray-500">${u.login_count || 0}</td>
                <td class="px-5 py-4">
                  ${u.email !== (state.currentUser?.email) ? `
                    <div class="flex gap-2">
                      <button onclick="openEditUserModal(${JSON.stringify(u).replace(/"/g,'&quot;')})" class="text-xs bg-violet-50 text-violet-600 px-2.5 py-1.5 rounded-lg hover:bg-violet-100" title="Edit">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button onclick="toggleUserActive(${u.id}, ${u.is_active})" class="text-xs ${u.is_active ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'} px-2.5 py-1.5 rounded-lg" title="${u.is_active ? 'Deactivate' : 'Reactivate'}">
                        <i class="fas fa-${u.is_active ? 'user-slash' : 'user-check'}"></i>
                      </button>
                    </div>
                  ` : '<span class="text-xs text-gray-400">You</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Audit log -->
      <div id="auditSection">
        <button onclick="loadAuditLog()" class="btn-secondary text-sm"><i class="fas fa-history mr-2"></i>View Audit Log</button>
      </div>
    </div>
  `;
}

// ---- Change password modal ----
function renderChangePwModal() {
  return `
    <div id="change_pw_modal" class="modal-overlay hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 class="text-lg font-bold mb-1">Change Your Password</h3>
        <p class="text-sm text-gray-500 mb-5">Choose a strong password with at least 8 characters.</p>
        <div id="pwChangeError" class="hidden mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"></div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input id="cur_pw" type="password" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Current password">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input id="new_pw" type="password" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Min. 8 characters">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input id="new_pw_confirm" type="password" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Repeat new password">
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="closeModal('change_pw_modal')" class="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onclick="submitChangePw()" class="flex-1 text-white py-2.5 rounded-xl text-sm font-bold" style="background:#7C5CFC">Update Password</button>
        </div>
      </div>
    </div>`;
}

// ---- New/Edit user modals ----
function renderNewUserModal() {
  return `
    <div id="new_user_modal" class="modal-overlay hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 class="text-lg font-bold mb-5" id="userModalTitle">Add Team Member</h3>
        <input type="hidden" id="edit_user_id" value="">
        <div id="userModalError" class="hidden mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"></div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Full Name <span class="text-red-500">*</span></label>
            <input id="um_name" type="text" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Jane Smith">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email Address <span class="text-red-500">*</span></label>
            <input id="um_email" type="email" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="jane@digitalsearchgroup.com.au">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Role <span class="text-red-500">*</span></label>
            <select id="um_role" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
              <option value="project_executor">Project Executor</option>
              <option value="project_manager">Project Manager</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Password <span id="um_pw_note" class="text-xs text-gray-400">(required for new members)</span>
            </label>
            <input id="um_password" type="password" class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Min. 8 characters">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Avatar Colour</label>
            <div class="flex gap-2">
              ${['#2563eb','#7c3aed','#db2777','#059669','#d97706','#dc2626','#0891b2'].map(c=>`
                <button type="button" onclick="selectAvatarColour('${c}')" id="ac_${c.replace('#','')}"
                  class="w-7 h-7 rounded-full border-2 border-transparent hover:scale-110 transition-transform"
                  style="background:${c}"></button>
              `).join('')}
            </div>
            <input type="hidden" id="um_colour" value="#2563eb">
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="closeModal('new_user_modal')" class="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onclick="saveUser()" class="flex-1 text-white py-2.5 rounded-xl text-sm font-bold" id="saveUserBtn" style="background:#7C5CFC">Add Member</button>
        </div>
      </div>
    </div>`;
}

function selectAvatarColour(hex) {
  document.getElementById('um_colour').value = hex;
  document.querySelectorAll('[id^="ac_"]').forEach(el => el.style.borderColor = 'transparent');
  const btn = document.getElementById('ac_' + hex.replace('#',''));
  if (btn) btn.style.borderColor = '#1e293b';
}

// ---- Team actions ----
async function loadTeamUsers() {
  try {
    const res = await API.get('/auth/users');
    state.teamUsers = res.data;
    render();
  } catch(e) { toast('Failed to load team members', 'error'); }
}

function openEditUserModal(user) {
  document.getElementById('userModalTitle').textContent = 'Edit Team Member';
  document.getElementById('edit_user_id').value = user.id;
  document.getElementById('um_name').value = user.full_name;
  document.getElementById('um_email').value = user.email;
  document.getElementById('um_role').value = user.role;
  document.getElementById('um_password').value = '';
  document.getElementById('um_colour').value = user.avatar_colour || '#2563eb';
  document.getElementById('um_pw_note').textContent = '(leave blank to keep current)';
  document.getElementById('saveUserBtn').textContent = 'Save Changes';
  selectAvatarColour(user.avatar_colour || '#2563eb');
  document.getElementById('userModalError').classList.add('hidden');
  openModal('new_user_modal');
}

async function saveUser() {
  const id = document.getElementById('edit_user_id').value;
  const name = document.getElementById('um_name').value.trim();
  const email = document.getElementById('um_email').value.trim();
  const role = document.getElementById('um_role').value;
  const pw = document.getElementById('um_password').value;
  const colour = document.getElementById('um_colour').value;
  const errEl = document.getElementById('userModalError');
  errEl.classList.add('hidden');

  if (!name || !email || !role) { errEl.textContent = 'Please fill in all required fields.'; errEl.classList.remove('hidden'); return; }
  if (!id && (!pw || pw.length < 8)) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.classList.remove('hidden'); return; }

  try {
    if (id) {
      const body = { full_name: name, role, is_active: 1, avatar_colour: colour };
      if (pw) body.password = pw;
      await API.put(`/auth/users/${id}`, body);
      toast('Team member updated');
    } else {
      await API.post('/auth/users', { email, full_name: name, role, password: pw, avatar_colour: colour });
      toast('Team member added');
    }
    closeModal('new_user_modal');
    state.teamUsers = null;
    navigate('team');
  } catch(e) {
    errEl.textContent = e?.response?.data?.error || 'Failed to save team member.';
    errEl.classList.remove('hidden');
  }
}

async function toggleUserActive(id, currentlyActive) {
  const action = currentlyActive ? 'deactivate' : 'reactivate';
  if (!confirm(`${action.charAt(0).toUpperCase()+action.slice(1)} this team member?`)) return;
  try {
    if (currentlyActive) {
      await API.delete(`/auth/users/${id}`);
      toast('Team member deactivated');
    } else {
      await API.put(`/auth/users/${id}`, { is_active: 1 });
      toast('Team member reactivated');
    }
    state.teamUsers = null;
    navigate('team');
  } catch(e) { toast('Failed to update user', 'error'); }
}

async function loadAuditLog() {
  try {
    const res = await API.get('/auth/audit');
    const logs = res.data;
    const html = `
      <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-4">
        <div class="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <h3 class="font-semibold text-gray-700">Audit Log (last 100)</h3>
          <button onclick="document.getElementById('auditSection').innerHTML='<button onclick=\\'loadAuditLog()\\' class=\\'btn-secondary text-sm\\'><i class=\\'fas fa-history mr-2\\'></i>View Audit Log</button>'" class="text-xs text-gray-400 hover:text-gray-600">Hide</button>
        </div>
        <div class="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          ${logs.map(l => `
            <div class="px-5 py-3 flex items-center gap-4">
              <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <i class="fas fa-${l.action.includes('login') ? 'sign-in-alt' : l.action.includes('user') ? 'user' : 'pen'} text-gray-400 text-xs"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-gray-700">${l.description || l.action}</div>
                <div class="text-xs text-gray-400">${l.full_name || 'System'} · ${ago(l.created_at)}</div>
              </div>
              <span class="text-xs text-gray-400 flex-shrink-0">${l.action}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    document.getElementById('auditSection').innerHTML = html;
  } catch(e) { toast('Failed to load audit log', 'error'); }
}

// ---- Change password ----
async function submitChangePw() {
  const cur = document.getElementById('cur_pw').value;
  const nw = document.getElementById('new_pw').value;
  const conf = document.getElementById('new_pw_confirm').value;
  const errEl = document.getElementById('pwChangeError');
  errEl.classList.add('hidden');

  if (nw.length < 8) { errEl.textContent = 'New password must be at least 8 characters.'; errEl.classList.remove('hidden'); return; }
  if (nw !== conf) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); return; }

  try {
    await API.post('/auth/change-password', { current_password: cur, new_password: nw });
    closeModal('change_pw_modal');
    toast('Password updated successfully');
    // Update stored user to remove force_password_change flag
    const u = state.currentUser;
    if (u) { u.force_password_change = false; localStorage.setItem('dsg_user', JSON.stringify(u)); }
  } catch(e) {
    errEl.textContent = e?.response?.data?.error || 'Failed to change password.';
    errEl.classList.remove('hidden');
  }
}

async function handleLogout() {
  try { await API.post('/auth/logout'); } catch {}
  localStorage.removeItem('dsg_token');
  localStorage.removeItem('dsg_user');
  window.location.href = '/login';
}

// ==============================
// BOOTSTRAP
// ==============================
async function init() {
  // ---- 1. Validate session ----
  const storedToken = localStorage.getItem('dsg_token');
  const storedUser = localStorage.getItem('dsg_user');
  if (!storedToken) { window.location.href = '/login'; return; }

  // Use stored user for instant render, then validate
  if (storedUser) {
    try { state.currentUser = JSON.parse(storedUser); } catch {}
  }

  try {
    const meRes = await API.get('/auth/me');
    state.currentUser = meRes.data;
    localStorage.setItem('dsg_user', JSON.stringify(meRes.data));
  } catch(e) {
    localStorage.removeItem('dsg_token'); localStorage.removeItem('dsg_user');
    window.location.href = '/login'; return;
  }

  // ---- 2. Force password change if needed ----
  if (state.currentUser.force_password_change) {
    render(); // render the SPA shell
    setTimeout(() => openModal('change_pw_modal'), 300);
  }

  // Check URL param too (from login redirect)
  if (new URLSearchParams(window.location.search).get('change_password')) {
    window.history.replaceState({}, '', '/');
    render();
    setTimeout(() => openModal('change_pw_modal'), 300);
  }

  // ---- 3. Load core data ----
  if (!state.clients.length) {
    try {
      const [clientsRes, campaignsRes, dfsRes] = await Promise.all([
        API.get('/clients'),
        API.get('/campaigns'),
        API.get('/dataforseo/status').catch(() => ({ data: { connected: false } }))
      ]);
      state.clients = clientsRes.data;
      state.campaigns = campaignsRes.data;
      state.dataforseoStatus = dfsRes.data;
    } catch (e) { console.error('Init failed:', e); }
  }
  loadDashboard();
}

init();
