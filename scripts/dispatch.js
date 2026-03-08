/* =====================================================
   DISPATCH.JS — new dispatch / route selection page
   Handles: injury selection, severity input,
   geolocation, hospital calling (5-10s per hospital),
   live wait-time updates, route scoring, GO button
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {

  const user = getCurrentUser();
  if (!user) return;

  // ── State ──────────────────────────────────────────────
  let selectedInjury   = null;
  let selectedSeverity = null;
  let userLat  = 41.8827;   // default: Chicago loop
  let userLng  = -87.6233;
  let selectedRouteIdx = null;
  let computedRoutes   = [];
  let dispatchMap      = null;
  let routePolylines   = [];

  // Tracks confirmed wait times from hospital callbacks
  // key = hospital id, value = responded wait time in minutes
  const waitTimeResponses = {};


  // ── Injury type chips ──────────────────────────────────
  const INJURY_TYPES = [
    { icon: '❤️',  label: 'Cardiac Arrest' },
    { icon: '🧠',  label: 'Stroke / Neurological' },
    { icon: '🩸',  label: 'Trauma / Fall' },
    { icon: '🫁',  label: 'Respiratory Distress' },
    { icon: '🔥',  label: 'Burns' },
    { icon: '💊',  label: 'Overdose' },
    { icon: '🦴',  label: 'Fracture' },
    { icon: '🤕',  label: 'Head Injury' },
    { icon: '🧪',  label: 'Allergic Reaction' },
    { icon: '🩹',  label: 'Minor Laceration' },
    { icon: '🤰',  label: 'Obstetric Emergency' },
    { icon: '😵',  label: 'Unconscious / Unresponsive' }
  ];

  const injuryGrid = document.getElementById('injury-type-grid');
  if (injuryGrid) {
    INJURY_TYPES.forEach(({ icon, label }) => {
      const btn = document.createElement('button');
      btn.className = 'injury-chip';
      btn.dataset.label = label;
      btn.innerHTML = `<span class="injury-chip-icon">${icon}</span>${label}`;
      btn.addEventListener('click', () => selectInjury(label, btn));
      injuryGrid.appendChild(btn);
    });
  }

  function selectInjury(label, btn) {
    selectedInjury = label;
    document.querySelectorAll('.injury-chip').forEach(c => c.classList.remove('injury-chip--selected'));
    btn.classList.add('injury-chip--selected');
  }


  // ── Severity scale ─────────────────────────────────────
  const sevBtns  = document.querySelectorAll('.sev-btn');
  const sevGuide = document.getElementById('severity-guidance');

  sevBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const level = parseInt(btn.dataset.level);
      selectedSeverity = level;
      sevBtns.forEach(b => { for (let i = 1; i <= 5; i++) b.classList.remove(`sev-btn--selected-${i}`); });
      btn.classList.add(`sev-btn--selected-${level}`);
      if (sevGuide) {
        sevGuide.textContent = SEVERITY_GUIDANCE_TEXT[level] || '';
        sevGuide.style.color = level >= 4 ? 'var(--red)' :
                               level === 3 ? 'var(--amber)' :
                               level === 2 ? 'var(--yellow)' : 'var(--green)';
      }
    });
  });


  // ── Leaflet map ────────────────────────────────────────
  const mapEl = document.getElementById('dispatch-map');
  if (mapEl) {
    dispatchMap = L.map('dispatch-map', { zoomControl: true }).setView([userLat, userLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 18
    }).addTo(dispatchMap);
  }

  const locationPill = document.getElementById('map-location-text');
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        if (dispatchMap) { dispatchMap.setView([userLat, userLng], 14); addUserMarker(); }
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json`)
          .then(r => r.json())
          .then(data => {
            const addr = data.display_name?.split(',').slice(0, 3).join(', ') || 'Current Location';
            if (locationPill) locationPill.textContent = addr;
          })
          .catch(() => { if (locationPill) locationPill.textContent = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`; });
      },
      () => {
        if (locationPill) locationPill.textContent = '📍 Default: Chicago Loop';
        addUserMarker();
      }
    );
  } else {
    if (locationPill) locationPill.textContent = 'Location unavailable';
    addUserMarker();
  }

  let userMarker = null;
  function addUserMarker() {
    if (!dispatchMap) return;
    if (userMarker) dispatchMap.removeLayer(userMarker);
    const icon = L.divIcon({
      html: `<div style="width:16px;height:16px;background:#f5a623;border:3px solid #ffbe4a;
                         border-radius:50%;box-shadow:0 0 10px rgba(245,166,35,0.7);"></div>`,
      className: '', iconAnchor: [8, 8]
    });
    userMarker = L.marker([userLat, userLng], { icon }).addTo(dispatchMap).bindTooltip('📍 Your Location');
  }


  // ── Find Routes button ─────────────────────────────────
  document.getElementById('find-routes-btn')?.addEventListener('click', startRouteCalculation);

  function startRouteCalculation() {
    if (!selectedSeverity) {
      alert('Please select an injury severity level before finding routes.');
      return;
    }

    const calcEl    = document.getElementById('route-calculating');
    const calcSteps = document.getElementById('calc-steps');
    const resultsEl = document.getElementById('route-results');

    if (calcEl) calcEl.classList.add('is-visible');
    if (resultsEl) resultsEl.classList.remove('is-visible');

    // These 3 pre-steps run before the cards appear (each ~700-1100ms)
    const preSteps = [
      '📡 Detecting current location...',
      '🚦 Querying live traffic conditions...',
      '🔗 Checking fleet database for inbound units...',
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
        prev.textContent = '✓ ' + prev.textContent.slice(2);
      }
      stepIdx++;
      if (stepIdx < preSteps.length) {
        const span = document.createElement('span');
        span.className = 'calc-step calc-step--active';
        span.textContent = preSteps[stepIdx];
        calcSteps.appendChild(span);
        setTimeout(advancePreStep, 700 + Math.random() * 400);
      } else {
        // Pre-steps done — show cards in calling state and begin the actual calls
        setTimeout(() => {
          if (calcEl) calcEl.classList.remove('is-visible');
          showRouteCardsWithCalling();
        }, 300);
      }
    }
    setTimeout(advancePreStep, 700);
  }


  // ── Show route cards immediately with "Calling..." state ──
  // Cards render right away with a phone spinner in the Wait Time cell.
  // As each hospital responds (5-10s), the cell updates live.
  // When ALL hospitals respond, we re-rank and light up the winner.
  function showRouteCardsWithCalling() {
    const resultsEl  = document.getElementById('route-results');
    const cardsEl    = document.getElementById('route-cards');
    const subtitleEl = document.getElementById('route-results-subtitle');
    if (!resultsEl || !cardsEl) return;

    // Build the initial route list sorted by distance only
    // (real scoring happens after wait times come back)
    const eligible = getHospitalsForSeverity(selectedSeverity || 3);
    computedRoutes = eligible
      .map(h => ({
        hospital:      h,
        distKm:        getDistanceKm(userLat, userLng, h.lat, h.lng),
        etaMin:        estimateTravelMinutes(getDistanceKm(userLat, userLng, h.lat, h.lng)),
        score:         null,
        confirmedWait: null
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 3);

    if (subtitleEl) {
      subtitleEl.textContent = `Calling ${computedRoutes.length} hospitals — awaiting ER wait times...`;
    }

    // Render all cards with calling spinner in the wait cell
    cardsEl.innerHTML = '';
    computedRoutes.forEach((route, idx) => {
      cardsEl.appendChild(buildRouteCard(route, idx));
    });

    drawHospitalMarkersOnMap(computedRoutes);
    resultsEl.classList.add('is-visible');
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Fire off the hospital calls — each resolves independently in 5-10 seconds
    startHospitalCalls(computedRoutes);
  }


  // ── Hospital calling logic ─────────────────────────────
  // Each hospital is called concurrently and resolves at a random time
  // between 5 and 10 seconds (as specified). When all resolve, we re-rank.
  function startHospitalCalls(routes) {
    let resolvedCount = 0;
    const total = routes.length;

    routes.forEach(route => {
      const h = route.hospital;

      // Call duration: exactly 5000ms to 10000ms random
      const callDuration = 5000 + Math.random() * 5000;

      // The hospital responds with a wait time with some random variance
      // from the base value (reflects real-world unpredictability)
      const respondedWait = Math.max(2, h.erWaitMinutes + Math.round((Math.random() - 0.4) * 12));

      setTimeout(() => {
        // Store the confirmed response
        route.confirmedWait = respondedWait;
        waitTimeResponses[h.id] = respondedWait;

        // Update just the wait-time cell on the card — no full re-render
        updateWaitTimeCell(h.id, respondedWait);

        resolvedCount++;
        if (resolvedCount === total) {
          // All hospitals have responded — now we can pick the real winner
          reRankAndMarkBest(routes);
        }
      }, callDuration);
    });
  }


  // Updates the wait time cell on a card from "Calling..." to the actual number
  function updateWaitTimeCell(hospitalId, waitMinutes) {
    const wrapEl = document.getElementById(`wait-cell-wrap-${hospitalId}`);
    if (!wrapEl) return;

    const colorClass = waitMinutes < 15 ? 'route-meta-val--good' :
                       waitMinutes < 30 ? 'route-meta-val--warn' : 'route-meta-val--bad';

    // Replace the spinner HTML with the confirmed number + a flash-in animation
    wrapEl.innerHTML = `
      <span class="route-meta-val ${colorClass} wait-resolved">
        ${waitMinutes} min
      </span>
    `;
  }


  // After all calls resolve: score every route using the confirmed wait times,
  // find the winner, add amber highlight to it, and darken the others.
  function reRankAndMarkBest(routes) {
    routes.forEach(route => {
      const h = route.hospital;
      const confirmedWait = route.confirmedWait ?? h.erWaitMinutes;

      // Scoring formula:
      //   travel distance (km)  × 2.0   — most important factor
      //   confirmed ER wait (min) × 0.8  — second most important
      //   ER load %               × 0.15 — tiebreaker
      //   inbound fleet units     × 5.0  — penalty for crowding same hospital
      route.score = (route.distKm * 2.0)
                  + (confirmedWait * 0.8)
                  + (h.erLoad * 0.15)
                  + (h.inboundUnits * 5.0);
    });

    // Lowest score wins
    const bestIdx = routes.reduce((best, r, i) => r.score < routes[best].score ? i : best, 0);

    // Apply visual state to all cards
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

    // Update subtitle
    const subtitleEl = document.getElementById('route-results-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = `All hospitals responded — best route selected`;
    }
  }


  // ── Build a single route card ──────────────────────────
  // Starts with a "Calling..." spinner in the ER Wait cell.
  // The badge (.recommended-badge) is hidden by CSS until
  // route-card--best is applied, then appears bottom-right.
  function buildRouteCard(route, idx) {
    const { hospital: h, distKm, etaMin } = route;
    const distMi = kmToMiles(distKm);

    const card = document.createElement('div');
    card.className = 'route-card';  // best/not-best added later by reRankAndMarkBest
    card.dataset.idx = idx;

    card.innerHTML = `
      <div class="route-card-header">
        <span class="route-hospital-name">${h.name}</span>
        <span class="route-eta">${etaMin}<span class="route-eta-unit"> min</span></span>
      </div>
      <div class="route-card-meta">
        <div class="route-meta-item">
          <span class="route-meta-label">Distance</span>
          <span class="route-meta-val">${distMi} mi</span>
        </div>
        <div class="route-meta-item">
          <span class="route-meta-label">ER Wait</span>
          <div id="wait-cell-wrap-${h.id}">
            <span class="wait-calling">
              <span class="wait-calling-icon">📞</span>
              <span class="wait-calling-text">Calling...</span>
            </span>
          </div>
        </div>
        <div class="route-meta-item">
          <span class="route-meta-label">ER Load</span>
          <span class="route-meta-val ${h.erLoad > 80 ? 'route-meta-val--bad' : ''}">${h.erLoad}%</span>
        </div>
        <div class="route-meta-item">
          <span class="route-meta-label">Other Units</span>
          <span class="route-meta-val ${h.inboundUnits > 0 ? 'route-meta-val--warn' : 'route-meta-val--good'}">
            ${h.inboundUnits > 0 ? `⚠ ${h.inboundUnits} inbound` : '✓ None'}
          </span>
        </div>
        <div class="route-meta-item">
          <span class="route-meta-label">Trauma Center</span>
          <span class="route-meta-val">${h.traumaCenter ? '✓ Yes' : '—'}</span>
        </div>
      </div>
      <!-- This badge is hidden by default and only shown when route-card--best is active -->
      <span class="recommended-badge">★ RECOMMENDED</span>
    `;

    card.addEventListener('click', () => selectRoute(idx, card));
    return card;
  }


  // ── Select a route ─────────────────────────────────────
  function selectRoute(idx, card) {
    selectedRouteIdx = idx;
    document.querySelectorAll('.route-card').forEach(c => c.classList.remove('route-card--selected'));
    card.classList.add('route-card--selected');

    const chosen = computedRoutes[idx];
    drawRouteOnMap(chosen);
    showGoButton(chosen);

    DB.set('activeRoute', {
      hospitalId:      chosen.hospital.id,
      hospitalName:    chosen.hospital.name,
      hospitalAddress: chosen.hospital.address,
      hospitalLat:     chosen.hospital.lat,
      hospitalLng:     chosen.hospital.lng,
      etaMin:          chosen.etaMin,
      distKm:          chosen.distKm,
      injury:          selectedInjury || 'Not specified',
      severity:        selectedSeverity,
      patients:        parseInt(document.getElementById('patient-count')?.value || 1),
      age:             document.getElementById('patient-age')?.value || '',
      notes:           document.getElementById('injury-notes')?.value || '',
      originLat:       userLat,
      originLng:       userLng,
      startTime:       new Date().toISOString()
    });
  }


  // ── Draw route polyline on the map ─────────────────────
  function drawRouteOnMap(route) {
    if (!dispatchMap) return;
    routePolylines.forEach(p => dispatchMap.removeLayer(p));
    routePolylines = [];

    const dest   = route.hospital;
    const midLat = (userLat + dest.lat) / 2 + 0.005;
    const midLng = (userLng + dest.lng) / 2 + 0.008;

    const line = L.polyline(
      [[userLat, userLng], [midLat, midLng], [dest.lat, dest.lng]],
      { color: '#f5a623', weight: 4, opacity: 0.85, dashArray: '8 6' }
    ).addTo(dispatchMap);

    routePolylines.push(line);
    dispatchMap.fitBounds(line.getBounds(), { padding: [30, 30] });
  }


  // ── Draw hospital markers on map ───────────────────────
  function drawHospitalMarkersOnMap(routes) {
    if (!dispatchMap) return;
    routes.forEach(route => {
      const h = route.hospital;
      const icon = L.divIcon({
        html: `<div style="background:#0d1420;color:#f5a623;border:2px solid #f5a623;
                           border-radius:4px;padding:3px 6px;font-size:10px;
                           font-family:monospace;font-weight:700;white-space:nowrap;">
                 🏥 ${h.name.split(' ').slice(0, 2).join(' ')}
               </div>`,
        className: '', iconAnchor: [40, 15]
      });
      L.marker([h.lat, h.lng], { icon }).addTo(dispatchMap)
        .bindTooltip(`${h.name} — ${route.etaMin} min drive`);
    });
  }


  // ── Show GO button ─────────────────────────────────────
  function showGoButton() {
    const wrap = document.getElementById('go-btn-wrap');
    if (!wrap) return;
    wrap.style.display = 'flex';
    document.getElementById('go-btn').href = 'navigate.html';
  }

});