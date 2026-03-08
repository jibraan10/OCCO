/* =====================================================
   SHARED.JS — utilities used across all app pages
   Handles: auth guard, live clock, sidebar toggle,
   logout, and the shared in-memory "database"
   ===================================================== */


// ── In-memory database ──────────────────────────────────
// This simulates the backend database layer described in the spec.
// In production this would be replaced with real API calls.
// We use localStorage so data persists across page navigations
// within the same browser session.

const DB = {

  // Save a value to localStorage with a namespace prefix
  set(key, value) {
    try {
      localStorage.setItem(`clearpath_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn('DB.set failed:', e);
    }
  },

  // Retrieve a value from localStorage
  get(key) {
    try {
      const raw = localStorage.getItem(`clearpath_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('DB.get failed:', e);
      return null;
    }
  },

  // Remove a value from localStorage
  remove(key) {
    localStorage.removeItem(`clearpath_${key}`);
  }
};


// ── Mock user session ────────────────────────────────────
// Returns the currently logged-in user object or null
function getCurrentUser() {
  return DB.get('currentUser');
}

const DEMO_EMAIL = 'demo@occo.ems';
const DEMO_LOCATION = {
  lat: 41.8827,
  lng: -87.6233,
  label: 'Demo mode: Chicago, IL'
};

function isDemoUser(user) {
  return user?.email?.toLowerCase() === DEMO_EMAIL;
}

function getUserScopedKey(key, user = getCurrentUser()) {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return key;

  const safeEmail = email.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${key}_${safeEmail}`;
}

function getUserScopedValue(key, user = getCurrentUser()) {
  return DB.get(getUserScopedKey(key, user));
}

function setUserScopedValue(key, value, user = getCurrentUser()) {
  DB.set(getUserScopedKey(key, user), value);
  return value;
}

function removeUserScopedValue(key, user = getCurrentUser()) {
  const scopedKey = getUserScopedKey(key, user);
  DB.remove(scopedKey);

  // Remove the legacy global key as part of the migration path.
  if (scopedKey !== key) {
    DB.remove(key);
  }
}

function getLastKnownLocation(user = getCurrentUser()) {
  return getUserScopedValue('lastKnownLocation', user);
}

function saveLastKnownLocation(location, user = getCurrentUser()) {
  return setUserScopedValue('lastKnownLocation', location, user);
}

async function reverseGeocodeLocation(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    );
    const data = await response.json();
    return data.display_name?.split(',').slice(0, 3).join(', ') || 'Current Location';
  } catch (error) {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

function resolveUserLocation(user = getCurrentUser(), options = {}) {
  const storedLocation = getLastKnownLocation(user);
  const {
    preferLive = true,
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 30000
  } = options;

  if (isDemoUser(user)) {
    return Promise.resolve({
      ...DEMO_LOCATION,
      timestamp: Date.now(),
      source: 'demo'
    });
  }

  if (!preferLive && storedLocation?.lat && storedLocation?.lng) {
    return Promise.resolve({
      ...storedLocation,
      source: 'stored'
    });
  }

  if (!navigator.geolocation) {
    return Promise.resolve(
      storedLocation?.lat && storedLocation?.lng
        ? { ...storedLocation, source: 'stored' }
        : null
    );
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const label = await reverseGeocodeLocation(lat, lng);
        const location = {
          lat,
          lng,
          label,
          timestamp: Date.now()
        };

        saveLastKnownLocation(location, user);
        resolve({
          ...location,
          source: 'live'
        });
      },
      () => {
        resolve(
          storedLocation?.lat && storedLocation?.lng
            ? { ...storedLocation, source: 'stored' }
            : null
        );
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge
      }
    );
  });
}

// Checks if a user is logged in — redirects to auth if not.
// Call this at the top of every app page.
function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'auth.html';
    return null;
  }
  return user;
}

// Fill in all the sidebar/topbar elements with the current user's data
function populateUserUI(user) {
  if (!user) return;

  // Sidebar unit & department name
  const sidebarUnit = document.getElementById('sidebar-unit-name');
  const sidebarDept = document.getElementById('sidebar-dept');
  if (sidebarUnit) sidebarUnit.textContent = user.unit || 'Unit —';
  if (sidebarDept) sidebarDept.textContent = user.department || '';

  // Topbar avatar initials
  const avatar = document.getElementById('topbar-avatar');
  if (avatar) {
    const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('');
    avatar.textContent = initials || '?';
  }
}


// ── Live clock in topbar ─────────────────────────────────
// Updates the topbar clock every second
function startClock() {
  const el = document.getElementById('topbar-time');
  if (!el) return;

  function tick() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${hh}:${mm}:${ss}`;
  }

  tick(); // run immediately so there's no 1-second blank
  setInterval(tick, 1000);
}


// ── Network units count ──────────────────────────────────
// Simulates a fluctuating live unit count (±2 every few seconds)
function startNetworkCounter() {
  const el = document.getElementById('network-units-count');
  if (!el) return;

  let baseCount = 47;

  setInterval(() => {
    const delta = Math.floor(Math.random() * 5) - 2; // -2 to +2
    baseCount = Math.max(30, Math.min(60, baseCount + delta));
    el.textContent = baseCount;
  }, 6000);
}


// ── Sidebar mobile toggle ────────────────────────────────
function initSidebarToggle() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar--open');
  });

  // tap outside sidebar to close it on mobile
  document.addEventListener('click', (e) => {
    if (
      sidebar.classList.contains('sidebar--open') &&
      !sidebar.contains(e.target) &&
      e.target !== toggle
    ) {
      sidebar.classList.remove('sidebar--open');
    }
  });
}


// ── Logout button ────────────────────────────────────────
function initLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // clear active route from db but keep history
    removeUserScopedValue('activeRoute');
    DB.remove('currentUser');
    window.location.href = 'auth.html';
  });
}


// ── Mock hospital data ───────────────────────────────────
// Used by dispatch.js and dashboard.js.
// In production these would come from real API calls to hospitals.
const MOCK_HOSPITALS = [
  {
    id: 'mem',
    name: 'Memorial Hospital',
    address: '251 E Huron St',
    lat: 41.8952, lng: -87.6204,
    erWaitMinutes: 12,
    erLoad: 68, // percent
    traumaCenter: true,
    minSeverity: 1, // can handle any severity
    inboundUnits: 1
  },
  {
    id: 'nw',
    name: 'Northwestern Medicine ER',
    address: '259 E Erie St',
    lat: 41.8935, lng: -87.6213,
    erWaitMinutes: 28,
    erLoad: 84,
    traumaCenter: true,
    minSeverity: 1,
    inboundUnits: 2
  },
  {
    id: 'rush',
    name: 'Rush University Medical',
    address: '1653 W Congress Pkwy',
    lat: 41.8744, lng: -87.6717,
    erWaitMinutes: 8,
    erLoad: 42,
    traumaCenter: true,
    minSeverity: 1,
    inboundUnits: 0
  },
  {
    id: 'stl',
    name: "St. Luke's Medical Center",
    address: '1431 N Claremont Ave',
    lat: 41.9082, lng: -87.6897,
    erWaitMinutes: 18,
    erLoad: 58,
    traumaCenter: false,
    minSeverity: 1,
    inboundUnits: 0
  },
  {
    id: 'uc',
    name: 'Urgent Care on Clark',
    address: '2845 N Clark St',
    lat: 41.9341, lng: -87.6485,
    erWaitMinutes: 5,
    erLoad: 22,
    traumaCenter: false,
    minSeverity: 1,
    inboundUnits: 0
  }
];

// Filters hospitals suitable for a given severity level (1-5)
// Severity 4+ requires a trauma center; severity 1-2 prefers urgent care
function getHospitalsForSeverity(severity) {
  return MOCK_HOSPITALS.filter(h => {
    if (severity >= 4) return h.traumaCenter;
    return true;
  });
}

function getHospitalById(id) {
  return MOCK_HOSPITALS.find((hospital) => hospital.id === id) || null;
}

// Calculates a composite "score" for routing (lower = better)
// Combines travel distance, ER load, and inbound units
function scoreHospital(hospital, userLat, userLng) {
  const dist = getDistanceKm(userLat, userLng, hospital.lat, hospital.lng);
  const loadPenalty = hospital.erLoad * 0.3;
  const unitsPenalty = hospital.inboundUnits * 5;
  return dist * 2 + loadPenalty + unitsPenalty;
}

// Haversine formula — returns distance in km between two lat/lng pairs
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = degToRad(lat2 - lat1);
  const dLng = degToRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degToRad(deg) { return deg * (Math.PI / 180); }

// Convert km to miles (displayed in UI)
function kmToMiles(km) { return (km * 0.621371).toFixed(1); }

// Estimate travel time in minutes from distance (km) assuming 40 km/h avg in city
function estimateTravelMinutes(km) { return Math.round((km / 40) * 60); }

function formatStepDistance(meters) {
  if (!meters || meters < 30) return '';
  if (meters >= 1609.344) return `${(meters / 1609.344).toFixed(1)} mi`;
  if (meters >= 305) return `${(meters / 1609.344).toFixed(1)} mi`;
  return `${Math.round(meters * 3.28084 / 10) * 10} ft`;
}

function getArrowForStep(step) {
  const maneuver = step?.maneuver || {};
  const modifier = maneuver.modifier || '';

  if (maneuver.type === 'arrive') return '🏥';
  if (modifier === 'left' || modifier === 'sharp left') return '↰';
  if (modifier === 'slight left') return '↖';
  if (modifier === 'right' || modifier === 'sharp right') return '↱';
  if (modifier === 'slight right') return '↗';
  if (modifier === 'uturn') return '↺';
  return '↑';
}

function formatRouteInstruction(step, destName) {
  const maneuver = step?.maneuver || {};
  const roadName = step?.name || step?.ref || 'the route ahead';
  const modifier = maneuver.modifier || '';
  const cleanRoadName = roadName.trim();

  if (maneuver.type === 'arrive') {
    return `Arrive at ${destName}`;
  }

  if (maneuver.type === 'depart') {
    return cleanRoadName === 'the route ahead'
      ? 'Head to the route'
      : `Head onto ${cleanRoadName}`;
  }

  if (maneuver.type === 'roundabout' || maneuver.type === 'roundabout turn') {
    return cleanRoadName === 'the route ahead'
      ? 'Enter the roundabout'
      : `Enter the roundabout toward ${cleanRoadName}`;
  }

  if (maneuver.type === 'merge' || maneuver.type === 'on ramp') {
    return cleanRoadName === 'the route ahead'
      ? 'Merge onto the route'
      : `Merge onto ${cleanRoadName}`;
  }

  if (maneuver.type === 'off ramp') {
    return cleanRoadName === 'the route ahead'
      ? 'Take the exit'
      : `Take the exit toward ${cleanRoadName}`;
  }

  if (maneuver.type === 'fork') {
    const forkDir = modifier ? ` ${modifier}` : '';
    return cleanRoadName === 'the route ahead'
      ? `Keep${forkDir}`.trim()
      : `Keep${forkDir} onto ${cleanRoadName}`.trim();
  }

  if (maneuver.type === 'continue' || maneuver.type === 'new name') {
    return cleanRoadName === 'the route ahead'
      ? 'Continue straight'
      : `Continue on ${cleanRoadName}`;
  }

  if (maneuver.type === 'end of road' || maneuver.type === 'turn') {
    const turnDir = modifier ? ` ${modifier}` : '';
    return cleanRoadName === 'the route ahead'
      ? `Turn${turnDir}`.trim()
      : `Turn${turnDir} onto ${cleanRoadName}`.trim();
  }

  return cleanRoadName === 'the route ahead'
    ? 'Continue on the route'
    : `Continue on ${cleanRoadName}`;
}

function buildNavigationStepsFromRoute(steps, destName) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return getMockDirections(destName);
  }

  const navigationSteps = steps.map((step) => ({
    arrow: getArrowForStep(step),
    street: formatRouteInstruction(step, destName),
    dist: formatStepDistance(step.distance),
    distKm: Number(((step.distance || 0) / 1000).toFixed(2))
  }));

  const lastStep = navigationSteps[navigationSteps.length - 1];
  if (!lastStep || lastStep.street !== `Arrive at ${destName}`) {
    navigationSteps.push({
      arrow: '🏥',
      street: `Arrive at ${destName}`,
      dist: '',
      distKm: 0
    });
  }

  return navigationSteps;
}

async function fetchRouteData(originLat, originLng, destLat, destLng, destName) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${originLng},${originLat};${destLng},${destLat}` +
    `?overview=full&geometries=geojson&steps=true`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Routing request failed with status ${response.status}`);
  }

  const data = await response.json();
  const route = data.routes?.[0];
  const leg = route?.legs?.[0];

  if (!route || !leg || !route.geometry?.coordinates) {
    throw new Error('Routing service returned no usable route');
  }

  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMin: Math.max(1, Math.round(route.duration / 60)),
    navigationSteps: buildNavigationStepsFromRoute(leg.steps || [], destName)
  };
}


// ── Mock route data (for the navigation directions) ──────
// In production these would come from a real routing API (OSRM / OpenRouteService)
function getMockDirections(destName) {
  return [
    { arrow: '↑', street: 'Head north on S Wabash Ave', dist: '0.3 mi', distKm: 0.48 },
    { arrow: '↰', street: 'Turn left onto E Balbo Dr', dist: '0.2 mi', distKm: 0.32 },
    { arrow: '↑', street: 'Continue on S Michigan Ave', dist: '0.8 mi', distKm: 1.29 },
    { arrow: '↱', street: 'Turn right onto E Wacker Dr', dist: '0.5 mi', distKm: 0.80 },
    { arrow: '↰', street: 'Turn left onto N State St', dist: '0.3 mi', distKm: 0.48 },
    { arrow: '↱', street: `Turn right onto approach to ${destName}`, dist: '0.1 mi', distKm: 0.16 },
    { arrow: '🏥', street: `Arrive at ${destName}`, dist: '', distKm: 0 }
  ];
}


// ── Mock route history ───────────────────────────────────
// Pre-seeded past routes so the history page isn't empty on first load
const MOCK_ROUTE_HISTORY = [
  {
    id: 'r001',
    date: '2025-01-08 09:14',
    injury: 'Cardiac Arrest',
    severity: 5,
    hospital: 'Northwestern Medicine ER',
    hospitalId: 'nw',
    durationMin: 9,
    savedMin: 3.2,
    patients: 1,
    erWaitOnArrival: 6,
    notes: 'Patient stabilized en route',
    originLat: 41.8827, originLng: -87.6233
  },
  {
    id: 'r002',
    date: '2025-01-07 14:32',
    injury: 'Trauma / Fall',
    severity: 3,
    hospital: 'Memorial Hospital',
    hospitalId: 'mem',
    durationMin: 12,
    savedMin: 1.8,
    patients: 1,
    erWaitOnArrival: 15,
    notes: 'Multiple lacerations, possible fracture',
    originLat: 41.8967, originLng: -87.6155
  },
  {
    id: 'r003',
    date: '2025-01-07 08:05',
    injury: 'Respiratory Distress',
    severity: 4,
    hospital: 'Rush University Medical',
    hospitalId: 'rush',
    durationMin: 18,
    savedMin: 4.5,
    patients: 1,
    erWaitOnArrival: 4,
    notes: 'Rerouted to Rush after NW ER overload detected',
    originLat: 41.8850, originLng: -87.6440
  },
  {
    id: 'r004',
    date: '2025-01-06 19:48',
    injury: 'Minor Laceration',
    severity: 1,
    hospital: 'Urgent Care on Clark',
    hospitalId: 'uc',
    durationMin: 6,
    savedMin: 0.8,
    patients: 1,
    erWaitOnArrival: 3,
    notes: '',
    originLat: 41.9200, originLng: -87.6400
  },
  {
    id: 'r005',
    date: '2025-01-06 11:22',
    injury: 'Stroke / Neurological',
    severity: 5,
    hospital: 'Northwestern Medicine ER',
    hospitalId: 'nw',
    durationMin: 8,
    savedMin: 2.9,
    patients: 1,
    erWaitOnArrival: 8,
    notes: 'Code Stroke activated on arrival',
    originLat: 41.9010, originLng: -87.6280
  },
  {
    id: 'r006',
    date: '2025-01-05 16:15',
    injury: 'Allergic Reaction',
    severity: 2,
    hospital: "St. Luke's Medical Center",
    hospitalId: 'stl',
    durationMin: 14,
    savedMin: 2.1,
    patients: 1,
    erWaitOnArrival: 10,
    notes: '',
    originLat: 41.8900, originLng: -87.6600
  },
  {
    id: 'r007',
    date: '2025-01-05 09:03',
    injury: 'Burns',
    severity: 4,
    hospital: 'Rush University Medical',
    hospitalId: 'rush',
    durationMin: 20,
    savedMin: 5.2,
    patients: 2,
    erWaitOnArrival: 5,
    notes: 'Two patients from kitchen fire',
    originLat: 41.8700, originLng: -87.6800
  },
  {
    id: 'r008',
    date: '2025-01-04 21:37',
    injury: 'Overdose',
    severity: 3,
    hospital: 'Memorial Hospital',
    hospitalId: 'mem',
    durationMin: 10,
    savedMin: 1.5,
    patients: 1,
    erWaitOnArrival: 18,
    notes: '',
    originLat: 41.8780, originLng: -87.6310
  }
];

// Ensure history is seeded in DB if it doesn't exist yet
function ensureHistorySeeded() {
  const existing = getUserScopedValue('routeHistory');
  if (!existing) {
    setUserScopedValue('routeHistory', MOCK_ROUTE_HISTORY);
  }
}


// ── Network activity feed ────────────────────────────────
// Mock fleet activity for the dashboard feed
const MOCK_FLEET_ACTIVITY = [
  { unit: 'Unit 03', action: 'Dispatched → Northwestern ER', status: 'active', time: '2m ago' },
  { unit: 'Unit 07', action: 'Rerouted via Wacker Dr', status: 'active', time: '4m ago' },
  { unit: 'Unit 22', action: 'Arrived — County General', status: 'arrived', time: '6m ago' },
  { unit: 'Unit 11', action: 'Dispatched → Rush University', status: 'active', time: '9m ago' },
  { unit: 'Unit 18', action: 'Idle — returning to base', status: 'idle', time: '12m ago' },
  { unit: 'Unit 05', action: 'Arrived — Memorial Hospital', status: 'arrived', time: '18m ago' },
  { unit: 'Unit 31', action: 'Dispatched → St. Luke\'s', status: 'active', time: '22m ago' },
  { unit: 'Unit 14', action: 'Arrived — Rush University', status: 'arrived', time: '35m ago' },
];


// ── Severity labels ──────────────────────────────────────
const SEVERITY_LABELS = ['', 'Minor', 'Moderate', 'Serious', 'Critical', 'Trauma'];

const SEVERITY_GUIDANCE_TEXT = [
  '',
  '🟢 Minor — Local urgent care or clinic suitable. Low ER burden.',
  '🟡 Moderate — Standard ER care required. Any facility in range.',
  '🟠 Serious — Full ER with imaging and surgical capability needed.',
  '🔴 Critical — Major hospital required. Trauma activation may be needed.',
  '🔴 Trauma — Level I Trauma Center ONLY. All hands on deck.'
];


// ── Auto-init on every app page ──────────────────────────
// Runs shared setup that every app page needs
document.addEventListener('DOMContentLoaded', () => {
  // Pages that require login (not auth.html or index.html)
  const protectedPages = ['dashboard.html', 'dispatch.html', 'navigate.html', 'history.html'];
  const currentPage = location.pathname.split('/').pop();

  if (protectedPages.includes(currentPage)) {
    const user = requireAuth();
    if (user) {
      populateUserUI(user);
      startClock();
      startNetworkCounter();
      initSidebarToggle();
      initLogout();
      ensureHistorySeeded();
    }
  }
});
