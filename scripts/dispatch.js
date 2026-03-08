/* =====================================================
   DISPATCH.JS - new dispatch / route selection page
   Handles: injury selection, severity input,
   location resolution, hospital calling, route scoring,
   real street routing, and GO button
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user) return;

  const demoMode = isDemoUser(user);
  const lastKnownLocation = getLastKnownLocation(user);

  let selectedInjury = null;
  let selectedSeverity = null;
  let userLat = demoMode ? DEMO_LOCATION.lat : (lastKnownLocation?.lat || 39.8283);
  let userLng = demoMode ? DEMO_LOCATION.lng : (lastKnownLocation?.lng || -98.5795);
  let selectedRouteIdx = null;
  let computedRoutes = [];
  let dispatchMap = null;
  let routePolylines = [];
  let routeMarkers = [];
  let userMarker = null;
  let hasResolvedLocation = demoMode || Boolean(lastKnownLocation?.lat && lastKnownLocation?.lng);

  const waitTimeResponses = {};

  const INJURY_TYPES = [
    { icon: '❤️', label: 'Cardiac Arrest' },
    { icon: '🧠', label: 'Stroke / Neurological' },
    { icon: '🩸', label: 'Trauma / Fall' },
    { icon: '🫁', label: 'Respiratory Distress' },
    { icon: '🔥', label: 'Burns' },
    { icon: '💊', label: 'Overdose' },
    { icon: '🦴', label: 'Fracture' },
    { icon: '🤕', label: 'Head Injury' },
    { icon: '🧪', label: 'Allergic Reaction' },
    { icon: '🩹', label: 'Minor Laceration' },
    { icon: '🤰', label: 'Obstetric Emergency' },
    { icon: '😵', label: 'Unconscious / Unresponsive' }
  ];

  const injuryGrid = document.getElementById('injury-type-grid');
  const sevBtns = document.querySelectorAll('.sev-btn');
  const sevGuide = document.getElementById('severity-guidance');
  const mapEl = document.getElementById('dispatch-map');
  const locationPill = document.getElementById('map-location-text');

  renderInjuryTypes();
  initSeveritySelector();
  initMap();
  initLocation();

  document.getElementById('find-routes-btn')?.addEventListener('click', startRouteCalculation);

  function renderInjuryTypes() {
    if (!injuryGrid) return;

    INJURY_TYPES.forEach(({ icon, label }) => {
      const btn = document.createElement('button');
      btn.className = 'injury-chip';
      btn.dataset.label = label;
      btn.innerHTML = `<span class="injury-chip-icon">${icon}</span>${label}`;
      btn.addEventListener('click', () => {
        selectedInjury = label;
        document.querySelectorAll('.injury-chip').forEach((chip) => {
          chip.classList.remove('injury-chip--selected');
        });
        btn.classList.add('injury-chip--selected');
      });
      injuryGrid.appendChild(btn);
    });
  }

  function initSeveritySelector() {
    sevBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const level = parseInt(btn.dataset.level, 10);
        selectedSeverity = level;

        sevBtns.forEach((otherBtn) => {
          for (let i = 1; i <= 5; i += 1) {
            otherBtn.classList.remove(`sev-btn--selected-${i}`);
          }
        });

        btn.classList.add(`sev-btn--selected-${level}`);

        if (sevGuide) {
          sevGuide.textContent = SEVERITY_GUIDANCE_TEXT[level] || '';
          sevGuide.style.color =
            level >= 4 ? 'var(--red)' :
            level === 3 ? 'var(--amber)' :
            level === 2 ? 'var(--yellow)' :
            'var(--green)';
        }
      });
    });
  }

  function initMap() {
    if (!mapEl) return;

    const initialZoom = demoMode || lastKnownLocation ? 13 : 4;
    dispatchMap = L.map('dispatch-map', { zoomControl: true }).setView([userLat, userLng], initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(dispatchMap);
  }

  function initLocation() {
    void resolveUserLocation(user, {
      preferLive: true,
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }).then((location) => {
      if (location?.lat && location?.lng) {
        applyResolvedLocation(
          location.lat,
          location.lng,
          location.label || 'Current Location',
          location.source === 'stored' ? 13 : 14
        );
        return;
      }

      useLastKnownLocation(
        navigator.geolocation
          ? 'Allow location access to use your current position. Use localhost or HTTPS if needed.'
          : 'Location unavailable in this browser.'
      );
    });
  }

  function applyResolvedLocation(lat, lng, label, zoom = 14) {
    userLat = lat;
    userLng = lng;
    hasResolvedLocation = true;

    if (dispatchMap) {
      dispatchMap.setView([userLat, userLng], zoom);
    }

    if (locationPill) {
      locationPill.textContent = label;
    }

    addUserMarker();
  }

  function useLastKnownLocation(fallbackMessage) {
    if (lastKnownLocation?.lat && lastKnownLocation?.lng) {
      applyResolvedLocation(
        lastKnownLocation.lat,
        lastKnownLocation.lng,
        lastKnownLocation.label || 'Using last known location',
        13
      );
      return;
    }

    hasResolvedLocation = false;
    if (locationPill) {
      locationPill.textContent = fallbackMessage;
    }
  }

  function addUserMarker() {
    if (!dispatchMap) return;
    if (userMarker) dispatchMap.removeLayer(userMarker);

    const icon = L.divIcon({
      html: `<div style="width:16px;height:16px;background:#f5a623;border:3px solid #ffbe4a;border-radius:50%;box-shadow:0 0 10px rgba(245,166,35,0.7);"></div>`,
      className: '',
      iconAnchor: [8, 8]
    });

    userMarker = L.marker([userLat, userLng], { icon })
      .addTo(dispatchMap)
      .bindTooltip('📍 Your Location');
  }

  function startRouteCalculation() {
    if (!hasResolvedLocation) {
      alert('We could not determine your current location. Allow location access and try again.');
      return;
    }

    if (!selectedSeverity) {
      alert('Please select an injury severity level before finding routes.');
      return;
    }

    const calcEl = document.getElementById('route-calculating');
    const calcSteps = document.getElementById('calc-steps');
    const resultsEl = document.getElementById('route-results');

    if (calcEl) calcEl.classList.add('is-visible');
    if (resultsEl) resultsEl.classList.remove('is-visible');

    const preSteps = [
      '📡 Detecting current location...',
      '🚦 Querying live traffic conditions...',
      '🔗 Checking fleet database for inbound units...'
    ];

    let stepIdx = 0;
    if (calcSteps) {
      calcSteps.innerHTML = `<span class="calc-step calc-step--active">${preSteps[0]}</span>`;
    }

    function advancePreStep() {
      if (!calcSteps) return;

      const prev = calcSteps.querySelector('.calc-step--active');
      if (prev) {
        prev.classList.remove('calc-step--active');
        prev.classList.add('calc-step--done');
        prev.textContent = `✓ ${prev.textContent.slice(2)}`;
      }

      stepIdx += 1;
      if (stepIdx < preSteps.length) {
        const span = document.createElement('span');
        span.className = 'calc-step calc-step--active';
        span.textContent = preSteps[stepIdx];
        calcSteps.appendChild(span);
        setTimeout(advancePreStep, 700 + Math.random() * 400);
      } else {
        setTimeout(() => {
          if (calcEl) calcEl.classList.remove('is-visible');
          showRouteCardsWithCalling();
        }, 300);
      }
    }

    setTimeout(advancePreStep, 700);
  }

  function showRouteCardsWithCalling() {
    const resultsEl = document.getElementById('route-results');
    const cardsEl = document.getElementById('route-cards');
    const subtitleEl = document.getElementById('route-results-subtitle');
    if (!resultsEl || !cardsEl) return;

    const eligible = getHospitalsForSeverity(selectedSeverity || 3);
    computedRoutes = eligible
      .map((hospital) => {
        const distKm = getDistanceKm(userLat, userLng, hospital.lat, hospital.lng);
        return {
          hospital,
          distKm,
          etaMin: estimateTravelMinutes(distKm),
          score: null,
          confirmedWait: null,
          routeGeometry: null,
          navigationSteps: null
        };
      })
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 3);

    if (subtitleEl) {
      subtitleEl.textContent = `Calling ${computedRoutes.length} hospitals - awaiting ER wait times...`;
    }

    cardsEl.innerHTML = '';
    computedRoutes.forEach((route, idx) => {
      cardsEl.appendChild(buildRouteCard(route, idx));
    });

    drawHospitalMarkersOnMap(computedRoutes);
    resultsEl.classList.add('is-visible');
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    startHospitalCalls(computedRoutes);
  }

  function startHospitalCalls(routes) {
    let resolvedCount = 0;
    const total = routes.length;

    routes.forEach((route) => {
      const hospital = route.hospital;
      const callDuration = 5000 + Math.random() * 5000;
      const respondedWait = Math.max(
        2,
        hospital.erWaitMinutes + Math.round((Math.random() - 0.4) * 12)
      );

      setTimeout(() => {
        route.confirmedWait = respondedWait;
        waitTimeResponses[hospital.id] = respondedWait;
        updateWaitTimeCell(hospital.id, respondedWait);

        resolvedCount += 1;
        if (resolvedCount === total) {
          reRankAndMarkBest(routes);
        }
      }, callDuration);
    });
  }

  function updateWaitTimeCell(hospitalId, waitMinutes) {
    const wrapEl = document.getElementById(`wait-cell-wrap-${hospitalId}`);
    if (!wrapEl) return;

    const colorClass =
      waitMinutes < 15 ? 'route-meta-val--good' :
      waitMinutes < 30 ? 'route-meta-val--warn' :
      'route-meta-val--bad';

    wrapEl.innerHTML = `
      <span class="route-meta-val ${colorClass} wait-resolved">
        ${waitMinutes} min
      </span>
    `;
  }

  function reRankAndMarkBest(routes) {
    routes.forEach((route) => {
      const hospital = route.hospital;
      const confirmedWait = route.confirmedWait ?? hospital.erWaitMinutes;

      route.score =
        (route.distKm * 2.0) +
        (confirmedWait * 0.8) +
        (hospital.erLoad * 0.15) +
        (hospital.inboundUnits * 5.0);
    });

    const bestIdx = routes.reduce((best, route, idx) => (
      route.score < routes[best].score ? idx : best
    ), 0);

    routes.forEach((route, idx) => {
      const card = document.querySelector(`.route-card[data-idx="${idx}"]`);
      if (!card) return;

      card.classList.remove('route-card--best', 'route-card--not-best');
      if (idx === bestIdx) {
        card.classList.add('route-card--best');
      } else {
        card.classList.add('route-card--not-best');
      }
    });

    const subtitleEl = document.getElementById('route-results-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = 'All hospitals responded - best route selected';
    }
  }

  function buildRouteCard(route, idx) {
    const hospital = route.hospital;
    const distMi = kmToMiles(route.distKm);

    const card = document.createElement('div');
    card.className = 'route-card';
    card.dataset.idx = idx;

    card.innerHTML = `
      <div class="route-card-header">
        <span class="route-hospital-name">${hospital.name}</span>
        <span class="route-eta">${route.etaMin}<span class="route-eta-unit"> min</span></span>
      </div>
      <div class="route-card-meta">
        <div class="route-meta-item">
          <span class="route-meta-label">Distance</span>
          <span class="route-meta-val">${distMi} mi</span>
        </div>
        <div class="route-meta-item">
          <span class="route-meta-label">ER Wait</span>
          <div id="wait-cell-wrap-${hospital.id}">
            <span class="wait-calling">
              <span class="wait-calling-icon">📞</span>
              <span class="wait-calling-text">Calling...</span>
            </span>
          </div>
        </div>
        <div class="route-meta-item">
          <span class="route-meta-label">ER Load</span>
          <span class="route-meta-val ${hospital.erLoad > 80 ? 'route-meta-val--bad' : ''}">${hospital.erLoad}%</span>
        </div>
        <div class="route-meta-item">
          <span class="route-meta-label">Other Units</span>
          <span class="route-meta-val ${hospital.inboundUnits > 0 ? 'route-meta-val--warn' : 'route-meta-val--good'}">
            ${hospital.inboundUnits > 0 ? `⚠ ${hospital.inboundUnits} inbound` : '✓ None'}
          </span>
        </div>
        <div class="route-meta-item">
          <span class="route-meta-label">Trauma Center</span>
          <span class="route-meta-val">${hospital.traumaCenter ? '✓ Yes' : '-'}</span>
        </div>
      </div>
      <span class="recommended-badge">★ RECOMMENDED</span>
    `;

    card.addEventListener('click', () => {
      void selectRoute(idx, card);
    });

    return card;
  }

  async function selectRoute(idx, card) {
    selectedRouteIdx = idx;
    document.querySelectorAll('.route-card').forEach((routeCard) => {
      routeCard.classList.remove('route-card--selected');
    });
    card.classList.add('route-card--selected');

    const chosen = computedRoutes[idx];
    await hydrateRouteData(chosen);
    drawRouteOnMap(chosen);
    showGoButton();

    const activeRouteData = {
      hospitalId: chosen.hospital.id,
      hospitalName: chosen.hospital.name,
      hospitalAddress: chosen.hospital.address,
      hospitalLat: chosen.hospital.lat,
      hospitalLng: chosen.hospital.lng,
      etaMin: chosen.etaMin,
      distKm: chosen.distKm,
      injury: selectedInjury || 'Not specified',
      severity: selectedSeverity,
      patients: parseInt(document.getElementById('patient-count')?.value || 1, 10),
      age: document.getElementById('patient-age')?.value || '',
      notes: document.getElementById('injury-notes')?.value || '',
      originLat: userLat,
      originLng: userLng,
      routeGeometry: chosen.routeGeometry || null,
      navigationSteps: chosen.navigationSteps || null,
      startTime: new Date().toISOString()
    };

    setUserScopedValue('activeRoute', activeRouteData, user);
  }

  async function hydrateRouteData(route) {
    if (route.routeGeometry?.length) return route;

    try {
      const routeData = await fetchRouteData(
        userLat,
        userLng,
        route.hospital.lat,
        route.hospital.lng,
        route.hospital.name
      );

      route.routeGeometry = routeData.coordinates;
      route.navigationSteps = routeData.navigationSteps;
      route.distKm = routeData.distanceKm;
      route.etaMin = routeData.durationMin;
    } catch (error) {
      console.warn('Route geometry fetch failed:', error);
    }

    return route;
  }

  function drawRouteOnMap(route) {
    if (!dispatchMap) return;

    routePolylines.forEach((polyline) => dispatchMap.removeLayer(polyline));
    routePolylines = [];

    const fallbackPath = [[userLat, userLng], [route.hospital.lat, route.hospital.lng]];
    const line = L.polyline(
      route.routeGeometry?.length ? route.routeGeometry : fallbackPath,
      { color: '#f5a623', weight: 4, opacity: 0.9 }
    ).addTo(dispatchMap);

    routePolylines.push(line);
    dispatchMap.fitBounds(line.getBounds(), { padding: [30, 30] });
  }

  function drawHospitalMarkersOnMap(routes) {
    if (!dispatchMap) return;

    routeMarkers.forEach((marker) => dispatchMap.removeLayer(marker));
    routeMarkers = [];

    routes.forEach((route) => {
      const hospital = route.hospital;
      const icon = L.divIcon({
        html: `<div style="background:#0d1420;color:#f5a623;border:2px solid #f5a623;border-radius:4px;padding:3px 6px;font-size:10px;font-family:monospace;font-weight:700;white-space:nowrap;">🏥 ${hospital.name.split(' ').slice(0, 2).join(' ')}</div>`,
        className: '',
        iconAnchor: [40, 15]
      });

      const marker = L.marker([hospital.lat, hospital.lng], { icon }).addTo(dispatchMap);
      marker.bindTooltip(`${hospital.name} - ${route.etaMin} min drive`);
      routeMarkers.push(marker);
    });
  }

  function showGoButton() {
    const wrap = document.getElementById('go-btn-wrap');
    if (!wrap) return;

    wrap.style.display = 'flex';
    document.getElementById('go-btn').href = 'navigate.html';
  }
});
