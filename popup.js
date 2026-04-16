// ─────────────────────────────────────────
// TRANSLATIONS
// ─────────────────────────────────────────
const translations = {
    EN: {
        app_title:       'AegisBrowse',
        tab_dashboard:   'Dashboard',
        tab_feed:        'Activity Feed',
        nav_count:       'Navigations',
        req_count:       'Requests',
        total_count:     'Total Logs',
        recent_activity: 'Recent Activity',
        secure_status:   '● System Secure',
        no_activity:     'No activity yet. Browse a little!'
    },
    SW: {
        app_title:       'AegisBrowse',
        tab_dashboard:   'Dashibodi',
        tab_feed:        'Mlisho',
        nav_count:       'Urambazaji',
        req_count:       'Maombi',
        total_count:     'Jumla ya Kumbukumbu',
        recent_activity: 'Shughuli za Hivi Karibuni',
        secure_status:   '● Mfumo Salama',
        no_activity:     'Hakuna shughuli bado. Vinjari kidogo!'
    }
};

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let currentLang   = 'EN';
let currentView   = 'dashboard';
let currentPage   = 1;
let logs          = [];
const ITEMS_PER_PAGE = 12;

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
const t  = (key) => translations[currentLang][key] || key;
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const getTypeClass = (type) => {
    if (type === 'navigation') return 'nav';
    if (type === 'request')    return 'req';
    return 'tab';
};

const getTypeIcon = (type) => {
    if (type === 'navigation') return 'compass';
    if (type === 'request')    return 'globe';
    return 'layout-grid';
};

const shortTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fullTime  = (iso) => new Date(iso).toLocaleTimeString();

// ─────────────────────────────────────────
// ICONS — re-render Lucide icons
// ─────────────────────────────────────────
const renderIcons = () => lucide.createIcons();

// ─────────────────────────────────────────
// GSAP BACKGROUND ANIMATION
// ─────────────────────────────────────────
const animateBlobs = () => {
    gsap.to('.blob-1', { x: 40, y: 30, duration: 8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to('.blob-2', { x: -40, y: -20, duration: 10, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to('.blob-3', { x: -30, y: 40, duration: 7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
};

// ─────────────────────────────────────────
// RENDER: STATS
// ─────────────────────────────────────────
const renderStats = () => {
    const navs   = logs.filter(l => l.type === 'navigation').length;
    const reqs   = logs.filter(l => l.type === 'request').length;
    const total  = logs.length;

    // Animate count with GSAP
    gsap.to({ val: parseInt($('#count-nav').textContent) || 0 }, {
        val: navs, duration: 0.8, ease: 'power2.out',
        onUpdate: function() { $('#count-nav').textContent = Math.round(this.targets()[0].val); }
    });
    gsap.to({ val: parseInt($('#count-req').textContent) || 0 }, {
        val: reqs, duration: 0.8, ease: 'power2.out',
        onUpdate: function() { $('#count-req').textContent = Math.round(this.targets()[0].val); }
    });
    gsap.to({ val: parseInt($('#count-total').textContent) || 0 }, {
        val: total, duration: 0.8, ease: 'power2.out',
        onUpdate: function() { $('#count-total').textContent = Math.round(this.targets()[0].val); }
    });
};

// ─────────────────────────────────────────
// RENDER: DASHBOARD RECENT LOGS
// ─────────────────────────────────────────
const renderDashboard = () => {
    renderStats();
    const list = $('#recent-list');
    list.innerHTML = '';

    if (!logs.length) {
        list.innerHTML = `<div class="empty-state">${t('no_activity')}</div>`;
        return;
    }

    logs.slice(0, 8).forEach((log, i) => {
        const cls  = getTypeClass(log.type);
        const icon = getTypeIcon(log.type);
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
            <div class="log-icon ${cls}"><i data-lucide="${icon}"></i></div>
            <div class="log-body">
                <div class="log-type ${cls}">${log.type}</div>
                <div class="log-url" title="${log.url}">${log.url}</div>
            </div>
            <div class="log-time">${shortTime(log.timestamp)}</div>
        `;
        list.appendChild(item);
        // Stagger animation
        gsap.fromTo(item, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.3, delay: i * 0.05 });
    });
    renderIcons();
};

// ─────────────────────────────────────────
// RENDER: ACTIVITY FEED (PAGINATED)
// ─────────────────────────────────────────
const renderFeed = () => {
    const container  = $('#feed-container');
    const totalPages = Math.max(1, Math.ceil(logs.length / ITEMS_PER_PAGE));

    if (currentPage > totalPages) currentPage = totalPages;

    container.innerHTML = '';
    if (!logs.length) {
        container.innerHTML = `<div class="empty-state">${t('no_activity')}</div>`;
    } else {
        const start    = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageLogs = logs.slice(start, start + ITEMS_PER_PAGE);

        pageLogs.forEach((log, i) => {
            const cls  = getTypeClass(log.type);
            const item = document.createElement('div');
            item.className = 'feed-item';
            item.innerHTML = `
                <div class="feed-item-header">
                    <span class="feed-badge ${cls}">${log.type}</span>
                    <span class="feed-time">${fullTime(log.timestamp)}</span>
                </div>
                <div class="feed-url" title="${log.url}">${log.url}</div>
            `;
            container.appendChild(item);
            gsap.fromTo(item, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.25, delay: i * 0.03 });
        });
    }

    // Update pagination controls
    $('#page-info').textContent = `${currentPage} / ${totalPages}`;
    $('#prev-page').disabled    = (currentPage === 1);
    $('#next-page').disabled    = (currentPage === totalPages);
};

// ─────────────────────────────────────────
// VIEW SWITCHING
// ─────────────────────────────────────────
const switchView = (viewId) => {
    if (currentView === viewId) return;
    currentView = viewId;

    $$('.view').forEach(v => v.classList.add('hidden'));
    $$('.tab-btn').forEach(b => b.classList.remove('active'));

    const active = $(`#view-${viewId}`);
    active.classList.remove('hidden');
    $(`#tab-${viewId}`).classList.add('active');

    gsap.fromTo(active, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.3 });

    if (viewId === 'feed')      renderFeed();
    if (viewId === 'dashboard') renderDashboard();
};

// ─────────────────────────────────────────
// THEME TOGGLE
// ─────────────────────────────────────────
const toggleTheme = () => {
    const body  = document.body;
    const isLight = body.classList.toggle('light');
    body.classList.toggle('dark', !isLight);

    const icon = $('#theme-icon');
    icon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
    renderIcons();
};

// ─────────────────────────────────────────
// LANGUAGE TOGGLE
// ─────────────────────────────────────────
const applyTranslations = () => {
    $$('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (translations[currentLang][key]) el.textContent = translations[currentLang][key];
    });
    $('#lang-text').textContent = currentLang;
    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'feed')      renderFeed();
};

// ─────────────────────────────────────────
// LIVE CLOCK
// ─────────────────────────────────────────
const startClock = () => {
    const tick = () => { $('#live-time').textContent = new Date().toLocaleTimeString(); };
    tick();
    setInterval(tick, 1000);
};

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    // Init icons & GSAP
    renderIcons();
    animateBlobs();
    startClock();

    // Load logs from storage
    const data = await chrome.storage.local.get(['activityLogs']);
    logs = data.activityLogs || [];

    // Initial render
    renderDashboard();

    // Tab buttons
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.tab));
    });

    // Theme toggle
    $('#theme-toggle').addEventListener('click', toggleTheme);

    // Language toggle
    $('#lang-toggle').addEventListener('click', () => {
        currentLang = currentLang === 'EN' ? 'SW' : 'EN';
        applyTranslations();
    });

    // Pagination
    $('#prev-page').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderFeed(); }
    });
    $('#next-page').addEventListener('click', () => {
        const total = Math.ceil(logs.length / ITEMS_PER_PAGE);
        if (currentPage < total) { currentPage++; renderFeed(); }
    });

    // Listen for new logs from background
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'NEW_LOG') {
            logs.unshift(msg.log);
            renderStats();
            if (currentView === 'dashboard') renderDashboard();
            if (currentView === 'feed')      renderFeed();
        }
    });
});
