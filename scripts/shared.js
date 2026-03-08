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
    DB.remove('activeRoute');
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
  const existing = DB.get('routeHistory');
  if (!existing) {
    DB.set('routeHistory', MOCK_ROUTE_HISTORY);
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
