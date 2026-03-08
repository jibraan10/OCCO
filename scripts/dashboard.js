/* =====================================================
   DASHBOARD.JS - EMT driver dashboard page
   Handles: KPI population, fleet map init,
   activity feed, ER status table, recent routes
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user) return;

  const firstNameEl = document.getElementById('user-first-name');
  const unitEl = document.getElementById('user-unit');
  const deptNameEl = document.getElementById('user-dept-name');

  if (firstNameEl) firstNameEl.textContent = user.firstName || 'Driver';
  if (unitEl) unitEl.textContent = user.unit || '-';
  if (deptNameEl) deptNameEl.textContent = user.department || '';

  const greeting = document.querySelector('.dash-greeting h1');
  if (greeting) {
    const hour = new Date().getHours();
    let tod = 'Good morning';
    if (hour >= 12 && hour < 18) tod = 'Good afternoon';
    else if (hour >= 18) tod = 'Good evening';
    greeting.innerHTML = `${tod}, <span id="user-first-name">${user.firstName || 'Driver'}</span>.`;
  }

  const history = getUserScopedValue('routeHistory', user) || [];
  const today = new Date().toISOString().slice(0, 10);

  const routesToday = history.filter((route) => route.date.startsWith(today)).length;
  const totalTimeSaved = history.reduce((sum, route) => sum + (route.savedMin || 0), 0);
  const totalPatients = history.reduce((sum, route) => sum + (route.patients || 1), 0);

  safeSet('kpi-routes-today', routesToday || 3);
  safeSet(
    'kpi-time-saved',
    `${(totalTimeSaved || 12.3).toFixed(1)}<span class="kpi-unit">min</span>`
  );
  safeSet('kpi-patients', totalPatients || 11);

  const activeRoute = getUserScopedValue('activeRoute', user);
  const activeDestEl = document.getElementById('kpi-active-dest');
  const navLinkEl = document.getElementById('kpi-nav-link');

  if (activeRoute && activeDestEl) {
    activeDestEl.textContent = activeRoute.hospitalName || 'In Progress';
    if (navLinkEl) navLinkEl.style.display = 'inline';
  } else {
    if (activeDestEl) activeDestEl.textContent = 'None';
    if (navLinkEl) navLinkEl.style.display = 'none';
  }

  const mapEl = document.getElementById('fleet-map');
  if (mapEl && typeof L !== 'undefined') {
    void initFleetMap(activeRoute);
  }

  const feedEl = document.getElementById('activity-feed');
  if (feedEl) renderFeed();

  const refreshBtn = document.getElementById('refresh-feed');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const newEvents = [
        { unit: 'Unit 09', action: 'Dispatched to Memorial Hospital', status: 'active', time: 'just now' },
        { unit: 'Unit 16', action: 'Traffic reroute detected', status: 'active', time: 'just now' },
        { unit: 'Unit 04', action: "Arrived at St. Luke's", status: 'arrived', time: 'just now' }
      ];
      const random = newEvents[Math.floor(Math.random() * newEvents.length)];
      MOCK_FLEET_ACTIVITY.unshift(random);
      if (MOCK_FLEET_ACTIVITY.length > 12) MOCK_FLEET_ACTIVITY.pop();
      renderFeed();
    });
  }

  const erTableBody = document.getElementById('er-table-body');
  if (erTableBody) {
    erTableBody.innerHTML = '';

    MOCK_HOSPITALS.forEach((hospital) => {
      const tr = document.createElement('tr');
      const loadClass =
        hospital.erLoad < 40 ? 'er-load-fill--low' :
        hospital.erLoad < 65 ? 'er-load-fill--mid' :
        hospital.erLoad < 85 ? 'er-load-fill--high' :
        'er-load-fill--maxed';

      const inboundClass = hospital.inboundUnits > 0
        ? 'inbound-badge'
        : 'inbound-badge inbound-badge--none';
      const inboundText = hospital.inboundUnits > 0 ? `EMS ${hospital.inboundUnits}` : '-';

      tr.innerHTML = `
        <td>${hospital.name}</td>
        <td>${hospital.erWaitMinutes} min</td>
        <td>
          <div class="er-load-bar-wrap">
            <div class="er-load-bar">
              <div class="er-load-fill ${loadClass}" style="width:${hospital.erLoad}%"></div>
            </div>
            <span class="er-load-pct">${hospital.erLoad}%</span>
          </div>
        </td>
        <td><span class="${inboundClass}">${inboundText}</span></td>
      `;
      erTableBody.appendChild(tr);
    });

    safeSet(
      'er-update-time',
      `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    );
  }

  const recentList = document.getElementById('recent-routes-list');
  if (recentList) {
    const recent = [...history].reverse().slice(0, 4);
    recentList.innerHTML = '';

    if (recent.length === 0) {
      recentList.innerHTML = '<li style="color:var(--text-muted);font-size:0.8rem;font-family:var(--font-mono);padding:1rem;">No routes yet.</li>';
    } else {
      recent.forEach((route) => {
        const li = document.createElement('li');
        const sevClass = `sev-badge sev-badge--${route.severity}`;
        li.innerHTML = `
          <a href="history.html" class="recent-route-item">
            <span class="rr-icon">EMS</span>
            <div class="rr-info">
              <div class="rr-hospital">${route.hospital}</div>
              <div class="rr-injury">
                <span class="${sevClass}">${SEVERITY_LABELS[route.severity]}</span>
                &nbsp;${route.injury}
              </div>
            </div>
            <div class="rr-meta">
              <span class="rr-time">${route.durationMin} min</span>
              <span class="rr-saved">-${route.savedMin.toFixed(1)} min saved</span>
            </div>
          </a>
        `;
        recentList.appendChild(li);
      });
    }
  }

  function renderFeed() {
    feedEl.innerHTML = '';
    MOCK_FLEET_ACTIVITY.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'activity-feed-item';
      li.style.animationDelay = `${index * 0.05}s`;

      const statusClass =
        item.status === 'active' ? 'feed-status-dot--active' :
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

  async function initFleetMap(activeRouteData) {
    const storedLocation = getLastKnownLocation(user);
    const fallbackLocation = isDemoUser(user)
      ? DEMO_LOCATION
      : storedLocation || { lat: 39.8283, lng: -98.5795, label: 'Current Location' };

    const map = L.map('fleet-map', { zoomControl: false }).setView(
      [fallbackLocation.lat, fallbackLocation.lng],
      storedLocation || isDemoUser(user) ? 13 : 4
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);

    const fleetLayer = L.layerGroup().addTo(map);
    renderFleetSnapshot(map, fleetLayer, fallbackLocation, activeRouteData);

    const resolvedLocation = await resolveUserLocation(user, {
      preferLive: true,
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    });

    if (!resolvedLocation?.lat || !resolvedLocation?.lng) return;

    renderFleetSnapshot(map, fleetLayer, resolvedLocation, activeRouteData);
    map.setView([resolvedLocation.lat, resolvedLocation.lng], 13);
  }

  function renderFleetSnapshot(map, fleetLayer, center, activeRouteData) {
    fleetLayer.clearLayers();

    L.circle([center.lat, center.lng], {
      radius: 1800,
      color: 'rgba(245, 166, 35, 0.5)',
      weight: 1,
      fillColor: 'rgba(245, 166, 35, 0.08)',
      fillOpacity: 1
    }).addTo(fleetLayer);

    const currentUnitIcon = L.divIcon({
      html: `<div style="
        background:#f5a623;
        border:2px solid #ffbe4a;
        border-radius:4px;
        padding:2px 6px;
        font-size:12px;
        white-space:nowrap;
        font-family:monospace;
        color:#0d1420;
        font-weight:700;
      ">EMS ${user.unit || 'Your Unit'}</div>`,
      className: '',
      iconAnchor: [32, 15]
    });

    L.marker([center.lat, center.lng], { icon: currentUnitIcon })
      .addTo(fleetLayer)
      .bindTooltip(center.label || 'Current location');

    const localizedHospitals = MOCK_HOSPITALS.map((hospital) => ({
      ...hospital,
      lat: center.lat + (hospital.lat - DEMO_LOCATION.lat),
      lng: center.lng + (hospital.lng - DEMO_LOCATION.lng)
    }));

    localizedHospitals.forEach((hospital) => {
      const isActiveDestination = activeRouteData?.hospitalId === hospital.id;
      const marker = L.circleMarker([hospital.lat, hospital.lng], {
        radius: isActiveDestination ? 12 : 9,
        fillColor: isActiveDestination ? '#ffbe4a' : '#f5a623',
        fillOpacity: 0.9,
        color: '#ffbe4a',
        weight: isActiveDestination ? 3 : 2
      }).addTo(fleetLayer);

      marker.bindTooltip(
        isActiveDestination
          ? `Active route: ${hospital.name}`
          : `${hospital.name} - ER ${hospital.erLoad}% full`
      );
    });

    const nearbyUnits = [
      { unit: 'Unit 03', dLat: -0.0047, dLng: -0.0077 },
      { unit: 'Unit 07', dLat: 0.0183, dLng: -0.0047 },
      { unit: 'Unit 11', dLat: -0.0127, dLng: -0.0364 },
      { unit: 'Unit 18', dLat: 0.0255, dLng: -0.0252 }
    ];

    nearbyUnits.forEach((fleetUnit) => {
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
        ">EMS ${fleetUnit.unit}</div>`,
        className: '',
        iconAnchor: [26, 15]
      });

      L.marker(
        [center.lat + fleetUnit.dLat, center.lng + fleetUnit.dLng],
        { icon }
      ).addTo(fleetLayer);
    });

    map.invalidateSize();
  }

  function safeSet(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = String(html);
  }
});
