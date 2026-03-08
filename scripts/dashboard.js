/* =====================================================
   DASHBOARD.JS — EMT driver dashboard page
   Handles: KPI population, fleet map init,
   activity feed, ER status table, recent routes
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // shared.js has already auth-checked and populated the sidebar by now
  const user = getCurrentUser();
  if (!user) return; // shouldn't happen — shared.js redirects first

  // ── Greeting + user meta ───────────────────────────────
  const firstNameEl  = document.getElementById('user-first-name');
  const unitEl       = document.getElementById('user-unit');
  const deptNameEl   = document.getElementById('user-dept-name');

  if (firstNameEl) firstNameEl.textContent = user.firstName || 'Driver';
  if (unitEl)      unitEl.textContent = user.unit || '—';
  if (deptNameEl)  deptNameEl.textContent = user.department || '';

  // Adjust greeting to time of day
  const greeting = document.querySelector('.dash-greeting h1');
  if (greeting) {
    const hour = new Date().getHours();
    let tod = 'Good morning';
    if (hour >= 12 && hour < 18) tod = 'Good afternoon';
    else if (hour >= 18) tod = 'Good evening';
    greeting.innerHTML = `${tod}, <span id="user-first-name">${user.firstName || 'Driver'}</span>.`;
  }


  // ── KPI Cards ──────────────────────────────────────────
  // Pull from history to compute real stats
  const history = DB.get('routeHistory') || [];
  const today = new Date().toISOString().slice(0, 10);

  const routesToday   = history.filter((r) => r.date.startsWith(today)).length;
  const totalTimeSaved = history.reduce((sum, r) => sum + (r.savedMin || 0), 0);
  const totalPatients  = history.reduce((sum, r) => sum + (r.patients || 1), 0);

  safeSet('kpi-routes-today', routesToday || 3); // fallback to demo number
  safeSet('kpi-time-saved',
    `${(totalTimeSaved || 12.3).toFixed(1)}<span class="kpi-unit">min</span>`
  );
  safeSet('kpi-patients', totalPatients || 11);

  // Active route card
  const activeRoute = DB.get('activeRoute');
  const activeDestEl = document.getElementById('kpi-active-dest');
  const navLinkEl    = document.getElementById('kpi-nav-link');

  if (activeRoute && activeDestEl) {
    activeDestEl.textContent = activeRoute.hospitalName || 'In Progress';
    if (navLinkEl) navLinkEl.style.display = 'inline';
  } else {
    if (activeDestEl) activeDestEl.textContent = 'None';
    if (navLinkEl) navLinkEl.style.display = 'none';
  }


  // ── Leaflet Fleet Map ──────────────────────────────────
  // Shows a Chicago-centered map with ambulance + hospital markers
  const mapEl = document.getElementById('fleet-map');
  if (mapEl) {
    const map = L.map('fleet-map', { zoomControl: false }).setView([41.8827, -87.6233], 12);

    // OpenStreetMap tile layer (free, no API key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);

    // Hospital markers
    MOCK_HOSPITALS.forEach((h) => {
      const marker = L.circleMarker([h.lat, h.lng], {
        radius: 10,
        fillColor: '#f5a623',
        fillOpacity: 0.9,
        color: '#ffbe4a',
        weight: 2
      }).addTo(map);
      marker.bindTooltip(`🏥 ${h.name} — ER: ${h.erLoad}% full`);
    });

    // Mock ambulance positions (offset from center)
    const ambulancePositions = [
      [41.8780, -87.6310],
      [41.9010, -87.6280],
      [41.8700, -87.6600],
      [41.9082, -87.6485]
    ];

    ambulancePositions.forEach((pos, i) => {
      const icon = L.divIcon({
        html: `<div style="
          background:#0d1420;
          border:2px solid #f5a623;
          border-radius:4px;
          padding:2px 4px;
          font-size:12px;
          white-space:nowrap;
          font-family:monospace;
          color:#f5a623;
        ">🚑 U${String(i + 3).padStart(2,'0')}</div>`,
        className: '',
        iconAnchor: [20, 15]
      });
      L.marker(pos, { icon }).addTo(map);
    });
  }


  // ── Activity Feed ──────────────────────────────────────
  const feedEl = document.getElementById('activity-feed');
  if (feedEl) renderFeed();

  function renderFeed() {
    feedEl.innerHTML = '';
    MOCK_FLEET_ACTIVITY.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'activity-feed-item';
      li.style.animationDelay = `${i * 0.05}s`;

      const statusClass =
        item.status === 'active'  ? 'feed-status-dot--active'  :
        item.status === 'arrived' ? 'feed-status-dot--arrived' :
                                    'feed-status-dot--idle';

      li.innerHTML = `
        <div class="feed-status-dot ${statusClass}"></div>
        <span class="feed-unit">${item.unit}</span>
        <span class="feed-action">${item.action}</span>
        <span class="feed-time">${item.time}</span>
      `;
      feedEl.appendChild(li);
    });
  }

  // Refresh feed button adds a simulated new event at the top
  const refreshBtn = document.getElementById('refresh-feed');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const newEvents = [
        { unit: 'Unit 09', action: 'Dispatched → Memorial Hospital', status: 'active', time: 'just now' },
        { unit: 'Unit 16', action: 'Traffic reroute detected', status: 'active', time: 'just now' },
        { unit: 'Unit 04', action: 'Arrived — St. Luke\'s', status: 'arrived', time: 'just now' }
      ];
      const random = newEvents[Math.floor(Math.random() * newEvents.length)];
      MOCK_FLEET_ACTIVITY.unshift(random);
      if (MOCK_FLEET_ACTIVITY.length > 12) MOCK_FLEET_ACTIVITY.pop();
      renderFeed();
    });
  }


  // ── ER Status Table ────────────────────────────────────
  const erTableBody = document.getElementById('er-table-body');
  if (erTableBody) {
    erTableBody.innerHTML = '';

    MOCK_HOSPITALS.forEach((h) => {
      const tr = document.createElement('tr');

      // Determine load color tier
      const loadClass =
        h.erLoad < 40  ? 'er-load-fill--low'  :
        h.erLoad < 65  ? 'er-load-fill--mid'  :
        h.erLoad < 85  ? 'er-load-fill--high' :
                         'er-load-fill--maxed';

      const inboundClass = h.inboundUnits > 0 ? 'inbound-badge' : 'inbound-badge inbound-badge--none';
      const inboundText  = h.inboundUnits > 0 ? `🚑 ${h.inboundUnits}` : '—';

      tr.innerHTML = `
        <td>${h.name}</td>
        <td>${h.erWaitMinutes} min</td>
        <td>
          <div class="er-load-bar-wrap">
            <div class="er-load-bar">
              <div class="er-load-fill ${loadClass}" style="width:${h.erLoad}%"></div>
            </div>
            <span class="er-load-pct">${h.erLoad}%</span>
          </div>
        </td>
        <td><span class="${inboundClass}">${inboundText}</span></td>
      `;
      erTableBody.appendChild(tr);
    });

    // Show last updated time
    safeSet('er-update-time', 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }


  // ── Recent Routes ──────────────────────────────────────
  const recentList = document.getElementById('recent-routes-list');
  if (recentList) {
    const recent = [...history].reverse().slice(0, 4);
    recentList.innerHTML = '';

    if (recent.length === 0) {
      recentList.innerHTML = '<li style="color:var(--text-muted);font-size:0.8rem;font-family:var(--font-mono);padding:1rem;">No routes yet.</li>';
    } else {
      recent.forEach((r) => {
        const li = document.createElement('li');
        const sevClass = `sev-badge sev-badge--${r.severity}`;
        li.innerHTML = `
          <a href="history.html" class="recent-route-item">
            <span class="rr-icon">🚑</span>
            <div class="rr-info">
              <div class="rr-hospital">${r.hospital}</div>
              <div class="rr-injury">
                <span class="${sevClass}">${SEVERITY_LABELS[r.severity]}</span>
                &nbsp;${r.injury}
              </div>
            </div>
            <div class="rr-meta">
              <span class="rr-time">${r.durationMin} min</span>
              <span class="rr-saved">−${r.savedMin.toFixed(1)} min saved</span>
            </div>
          </a>
        `;
        recentList.appendChild(li);
      });
    }
  }


  // ── Helper: safely set innerHTML on an element by ID ──
  function safeSet(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = String(html);
  }

});