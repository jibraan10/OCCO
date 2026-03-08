/* =====================================================
   HISTORY.JS - route history page interactions
   Handles: filtering, sorting, pagination, detail panel,
   replay map, and CSV export
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const user = getCurrentUser();
  if (!user) return;

  const PAGE_SIZE = 6;

  let allRoutes = DB.get('routeHistory') || [];
  let filteredRoutes = [];
  let currentPage = 1;
  let sortKey = 'date';
  let sortDir = 'desc';
  let selectedRouteId = null;
  let detailMap = null;

  const searchInput = document.getElementById('history-search');
  const severityFilter = document.getElementById('filter-severity');
  const periodFilter = document.getElementById('filter-period');
  const tableBody = document.getElementById('history-table-body');
  const emptyState = document.getElementById('history-empty');
  const pagination = document.getElementById('history-pagination');
  const pageInfo = document.getElementById('page-info');
  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');
  const exportBtn = document.getElementById('export-btn');
  const detailPlaceholder = document.getElementById('detail-placeholder');
  const detailContent = document.getElementById('detail-content');

  setText('history-unit-name', user.unit || 'Unit -');

  attachListeners();
  refreshSummary();
  applyFiltersAndRender();

  function attachListeners() {
    searchInput?.addEventListener('input', () => {
      currentPage = 1;
      applyFiltersAndRender();
    });

    severityFilter?.addEventListener('change', () => {
      currentPage = 1;
      applyFiltersAndRender();
    });

    periodFilter?.addEventListener('change', () => {
      currentPage = 1;
      applyFiltersAndRender();
    });

    document.querySelectorAll('.th-sortable').forEach((header) => {
      header.addEventListener('click', () => {
        const nextKey = header.dataset.sort;
        if (!nextKey) return;

        if (sortKey === nextKey) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = nextKey;
          sortDir = nextKey === 'date' ? 'desc' : 'asc';
        }

        currentPage = 1;
        applyFiltersAndRender();
      });
    });

    prevBtn?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage -= 1;
        renderTable();
      }
    });

    nextBtn?.addEventListener('click', () => {
      const totalPages = getTotalPages();
      if (currentPage < totalPages) {
        currentPage += 1;
        renderTable();
      }
    });

    exportBtn?.addEventListener('click', exportCsv);
  }

  function refreshSummary() {
    const totalRoutes = allRoutes.length;
    const totalSaved = allRoutes.reduce((sum, route) => sum + (route.savedMin || 0), 0);
    const totalPatients = allRoutes.reduce((sum, route) => sum + (route.patients || 1), 0);
    const avgDuration =
      totalRoutes > 0
        ? (allRoutes.reduce((sum, route) => sum + (route.durationMin || 0), 0) / totalRoutes).toFixed(1)
        : '--';

    setText('hist-total-routes', totalRoutes);
    setText('hist-total-time-saved', `${totalSaved.toFixed(1)} min`);
    setText('hist-total-patients', totalPatients);
    setText('hist-avg-route-time', totalRoutes > 0 ? `${avgDuration} min` : '--');
  }

  function applyFiltersAndRender() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const severity = severityFilter?.value || 'all';
    const period = periodFilter?.value || 'all';

    filteredRoutes = allRoutes
      .filter((route) => matchesSearch(route, query))
      .filter((route) => matchesSeverity(route, severity))
      .filter((route) => matchesPeriod(route, period))
      .sort(compareRoutes);

    const selectedVisible = filteredRoutes.some((route) => route.id === selectedRouteId);
    if (!selectedVisible) {
      selectedRouteId = null;
      clearDetailPanel();
    }

    renderTable();
  }

  function matchesSearch(route, query) {
    if (!query) return true;

    const haystack = [
      route.date,
      route.injury,
      route.hospital,
      route.notes,
      SEVERITY_LABELS[route.severity] || ''
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }

  function matchesSeverity(route, severity) {
    if (severity === 'all') return true;
    return String(route.severity) === severity;
  }

  function matchesPeriod(route, period) {
    if (period === 'all') return true;

    const routeDate = parseRouteDate(route.date);
    if (!routeDate) return false;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === 'today') {
      return routeDate >= todayStart;
    }

    if (period === 'week') {
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - 6);
      return routeDate >= weekStart;
    }

    if (period === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return routeDate >= monthStart;
    }

    return true;
  }

  function compareRoutes(a, b) {
    const direction = sortDir === 'asc' ? 1 : -1;

    if (sortKey === 'date') {
      return (parseRouteDate(a.date) - parseRouteDate(b.date)) * direction;
    }

    if (sortKey === 'severity') {
      return ((a.severity || 0) - (b.severity || 0)) * direction;
    }

    if (sortKey === 'duration') {
      return ((a.durationMin || 0) - (b.durationMin || 0)) * direction;
    }

    if (sortKey === 'saved') {
      return ((a.savedMin || 0) - (b.savedMin || 0)) * direction;
    }

    const left = String(a[sortKey] || '').toLowerCase();
    const right = String(b[sortKey] || '').toLowerCase();
    return left.localeCompare(right) * direction;
  }

  function renderTable() {
    if (!tableBody || !emptyState || !pagination || !pageInfo || !prevBtn || !nextBtn) return;

    tableBody.innerHTML = '';

    const totalPages = getTotalPages();
    currentPage = Math.min(currentPage, totalPages);

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const visibleRoutes = filteredRoutes.slice(startIdx, startIdx + PAGE_SIZE);

    visibleRoutes.forEach((route) => {
      const tr = document.createElement('tr');
      if (route.id === selectedRouteId) {
        tr.classList.add('row--selected');
      }

      tr.innerHTML = `
        <td class="td-date">${route.date}</td>
        <td>${route.injury || '-'}</td>
        <td><span class="sev-badge sev-badge--${route.severity}">${SEVERITY_LABELS[route.severity] || '-'}</span></td>
        <td>${route.hospital || '-'}</td>
        <td>${route.durationMin || 0} min</td>
        <td class="td-saved">-${Number(route.savedMin || 0).toFixed(1)} min</td>
        <td><button class="td-detail-btn" type="button">View</button></td>
      `;

      tr.addEventListener('click', () => selectRoute(route.id));

      const detailBtn = tr.querySelector('.td-detail-btn');
      detailBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        selectRoute(route.id);
      });

      tableBody.appendChild(tr);
    });

    const hasResults = filteredRoutes.length > 0;
    emptyState.style.display = hasResults ? 'none' : 'flex';
    pagination.style.display = hasResults ? 'flex' : 'none';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  function selectRoute(routeId) {
    selectedRouteId = routeId;
    renderTable();

    const route = filteredRoutes.find((item) => item.id === routeId) || allRoutes.find((item) => item.id === routeId);
    if (!route) return;

    detailPlaceholder && (detailPlaceholder.style.display = 'none');
    detailContent && (detailContent.style.display = 'block');

    setText('detail-date', route.date);
    setText('detail-injury', route.injury || '-');
    setText('detail-hospital', route.hospital || '-');
    setText('detail-patients', route.patients || 1);
    setText('detail-duration', `${route.durationMin || 0} min`);
    setText('detail-saved', `${Number(route.savedMin || 0).toFixed(1)} min`);
    setText('detail-er-wait', `${route.erWaitOnArrival || '-'} min`);
    setText('detail-notes', route.notes || 'No additional notes');

    const severityBadge = document.getElementById('detail-severity-badge');
    if (severityBadge) {
      severityBadge.className = `detail-severity-badge sev-badge sev-badge--${route.severity}`;
      severityBadge.textContent = SEVERITY_LABELS[route.severity] || '-';
    }

    renderDetailMap(route);
  }

  function clearDetailPanel() {
    if (detailPlaceholder) detailPlaceholder.style.display = 'flex';
    if (detailContent) detailContent.style.display = 'none';

    if (detailMap) {
      detailMap.remove();
      detailMap = null;
    }
  }

  function renderDetailMap(route) {
    const mapEl = document.getElementById('detail-map');
    if (!mapEl || typeof L === 'undefined') return;

    if (detailMap) {
      detailMap.remove();
      detailMap = null;
    }

    const hospital = getHospitalById(route.hospitalId);
    if (!hospital) return;

    detailMap = L.map('detail-map', { zoomControl: false }).setView([route.originLat, route.originLng], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(detailMap);

    const originMarker = L.marker([route.originLat, route.originLng]).addTo(detailMap);
    originMarker.bindTooltip('Origin');

    const hospitalMarker = L.marker([hospital.lat, hospital.lng]).addTo(detailMap);
    hospitalMarker.bindTooltip(hospital.name);

    const midLat = (route.originLat + hospital.lat) / 2 + 0.005;
    const midLng = (route.originLng + hospital.lng) / 2 + 0.008;

    const polyline = L.polyline(
      [
        [route.originLat, route.originLng],
        [midLat, midLng],
        [hospital.lat, hospital.lng]
      ],
      { color: '#f5a623', weight: 4, opacity: 0.85 }
    ).addTo(detailMap);

    detailMap.fitBounds(polyline.getBounds(), { padding: [20, 20] });
  }

  function exportCsv() {
    const rows = filteredRoutes.length > 0 ? filteredRoutes : allRoutes;
    if (rows.length === 0) return;

    const header = [
      'Date',
      'Injury',
      'Severity',
      'Hospital',
      'DurationMin',
      'SavedMin',
      'Patients',
      'ERWaitOnArrival',
      'Notes'
    ];

    const csvRows = rows.map((route) => [
      route.date,
      route.injury || '',
      SEVERITY_LABELS[route.severity] || route.severity || '',
      route.hospital || '',
      route.durationMin || 0,
      Number(route.savedMin || 0).toFixed(1),
      route.patients || 1,
      route.erWaitOnArrival || '',
      route.notes || ''
    ]);

    const csv = [header, ...csvRows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clearpath-route-history-${formatDateStamp(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(filteredRoutes.length / PAGE_SIZE));
  }

  function parseRouteDate(value) {
    return new Date(String(value).replace(' ', 'T'));
  }

  function csvEscape(value) {
    const str = String(value ?? '');
    return `"${str.replace(/"/g, '""')}"`;
  }

  function formatDateStamp(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value ?? '';
    }
  }
});
