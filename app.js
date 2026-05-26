/**
 * Enterprise Financial Disbursement Platform Logic [v3.0 ULTRA]
 * Implements RBAC, Immutable Audit Logs, State Management, and AI OCR
 */

class AppState {
  constructor() {
    this.session = null;
    this.token = null;
    this.requests = [];
    this.auditLog = [];
    this.usersMap = {}; 
    this.inactivityTimer = null;
    this.INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 mins
  }
}

const appState = new AppState();

const UI = {
  formatMoney: (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n),
  formatDate: (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  getUser: (id) => appState.usersMap[id] || id,
  statusMap: { PND: 'Pending', FIN: 'Finance Review', OWN: 'Owner Auth', DSB: 'Disbursed', REJ: 'Rejected' },
  statusClass: { PND: 'st-pnd', FIN: 'st-fin', OWN: 'st-own', DSB: 'st-dsb', REJ: 'st-rej' },
  chip: (s) => `<span class="status-chip ${UI.statusClass[s] || ''}">${UI.statusMap[s] || s}</span>`
};

const CLERK_PUBLISHABLE_KEY = 'pk_test_d29ya2luZy1naWJib24tOTQuY2xlcmsuYWNjb3VudHMuZGV2JA';

const app = {
  async init() {
    console.log("Enterprise Application Initialized.");
    this.setupErrorBoundaries();
    this.setupRouting();
    this.setupEventListeners();
    this.startInactivityTracker();
    
    // Wait until window.Clerk is loaded from CDN
    const interval = setInterval(async () => {
        if (window.Clerk) {
            clearInterval(interval);
            await this.initClerk();
        }
    }, 100);
  },

  setupErrorBoundaries() {
    window.addEventListener('error', (e) => {
      console.error('Global Error:', e.error);
      this.showToast('An unexpected error occurred. Please refresh.');
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('Unhandled Promise:', e.reason);
      this.showToast('Network or processing error. Retrying may help.');
    });
  },

  setupRouting() {
    window.addEventListener('hashchange', () => this.handleRoute());
  },

  setupEventListeners() {
    // Convert inline handlers to programmatic
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.dataset.target;
        if (target) location.hash = target;
      });
    });

    const submitForm = document.getElementById('submitForm');
    if (submitForm) submitForm.addEventListener('submit', (e) => this.submitRequest(e));

    const fileUpload = document.getElementById('fileUpload');
    if (fileUpload) fileUpload.addEventListener('change', (e) => this.handleInvoiceUpload(e));

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

    // Clean numeric inputs
    const reqAmt = document.getElementById('reqAmt');
    if (reqAmt) {
      reqAmt.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9.]/g, '');
      });
    }

    // Mobile menu toggle
    const menuBtn = document.getElementById('mobileMenuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
      });
    }

    // Theme toggle
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('ai_finance_theme', next);
      });
    }

    // Load theme from preference
    const savedTheme = localStorage.getItem('ai_finance_theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  },

  startInactivityTracker() {
    const reset = () => {
      clearTimeout(appState.inactivityTimer);
      if (appState.session) {
        appState.inactivityTimer = setTimeout(() => {
          this.showToast('Session locked due to inactivity.');
          this.logout();
        }, appState.INACTIVITY_LIMIT);
      }
    };
    ['mousemove', 'keydown', 'scroll', 'click'].forEach(e => window.addEventListener(e, reset));
    reset();
  },

  async initClerk() {
    try {
        const Clerk = window.Clerk;
        await Clerk.load({ publishableKey: CLERK_PUBLISHABLE_KEY });

        Clerk.addListener(async ({ user }) => {
            if (user) {
                await this.handleUserAuthenticated(user);
            } else {
                this.handleUserUnauthenticated();
            }
        });
    } catch (e) {
        console.error("Clerk Initialization Error:", e);
    }
  },

  async handleUserAuthenticated(user) {
    const Clerk = window.Clerk;
    try {
        const token = await Clerk.session.getToken();
        appState.token = token;

        // Default role is DEV unless metadata exists
        let role = 'DEV'; 
        if (user.publicMetadata && user.publicMetadata.role) {
            role = user.publicMetadata.role;
        } else {
          // Fallback parsing
          const email = user.primaryEmailAddress ? user.primaryEmailAddress.emailAddress.toLowerCase() : '';
          if (email.includes('admin') || email === 'abakashray57@gmail.com') role = 'ADM';
          else if (email.includes('owner') || email === 'cse2022017@rcciit.org.in') role = 'OWN';
          else if (email.includes('finance') || email === 'rayabakash@gmail.com') role = 'FIN';
        }

        appState.session = {
            id: user.id,
            name: user.fullName || user.username || 'User',
            role: role
        };

        await this.syncUserWithBackend();
        this.transitionToApp();
    } catch (e) {
        console.error("Authentication failed:", e);
    }
  },

  handleUserUnauthenticated() {
    const Clerk = window.Clerk;
    appState.token = null;
    appState.session = null;
    
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginScreen').style.opacity = '1';

    Clerk.mountSignIn(document.getElementById('clerk-sign-in'), { appearance: { theme: 'dark' } });
  },

  async syncUserWithBackend() {
    try {
        await this.api('/api/sync-user', 'POST', {
            id: appState.session.id,
            name: appState.session.name,
            role: appState.session.role
        });
    } catch (e) {
        console.error("Failed to sync DB:", e);
    }
  },

  async api(endpoint, method = 'GET', body = null, retries = 1) {
    const headers = { 'Content-Type': 'application/json' };
    
    if (window.Clerk && window.Clerk.session) {
        try {
            const token = await window.Clerk.session.getToken();
            appState.token = token;
            headers['Authorization'] = `Bearer ${token}`;
        } catch (e) {}
    }
    
    try {
      const res = await fetch(endpoint, { method, headers, body: body ? JSON.stringify(body) : null });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || 'API Request Failed');
      return data;
    } catch (e) {
      if (retries > 0 && e.message === 'API Request Failed') {
        console.log(`Retrying API call to ${endpoint}...`);
        await new Promise(r => setTimeout(r, 1000));
        return this.api(endpoint, method, body, retries - 1);
      }
      throw e;
    }
  },

  showToast(msg) {
    const el = document.getElementById('sysToast');
    if (!el) return;
    document.getElementById('toastMsg').textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4000);
  },

  transitionToApp() {
      document.getElementById('loginScreen').style.opacity = '0';
      setTimeout(() => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'block';
        setTimeout(() => document.getElementById('appScreen').style.opacity = '1', 50);
        this.setupEnvironment();
      }, 600);
  },

  async logout() {
    if (window.Clerk) await window.Clerk.signOut();
  },

  async setupEnvironment() {
    const u = appState.session;
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) avatarEl.textContent = u.name.charAt(0);
    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = u.name;
    const roleEl = document.getElementById('userRole');
    
    const roles = { DEV: 'Developer', FIN: 'Finance', OWN: 'Owner', ADM: 'System Admin' };
    if (roleEl) roleEl.textContent = `${roles[u.role] || u.role} · ${u.id.substring(0,8)}`;

    // RBAC Nav visibility
    const navSubmit = document.getElementById('nav-submit');
    const navReview = document.getElementById('nav-review');
    const navFinance = document.getElementById('nav-finance');

    if (navSubmit) navSubmit.classList.toggle('hidden', !['DEV', 'ADM'].includes(u.role));
    if (navReview) navReview.classList.toggle('hidden', !['FIN', 'OWN', 'ADM'].includes(u.role));
    if (navFinance) navFinance.classList.toggle('hidden', !['FIN', 'ADM'].includes(u.role));

    // Show skeletons
    this.renderSkeletons();

    await this.fetchData();
    
    // Initial Route
    if (!location.hash) location.hash = 'dashboard';
    else this.handleRoute();
  },

  renderSkeletons() {
    const tb = document.getElementById('dashTableBody');
    if (tb) tb.innerHTML = Array(5).fill('<tr><td colspan="6"><div class="skeleton-shimmer" style="height: 20px; border-radius: 4px;"></div></td></tr>').join('');
  },

  async fetchData() {
    try {
        const [usersRes, reqsRes, auditRes] = await Promise.all([
            this.api('/api/users'),
            this.api('/api/requests'),
            this.api('/api/audit')
        ]);
        
        if (usersRes) appState.usersMap = usersRes.reduce((acc, u) => { acc[u.id] = u.name; return acc; }, {});
        if (reqsRes && reqsRes.data) appState.requests = reqsRes.data;
        else if (reqsRes) appState.requests = reqsRes; // Fallback if not paginated
        if (auditRes && auditRes.data) appState.auditLog = auditRes.data;
        else if (auditRes) appState.auditLog = auditRes;
        
        this.render();
    } catch (e) {
        console.error("Failed to fetch data", e);
        if (e.message.includes('Unauthorized') || e.message.includes('Session')) this.logout();
    }
  },

  handleRoute() {
    let view = location.hash.replace('#', '') || 'dashboard';
    
    // Close sidebar on mobile
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('open');

    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.animation = 'none';
        v.offsetHeight; 
    });
    document.querySelectorAll('.nav-btn').forEach(n => n.classList.toggle('active', n.dataset.target === view));
    
    const activeView = document.getElementById('view-' + view);
    if (activeView) {
      activeView.classList.add('active');
      activeView.style.animation = 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    }

    const titles = {
      dashboard: { t: 'Executive Overview', i: 'space_dashboard' },
      submit: { t: 'Initialize Transfer', i: 'add_card' },
      review: { t: appState.session.role === 'OWN' ? 'Executive Authorization' : 'Compliance Queue', i: 'fact_check' },
      finance: { t: 'High-Density Finance Dashboard', i: 'donut_large' },
      audit: { t: 'Immutable Security Audit', i: 'security' }
    };
    
    if (titles[view]) {
      const pTitle = document.getElementById('pageTitleText');
      if (pTitle) pTitle.textContent = titles[view].t;
      const pIcon = document.getElementById('pageIcon');
      if (pIcon) pIcon.textContent = titles[view].i;
    }

    // Lazy load Tesseract if finance view
    if (view === 'finance' && !window.Tesseract) {
      this.loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      // Load PDF.js
      this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    }

    // Save preference
    localStorage.setItem('ai_finance_last_view', view);
    this.render(); 
  },

  loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement('script');
    s.src = src;
    document.head.appendChild(s);
  },

  render() {
    this.renderStats();
    this.renderDash();
    this.renderReview();
    this.renderAudit();
  },

  getVisibleReqs() { return appState.requests; },

  renderStats() {
    const container = document.getElementById('statsContainer');
    if (!container) return;
    const reqs = this.getVisibleReqs();
    const total = reqs.length;
    const pending = reqs.filter(x => x.status === 'PND' || x.status === 'FIN').length;
    const val = reqs.reduce((a, b) => a + b.amount, 0);

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #3b82f6, #2563eb)"><span class="material-icons-round">analytics</span></div>
        <div class="stat-label">Total Volume</div>
        <div class="stat-value">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706)"><span class="material-icons-round">pending_actions</span></div>
        <div class="stat-label">In Pipeline</div>
        <div class="stat-value">${pending}</div>
      </div>
      <div class="stat-card" style="grid-column: span 2;">
        <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #059669)"><span class="material-icons-round">account_balance_wallet</span></div>
        <div class="stat-label">Capital Value Managed</div>
        <div class="stat-value">${UI.formatMoney(val)}</div>
      </div>
    `;
  },

  renderDash() {
    const tb = document.getElementById('dashTableBody');
    if (!tb) return;
    const reqs = this.getVisibleReqs();
    if (!reqs.length) { tb.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color: var(--text-secondary)">No active records found.</td></tr>`; return; }
    
    tb.innerHTML = reqs.map((r, i) => `
      <tr style="animation: slideRight 0.4s ease forwards; animation-delay: ${i*0.05}s; opacity: 0;">
        <td class="col-id">${r.id}</td>
        <td><span style="color: var(--text-secondary); font-size: 0.85rem">${UI.formatDate(r.ts)}</span></td>
        <td style="font-weight: 500">${UI.getUser(r.requester)}</td>
        <td>${r.purpose}</td>
        <td class="col-amt">${UI.formatMoney(r.amount)}</td>
        <td style="text-align:center">${UI.chip(r.status)}</td>
      </tr>
    `).join('');
  },

  renderReview() {
    const tb = document.getElementById('reviewTableBody');
    if (!tb) return;
    const r = appState.session.role;
    let pool = [];
    let completedPool = [];
    if (r === 'FIN') {
      pool = appState.requests.filter(x => x.status === 'PND');
      completedPool = appState.requests.filter(x => x.status === 'FIN' || x.status === 'REJ');
    } else if (r === 'OWN') {
      pool = appState.requests.filter(x => x.status === 'FIN');
      completedPool = appState.requests.filter(x => x.status === 'OWN' || x.status === 'DSB' || x.status === 'REJ');
    } else if (r === 'ADM') {
      pool = appState.requests.filter(x => ['PND', 'FIN', 'OWN'].includes(x.status));
    }

    let html = '';
    if (!pool.length && !completedPool.length) { 
      tb.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color: var(--text-secondary)"><span class="material-icons-round" style="font-size:32px; opacity: 0.5; margin-bottom: 10px; display:block;">verified</span>Queue cleared.</td></tr>`; 
      return; 
    }

    if (pool.length) {
      html += pool.map((req, i) => {
        let acts = '';
        if (r === 'FIN' && req.status === 'PND') acts = `<div class="action-group"><button class="btn btn-success btn-sm" onclick="app.action('${req.id}', 'FIN', 'Compliance verified')">Verify</button><button class="btn btn-danger btn-sm" onclick="app.action('${req.id}', 'REJ', 'Failed check')">Reject</button></div>`;
        else if (r === 'OWN' && req.status === 'FIN') acts = `<div class="action-group"><button class="btn btn-primary btn-sm" onclick="app.action('${req.id}', 'OWN', 'Exec auth')">Authorize</button><button class="btn btn-danger btn-sm" onclick="app.action('${req.id}', 'REJ', 'Denied')">Deny</button></div>`;
        else if (r === 'ADM') acts = `<div class="action-group"><button class="btn btn-warning btn-sm" onclick="app.action('${req.id}', 'DSB', 'Admin Override')">Override</button></div>`;
        else acts = '<span style="color:var(--text-secondary); font-size:0.8rem">Audit Only</span>';

        return `
          <tr style="animation: slideRight 0.4s ease forwards; animation-delay: ${i*0.05}s; opacity: 0;">
            <td class="col-id">${req.id}</td>
            <td style="font-weight: 500">${UI.getUser(req.requester)}</td>
            <td>${req.purpose}</td>
            <td class="col-amt">${UI.formatMoney(req.amount)}</td>
            <td style="text-align:center">${UI.chip(req.status)}</td>
            <td>${acts}</td>
          </tr>
        `;
      }).join('');
    }

    if (completedPool.length) {
      html += `<tr><td colspan="6" style="padding: 24px 16px 8px; font-weight: 600; color: var(--text-secondary); border-bottom: none;"><span class="material-icons-round" style="vertical-align: middle; margin-right: 8px;">history</span> Recently Processed</td></tr>`;
      html += completedPool.map((req) => {
        let revertState = r === 'FIN' ? 'PND' : 'FIN';
        let acts = `<div class="action-group"><button class="btn btn-warning btn-sm" onclick="app.action('${req.id}', '${revertState}', 'Decision Reverted')"><span class="material-icons-round" style="font-size: 16px; margin-right: 4px;">undo</span> Revert</button></div>`;
        return `
          <tr style="opacity: 0.7; background: rgba(0,0,0,0.1);">
            <td class="col-id">${req.id}</td>
            <td style="font-weight: 500">${UI.getUser(req.requester)}</td>
            <td>${req.purpose}</td>
            <td class="col-amt">${UI.formatMoney(req.amount)}</td>
            <td style="text-align:center">${UI.chip(req.status)}</td>
            <td>${acts}</td>
          </tr>
        `;
      }).join('');
    }
    tb.innerHTML = html;
  },

  renderAudit() {
    let logs = [...appState.auditLog];
    const tl = document.getElementById('auditTimeline');
    if (!tl) return;
    if (!logs.length) { tl.innerHTML = '<div style="padding:20px; color:var(--text-secondary)">No audit records found.</div>'; return; }

    tl.innerHTML = logs.reverse().map((l, i) => {
      const pC = l.prev && l.prev !== '-' ? UI.chip(l.prev) : '<span>-</span>';
      const nC = l.next === 'LOGIN' || l.next === 'LOGOUT' ? `<span class="status-chip" style="background: rgba(255,255,255,0.1)">${l.next}</span>` : UI.chip(l.next);
      return `
        <div class="timeline-item" style="animation-delay: ${i*0.08}s;">
          <div class="tl-head">
            <span class="tl-actor">${UI.getUser(l.actor)}</span>
            <span class="tl-time">${UI.formatDate(l.ts)}</span>
            <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--primary)">${l.reqId}</span>
          </div>
          <div class="tl-body">
            <div class="tl-change">${pC} <span class="material-icons-round tl-arrow">arrow_forward</span> ${nC}</div>
            <div class="tl-comment">"${l.comment}"</div>
            ${l.signature ? `<div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-secondary); margin-top: 8px; word-break: break-all;"><span class="material-icons-round" style="font-size:12px; vertical-align:middle">lock</span> SIG: ${l.signature}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  async action(id, nextState, comment) {
    try {
        await this.api('/api/action', 'POST', { id, nextState, comment });
        
        if (nextState === 'OWN') {
          setTimeout(async () => {
            await this.fetchData();
            this.showToast('Transfer complete.');
          }, 1500);
        }
        
        await this.fetchData();
        this.showToast('State transition cryptographically signed.');
    } catch (e) {
        this.showToast('Error: ' + e.message);
    }
  },

  async submitRequest(e) {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('reqAmt').value);
    const purpose = document.getElementById('reqPurpose').value.trim();
    if (!amt || !purpose) return;

    try {
        await this.api('/api/requests', 'POST', { amount: amt, purpose });
        document.getElementById('reqAmt').value = '';
        document.getElementById('reqPurpose').value = '';
        location.hash = 'dashboard';
        this.showToast('Disbursement injected into processing pipeline.');
    } catch (e) {
        this.showToast('Error: ' + e.message);
    }
  },

  async handleInvoiceUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const viewer = document.getElementById('invoiceViewer');
    
    // Hash duplicate detection (Simulated SHA-256 for UX)
    const mockHash = file.name + file.size;
    if (localStorage.getItem('last_invoice_hash') === mockHash) {
      this.showToast('Duplicate document detected! Pre-checking hashes.');
    }
    localStorage.setItem('last_invoice_hash', mockHash);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const imageSrc = ev.target.result;
        
        viewer.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%;">
                <img src="${imageSrc}" style="width:100%; height:100%; object-fit:contain; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div id="ocrOverlay" style="position: absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius: 8px;">
                    <div class="spinner" style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.3); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <p style="margin-top: 16px; color: white; font-weight: 500;">AI Vision Extracting Data...</p>
                </div>
            </div>
        `;
        app.showToast('Image uploaded. Initializing AI OCR...');

        try {
            if (!window.Tesseract) throw new Error("Tesseract library not loaded.");
            
            // Image preprocessing simulated by letting Tesseract run
            const result = await Tesseract.recognize(imageSrc, 'eng', { logger: m => console.log(m) });
            const extractedText = result.data.text;
            const confidence = result.data.confidence;
            
            const overlay = document.getElementById('ocrOverlay');
            if (overlay) overlay.style.display = 'none';

            // Multi-currency regex extraction
            const amountRegex = /(?:total|amount(?:\s+due)?|balance(?:\s+due)?)\s*[:=]?\s*(?:USD|Rs\.?|\$|£|€|¥)?\s*([\d,]+\.\d{2})/i;
            const match = extractedText.match(amountRegex);
            
            if (match && match[1]) {
                const amountStr = match[1].replace(/,/g, '');
                const amountValue = parseFloat(amountStr);
                
                const grossInput = document.getElementById('grossAmount');
                if (grossInput) {
                    grossInput.value = amountValue.toFixed(2);
                    app.showToast(`AI Confidence: ${confidence.toFixed(1)}%. Extracted: $${amountValue.toFixed(2)}`);
                    
                    if (window.financeApp && window.financeApp.calculateTax) {
                        window.financeApp.calculateTax();
                    }
                }
            } else {
                app.showToast('AI could not confidently locate a total amount.');
            }
            
            // Tax ID Extraction
            const taxRegex = /(?:GSTIN|EIN|VAT)[\s:]*([A-Z0-9]{9,15})/i;
            const taxMatch = extractedText.match(taxRegex);
            if(taxMatch) {
              console.log("Extracted Tax ID:", taxMatch[1]);
              this.showToast(`Identified Tax ID: ${taxMatch[1]}`);
            }

        } catch (error) {
            console.error("OCR Error:", error);
            app.showToast('OCR processing failed.');
            const overlay = document.getElementById('ocrOverlay');
            if (overlay) overlay.style.display = 'none';
        }
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      const fileURL = URL.createObjectURL(file);
      viewer.innerHTML = `<iframe src="${fileURL}" style="width:100%; height:100%; border:none; border-radius: 8px; background: white;"></iframe>`;
      app.showToast('PDF loaded. Advanced OCR supported for Images currently.');
    } else {
      app.showToast('Unsupported file type. Please upload PDF or Image.');
    }
  }
};

window.onload = () => app.init();
