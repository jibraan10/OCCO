/* =====================================================
   NAVIGATE.JS - active turn-by-turn navigation screen
   Handles: live map, directions, reroute prompt,
   hospital call status, network alerts, arrival overlay
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user) return;

  const route = getUserScopedValue('activeRoute', user);
  if (!route) {
    window.location.href = 'dispatch.html';
    return;
  }

  let currentStepIdx = 0;
  let rerouted = false;
  let rerouteTimerId = null;
  let elapsedSeconds = 0;
  let navMap = null;
  let routePolyline = null;
  let directions = Array.isArray(route.navigationSteps) && route.navigationSteps.length
    ? route.navigationSteps
    : getMockDirections(route.hospitalName);

  setText('nav-dest-name', route.hospitalName);
  setText('nav-dest-address', route.hospitalAddress || '');
  setText('dest-dist', kmToMiles(route.distKm));
  setText('dest-time', route.etaMin);
  setText('dest-er-wait', `${getHospitalById(route.hospitalId)?.erWaitMinutes || '-'} min`);
  setText('nav-hospital-call-name', route.hospitalName);

  initMap();
  renderCurrentStep();
  renderUpcomingSteps();
  updateETA();
  hydrateRouteData();
  initMapControls();
  initHospitalAlert();
  initNetworkAlert();
  initReroutePrompt();

  const stepTimer = setInterval(() => {
    elapsedSeconds += 12;

    if (currentStepIdx < directions.length - 2) {
      currentStepIdx += 1;
      renderCurrentStep();
      renderUpcomingSteps();
      updateETA();
    } else {
      clearInterval(stepTimer);
      setTimeout(showArrived, 2000);
    }
  }, 12000);

  function initMap() {
    const mapEl = document.getElementById('nav-map');
    if (!mapEl) return;

    navMap = L.map('nav-map', {
      zoomControl: false,
      attributionControl: true
    }).setView([route.originLat, route.originLng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(navMap);

    const ambulanceIcon = L.divIcon({
      html: `<div style="font-size:24px;line-height:1;">🚑</div>`,
      className: '',
      iconAnchor: [12, 12]
    });

    L.marker([route.originLat, route.originLng], { icon: ambulanceIcon })
      .addTo(navMap)
      .bindTooltip('You');

    const hospitalIcon = L.divIcon({
      html: `<div style="background:#f5a623;color:#0a0a0a;border-radius:4px;padding:3px 7px;font-size:11px;font-family:monospace;font-weight:700;">🏥 ${route.hospitalName.split(' ').slice(0, 2).join(' ')}</div>`,
      className: '',
      iconAnchor: [40, 15]
    });

    L.marker([route.hospitalLat, route.hospitalLng], { icon: hospitalIcon }).addTo(navMap);
    renderMapRoute();
  }

  function renderMapRoute() {
    if (!navMap) return;
    if (routePolyline) {
      navMap.removeLayer(routePolyline);
    }

    const fallbackPath = [
      [route.originLat, route.originLng],
      [route.hospitalLat, route.hospitalLng]
    ];

    routePolyline = L.polyline(
      route.routeGeometry?.length ? route.routeGeometry : fallbackPath,
      { color: '#f5a623', weight: 5, opacity: 0.85 }
    ).addTo(navMap);

    navMap.fitBounds(routePolyline.getBounds(), { padding: [80, 80] });
  }

  async function hydrateRouteData() {
    if (route.routeGeometry?.length && route.navigationSteps?.length) return;

    try {
      const routeData = await fetchRouteData(
        route.originLat,
        route.originLng,
        route.hospitalLat,
        route.hospitalLng,
        route.hospitalName
      );

      route.routeGeometry = routeData.coordinates;
      route.navigationSteps = routeData.navigationSteps;
      route.distKm = routeData.distanceKm;
      route.etaMin = routeData.durationMin;
      directions = route.navigationSteps;

      setUserScopedValue('activeRoute', route, user);

      setText('dest-dist', kmToMiles(route.distKm));
      setText('dest-time', route.etaMin);
      renderMapRoute();
      renderCurrentStep();
      renderUpcomingSteps();
      updateETA();
    } catch (error) {
      console.warn('Navigation route fetch failed:', error);
    }
  }

  function initMapControls() {
    document.getElementById('center-map-btn')?.addEventListener('click', () => {
      navMap?.setView([route.originLat, route.originLng], 14);
    });

    document.getElementById('zoom-in-btn')?.addEventListener('click', () => navMap?.zoomIn());
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => navMap?.zoomOut());

    document.getElementById('end-route-btn')?.addEventListener('click', () => {
      if (confirm('End this route and return to dashboard?')) {
        clearActiveRoute();
        window.location.href = 'dashboard.html';
      }
    });
  }

  function updateETA() {
    const remaining = Math.max(0, route.etaMin - Math.floor(elapsedSeconds / 60));
    const arrivalTime = new Date(Date.now() + remaining * 60 * 1000);
    const hh = String(arrivalTime.getHours()).padStart(2, '0');
    const mm = String(arrivalTime.getMinutes()).padStart(2, '0');
    setText('nav-eta', `${hh}:${mm}`);
    setText('dest-time', remaining);
  }

  function renderCurrentStep() {
    const step = directions[currentStepIdx];
    if (!step) return;

    setText('turn-arrow', step.arrow);
    setText('nav-street', step.street);
    setText('nav-in', step.dist ? `in ${step.dist}` : '');
  }

  function renderUpcomingSteps() {
    const listEl = document.getElementById('nav-steps-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    const upcoming = directions.slice(currentStepIdx + 1, currentStepIdx + 5);

    if (upcoming.length === 0) {
      const li = document.createElement('li');
      li.className = 'nav-step-item';
      li.innerHTML = `<span class="step-arrow">🏥</span><span>Arriving soon</span>`;
      listEl.appendChild(li);
      return;
    }

    upcoming.forEach((step, idx) => {
      const li = document.createElement('li');
      li.className = `nav-step-item${idx === 0 ? ' nav-step-item--next' : ''}`;
      li.innerHTML = `
        <span class="step-arrow">${step.arrow}</span>
        <span>${step.street}</span>
        <span class="step-dist">${step.dist || ''}</span>
      `;
      listEl.appendChild(li);
    });
  }

  function initHospitalAlert() {
    const callStatus = document.getElementById('nav-hospital-call-status');
    const callDot = document.getElementById('hospital-call-dot');

    setTimeout(() => {
      if (callStatus) callStatus.textContent = 'Alerted - ER preparing';
      if (callDot) {
        callDot.classList.add('alert-dot--done');
        callDot.style.animation = 'none';
      }
    }, 3500);
  }

  function initNetworkAlert() {
    const networkAlert = document.getElementById('network-alert-desc');
    const hospitalUnits = getHospitalById(route.hospitalId)?.inboundUnits || 0;

    if (!networkAlert) return;

    if (hospitalUnits > 0) {
      networkAlert.textContent = `${hospitalUnits} other unit(s) also heading to ${route.hospitalName}`;
      return;
    }

    networkAlert.textContent = `No other units heading to ${route.hospitalName}`;
    const networkCard = document.getElementById('network-alert-card');
    if (networkCard) {
      networkCard.style.borderColor = 'rgba(61,214,140,0.3)';
    }
  }

  function initReroutePrompt() {
    setTimeout(() => {
      if (!rerouted) showReroutePrompt();
    }, 25000);

    document.getElementById('reroute-accept')?.addEventListener('click', () => {
      if (rerouteTimerId) clearInterval(rerouteTimerId);
      acceptReroute();
    });

    document.getElementById('reroute-decline')?.addEventListener('click', () => {
      if (rerouteTimerId) clearInterval(rerouteTimerId);
      rerouted = true;
      const promptEl = document.getElementById('reroute-prompt');
      if (promptEl) promptEl.style.display = 'none';
    });
  }

  function showReroutePrompt() {
    const promptEl = document.getElementById('reroute-prompt');
    const detailEl = document.getElementById('reroute-details');
    const countdownEl = document.getElementById('reroute-countdown');
    if (!promptEl) return;

    if (detailEl) {
      detailEl.textContent = 'Saves approx. 2 min via Wacker Dr - less congestion detected';
    }

    promptEl.style.display = 'block';

    let countdown = 10;
    if (countdownEl) countdownEl.textContent = `Auto in ${countdown}s`;

    rerouteTimerId = setInterval(() => {
      countdown -= 1;
      if (countdownEl) countdownEl.textContent = `Auto in ${countdown}s`;
      if (countdown <= 0) {
        clearInterval(rerouteTimerId);
        acceptReroute();
      }
    }, 1000);
  }

  function acceptReroute() {
    rerouted = true;
    const promptEl = document.getElementById('reroute-prompt');
    if (promptEl) promptEl.style.display = 'none';
    if (rerouteTimerId) clearInterval(rerouteTimerId);

    const trafficCard = document.getElementById('traffic-alert-card');
    const trafficDesc = document.getElementById('traffic-alert-desc');
    if (trafficCard) {
      trafficCard.style.display = 'flex';
      if (trafficDesc) trafficDesc.textContent = 'Rerouted via Wacker Dr - saving ~2 min';
    }

    route.etaMin = Math.max(1, route.etaMin - 2);
    updateETA();
  }

  function showArrived() {
    const overlay = document.getElementById('arrived-overlay');
    if (overlay) overlay.style.display = 'flex';

    setText('arrived-hospital-name', route.hospitalName);
    setText('arr-time', `${route.etaMin} min`);
    setText('arr-saved', `${(Math.random() * 2 + 1).toFixed(1)} min`);

    saveRouteToHistory();
    clearActiveRoute();
  }

  function saveRouteToHistory() {
    const history = getUserScopedValue('routeHistory', user) || [];
    const newEntry = {
      id: `r${Date.now()}`,
      date: new Date().toLocaleString('sv').slice(0, 16),
      injury: route.injury || 'Not specified',
      severity: route.severity || 3,
      hospital: route.hospitalName,
      hospitalId: route.hospitalId,
      durationMin: route.etaMin,
      savedMin: parseFloat((Math.random() * 3 + 0.5).toFixed(1)),
      patients: route.patients || 1,
      erWaitOnArrival: getHospitalById(route.hospitalId)?.erWaitMinutes || 15,
      notes: route.notes || '',
      originLat: route.originLat,
      originLng: route.originLng,
      routeGeometry: route.routeGeometry || null,
      navigationSteps: route.navigationSteps || null
    };

    history.unshift(newEntry);
    setUserScopedValue('routeHistory', history, user);
  }

  function clearActiveRoute() {
    removeUserScopedValue('activeRoute', user);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value ?? '';
    }
  }
});
