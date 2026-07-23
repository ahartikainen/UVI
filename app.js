'use strict';

const HELSINKI = {
  latitude: 60.1699,
  longitude: 24.9384,
  name: 'Helsingin keskusta'
};

const state = {
  latitude: HELSINKI.latitude,
  longitude: HELSINKI.longitude,
  locationName: HELSINKI.name,
  hours: 24,
  rangeMode: 'today',
  forecast: null,
  chart: null,
  marker: null,
  map: null,
  finlandMap: null,
  finlandMarker: null,
  lastSearchAt: 0,
  searchCache: new Map()
};

const elements = {
  statusBadge: document.querySelector('#statusBadge'),
  gpsButton: document.querySelector('#gpsButton'),
  addressInput: document.querySelector('#addressInput'),
  searchButton: document.querySelector('#searchButton'),
  searchResults: document.querySelector('#searchResults'),
  locationName: document.querySelector('#locationName'),
  usedLocationName: document.querySelector('#usedLocationName'),
  usedLocationCoordinates: document.querySelector('#usedLocationCoordinates'),
  coordinates: document.querySelector('#coordinates'),
  currentUv: document.querySelector('#currentUv'),
  currentUvLevel: document.querySelector('#currentUvLevel'),
  todayMax: document.querySelector('#todayMax'),
  todayMaxTime: document.querySelector('#todayMaxTime'),
  clearSkyMax: document.querySelector('#clearSkyMax'),
  sunProtectionBadge: document.querySelector('#sunProtectionBadge'),
  sunProtectionNow: document.querySelector('#sunProtectionNow'),
  sunProtectionMessage: document.querySelector('#sunProtectionMessage'),
  sunProtectionStart: document.querySelector('#sunProtectionStart'),
  sunProtectionEnd: document.querySelector('#sunProtectionEnd'),
  selectedPoint: document.querySelector('#selectedPoint'),
  tableBody: document.querySelector('#forecastTableBody'),
  rangeButtons: [...document.querySelectorAll('.range-button')],
  forecastHeading: document.querySelector('#forecastHeading'),
  tableHeading: document.querySelector('#tableHeading')
};

function setStatus(message, type = 'loading') {
  elements.statusBadge.textContent = message;
  elements.statusBadge.classList.toggle('is-error', type === 'error');
  elements.statusBadge.classList.toggle('is-ready', type === 'ready');
}

function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(4).replace('.', ',')}° ${value >= 0 ? positive : negative}`;
}

function formatUv(value) {
  return Number.isFinite(value) ? value.toFixed(1).replace('.', ',') : '–';
}

function uvLevel(value) {
  if (!Number.isFinite(value)) return 'Ei tietoa';
  if (value < 3) return 'Matala';
  if (value < 6) return 'Kohtalainen';
  if (value < 8) return 'Korkea';
  if (value < 11) return 'Erittäin korkea';
  return 'Äärimmäinen';
}

function formatDateTime(isoString, options = {}) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('fi-FI', {
    weekday: options.weekday ?? 'short',
    day: options.day ?? 'numeric',
    month: options.month ?? 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function initMap() {
  state.map = L.map('map', { zoomControl: true }).setView([state.latitude, state.longitude], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-tekijät'
  }).addTo(state.map);

  state.marker = L.marker([state.latitude, state.longitude]).addTo(state.map);

  state.finlandMap = L.map('finlandMap', {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false
  }).setView([64.7, 26.0], 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(state.finlandMap);
  state.finlandMarker = L.circleMarker([state.latitude, state.longitude], {
    radius: 7,
    weight: 3,
    color: '#ffffff',
    fillColor: '#1f6f78',
    fillOpacity: 1
  }).addTo(state.finlandMap);

  state.map.on('click', async (event) => {
    const { lat, lng } = event.latlng;
    await chooseLocation(lat, lng, 'Kartalta valittu sijainti', false, true);
  });
}

async function fetchForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    hourly: 'uv_index,uv_index_clear_sky',
    forecast_days: '7',
    timezone: 'auto'
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Sääpalvelu vastasi virheellä ${response.status}.`);

  const data = await response.json();
  if (!data.hourly?.time || !data.hourly?.uv_index) {
    throw new Error('Sääpalvelun vastauksesta puuttui tuntiennuste.');
  }
  return data;
}

async function reverseGeocode(latitude, longitude) {
  try {
    const params = new URLSearchParams({
      lat: latitude.toFixed(6),
      lon: longitude.toFixed(6),
      format: 'jsonv2',
      zoom: '14',
      addressdetails: '1',
      accept_language: 'fi'
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!response.ok) return null;
    const result = await response.json();
    return result.display_name || null;
  } catch {
    return null;
  }
}

async function chooseLocation(latitude, longitude, name, centerMap = true, resolveName = false) {
  state.latitude = latitude;
  state.longitude = longitude;
  state.locationName = name;
  state.marker.setLatLng([latitude, longitude]);
  state.finlandMarker.setLatLng([latitude, longitude]);
  if (centerMap) state.map.setView([latitude, longitude], 13);

  if (resolveName) {
    const resolved = await reverseGeocode(latitude, longitude);
    if (resolved) state.locationName = resolved;
  }

  const coordinateText = `${formatCoordinate(latitude, 'N', 'S')}, ${formatCoordinate(longitude, 'E', 'W')}`;
  elements.locationName.textContent = state.locationName;
  elements.coordinates.textContent = coordinateText;
  elements.usedLocationName.textContent = state.locationName;
  elements.usedLocationCoordinates.textContent = coordinateText;
  elements.searchResults.replaceChildren();

  setStatus('Haetaan ennustetta…');
  try {
    state.forecast = await fetchForecast(latitude, longitude);
    renderAll();
    setStatus('Ennuste päivitetty', 'ready');
  } catch (error) {
    setStatus('Haku epäonnistui', 'error');
    elements.selectedPoint.textContent = error.message;
  }
}

function getForecastRows() {
  const { time, uv_index: uv, uv_index_clear_sky: clear } = state.forecast.hourly;
  return time.map((timestamp, index) => ({
    timestamp,
    uv: uv[index],
    clear: clear?.[index] ?? null
  }));
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getTodayRows() {
  const key = localDateKey();
  return getForecastRows().filter((row) => row.timestamp.startsWith(key));
}

function getUpcomingRows() {
  const now = Date.now();
  return getForecastRows().filter((row) => new Date(row.timestamp).getTime() >= now - 30 * 60 * 1000);
}

function getCurrentRow() {
  const rows = getForecastRows();
  const now = Date.now();
  return rows.reduce((best, row) => {
    const distance = Math.abs(new Date(row.timestamp).getTime() - now);
    return !best || distance < best.distance ? { row, distance } : best;
  }, null)?.row ?? null;
}

function renderSummary() {
  const current = getCurrentRow();
  elements.currentUv.textContent = formatUv(current?.uv);
  elements.currentUvLevel.textContent = current ? `${uvLevel(current.uv)} · arvio klo ${new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit' }).format(new Date(current.timestamp))}` : 'Ei tietoa';

  const todayRows = getTodayRows();
  const maxRow = todayRows.reduce((best, row) => !best || row.uv > best.uv ? row : best, null);
  const clearRow = todayRows.reduce((best, row) => !best || row.clear > best.clear ? row : best, null);

  elements.todayMax.textContent = formatUv(maxRow?.uv);
  elements.todayMaxTime.textContent = maxRow ? formatDateTime(maxRow.timestamp, { weekday: undefined }) : 'Ei tietoa';
  elements.clearSkyMax.textContent = formatUv(clearRow?.clear);
}

function sameLocalDate(first, second) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function formatRecommendationTime(timestamp, reference = new Date()) {
  if (!timestamp) return 'Ei tiedossa';
  const date = new Date(timestamp);
  const tomorrow = new Date(reference);
  tomorrow.setDate(reference.getDate() + 1);

  const time = new Intl.DateTimeFormat('fi-FI', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);

  if (sameLocalDate(date, reference)) return `Tänään klo ${time}`;
  if (sameLocalDate(date, tomorrow)) return `Huomenna klo ${time}`;

  return new Intl.DateTimeFormat('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function findProtectionPeriod() {
  const threshold = 3;
  const rows = getTodayRows();
  const current = getCurrentRow();
  const currentUv = current?.uv;
  const activeNow = Number.isFinite(currentUv) && currentUv >= threshold;
  const qualifying = rows.filter((row) => Number.isFinite(row.uv) && row.uv >= threshold);

  if (!qualifying.length) {
    return { activeNow, currentUv, start: null, end: null, hasEnded: false };
  }

  const start = qualifying[0].timestamp;
  const lastIndex = rows.findIndex((row) => row.timestamp === qualifying[qualifying.length - 1].timestamp);
  const end = rows[lastIndex + 1]?.timestamp ?? null;
  const now = Date.now();
  const hasEnded = end ? new Date(end).getTime() <= now : false;

  return { activeNow, currentUv, start, end, hasEnded };
}

function renderSunProtection() {
  const period = findProtectionPeriod();
  const badge = elements.sunProtectionBadge;
  badge.classList.remove('is-active', 'is-upcoming', 'is-low');

  const currentText = Number.isFinite(period.currentUv)
    ? `UVI ${formatUv(period.currentUv)} (${uvLevel(period.currentUv).toLocaleLowerCase('fi-FI')})`
    : 'Nykyarvoa ei ole saatavilla';

  if (!period.start) {
    badge.textContent = 'Ei suositusta tänään';
    badge.classList.add('is-low');
    elements.sunProtectionNow.textContent = `${currentText} – UV-suojautumisen suositus ei ole voimassa.`;
    elements.sunProtectionStart.textContent = 'Ei tänään';
    elements.sunProtectionEnd.textContent = '–';
    elements.sunProtectionMessage.textContent = 'UV-indeksi ei ennusteen mukaan saavuta suojautumisrajaa tämän vuorokauden aikana.';
    return;
  }

  elements.sunProtectionStart.textContent = formatRecommendationTime(period.start);
  elements.sunProtectionEnd.textContent = period.end ? formatRecommendationTime(period.end) : 'Vuorokauden loppuun';

  if (period.activeNow) {
    badge.textContent = 'Voimassa nyt';
    badge.classList.add('is-active');
    elements.sunProtectionNow.textContent = `${currentText} – UV-suojautuminen on suositeltavaa nyt.`;
    elements.sunProtectionMessage.textContent = period.end
      ? `Tämän päivän suositusjakso alkoi ${formatRecommendationTime(period.start).toLocaleLowerCase('fi-FI')} ja päättyy arviolta ${formatRecommendationTime(period.end).toLocaleLowerCase('fi-FI')}.`
      : `Tämän päivän suositusjakso alkoi ${formatRecommendationTime(period.start).toLocaleLowerCase('fi-FI')} ja jatkuu päivän loppuun.`;
    return;
  }

  if (period.hasEnded) {
    badge.textContent = 'Päättynyt tältä päivältä';
    badge.classList.add('is-low');
    elements.sunProtectionNow.textContent = `${currentText} – UV-suojautumisen suositus ei ole enää voimassa.`;
    elements.sunProtectionMessage.textContent = `Tämän päivän suositusjakso oli ${formatRecommendationTime(period.start).toLocaleLowerCase('fi-FI')}–${formatRecommendationTime(period.end).toLocaleLowerCase('fi-FI')}.`;
    return;
  }

  badge.textContent = 'Alkaa myöhemmin';
  badge.classList.add('is-upcoming');
  elements.sunProtectionNow.textContent = `${currentText} – UV-suojautumisen suositus ei ole vielä voimassa.`;
  elements.sunProtectionMessage.textContent = period.end
    ? `Tämän päivän suositusjakso alkaa arviolta ${formatRecommendationTime(period.start).toLocaleLowerCase('fi-FI')} ja päättyy ${formatRecommendationTime(period.end).toLocaleLowerCase('fi-FI')}.`
    : `Tämän päivän suositusjakso alkaa arviolta ${formatRecommendationTime(period.start).toLocaleLowerCase('fi-FI')} ja jatkuu päivän loppuun.`;
}

function chartData() {
  return state.rangeMode === 'today'
    ? getTodayRows()
    : getUpcomingRows().slice(0, state.hours);
}

function renderChart() {
  const rows = chartData();
  const context = document.querySelector('#uvChart').getContext('2d');

  if (state.chart) state.chart.destroy();

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();

  state.chart = new Chart(context, {
    type: 'line',
    data: {
      labels: rows.map((row) => row.timestamp),
      datasets: [
        {
          label: 'UV-indeksi',
          data: rows.map((row) => row.uv),
          borderColor: accent,
          backgroundColor: 'rgba(31, 111, 120, 0.10)',
          borderWidth: 2.5,
          pointRadius: state.rangeMode === 'today' || state.hours <= 24 ? 3 : 0,
          pointHoverRadius: 6,
          tension: 0.28,
          fill: true
        },
        {
          label: 'Selkeä taivas',
          data: rows.map((row) => row.clear),
          borderColor: muted,
          borderWidth: 1.5,
          borderDash: [6, 5],
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.28,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      onClick: (_event, activeElements) => {
        if (!activeElements.length) return;
        const row = rows[activeElements[0].index];
        elements.selectedPoint.textContent = `${formatDateTime(row.timestamp)} · UV ${formatUv(row.uv)} (${uvLevel(row.uv)}) · selkeä taivas ${formatUv(row.clear)}`;
      },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            title: (items) => formatDateTime(rows[items[0].dataIndex].timestamp),
            label: (item) => `${item.dataset.label}: ${formatUv(item.raw)}`
          }
        }
      },
      scales: {
        x: {
          type: 'category',
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: state.rangeMode === 'today' || state.hours === 24 ? 8 : 10,
            callback: (_value, index) => {
              const date = rows[index] ? new Date(rows[index].timestamp) : null;
              if (!date) return '';
              return state.rangeMode === 'today' || state.hours <= 24
                ? new Intl.DateTimeFormat('fi-FI', { hour: '2-digit' }).format(date)
                : new Intl.DateTimeFormat('fi-FI', { weekday: 'short', hour: '2-digit' }).format(date);
            }
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 6,
          grid: { color: border },
          title: { display: true, text: 'UV-indeksi' }
        }
      }
    }
  });
}

function renderTable() {
  const rows = state.rangeMode === 'today' ? getTodayRows() : getUpcomingRows().slice(0, Math.min(state.hours, 24));
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement('tr');
    const timeCell = document.createElement('td');
    const uvCell = document.createElement('td');
    const clearCell = document.createElement('td');

    timeCell.textContent = formatDateTime(row.timestamp);
    uvCell.textContent = `${formatUv(row.uv)} · ${uvLevel(row.uv)}`;
    clearCell.textContent = formatUv(row.clear);

    tr.append(timeCell, uvCell, clearCell);
    fragment.append(tr);
  }

  elements.tableBody.replaceChildren(fragment);
}

function renderAll() {
  renderSummary();
  renderSunProtection();
  renderChart();
  renderTable();
  elements.selectedPoint.textContent = 'Klikkaa tai napauta kuvaajaa nähdäksesi tarkan arvon.';
}

async function searchAddress() {
  const query = elements.addressInput.value.trim();
  if (query.length < 3) {
    elements.searchResults.innerHTML = '<p class="error-line">Kirjoita vähintään kolme merkkiä.</p>';
    return;
  }

  const normalized = query.toLocaleLowerCase('fi-FI');
  if (state.searchCache.has(normalized)) {
    renderSearchResults(state.searchCache.get(normalized));
    return;
  }

  const elapsed = Date.now() - state.lastSearchAt;
  if (elapsed < 1100) {
    elements.searchResults.innerHTML = '<p class="loading-line">Odota hetki ennen seuraavaa hakua.</p>';
    return;
  }

  state.lastSearchAt = Date.now();
  elements.searchButton.disabled = true;
  elements.searchResults.innerHTML = '<p class="loading-line">Haetaan osoitetta…</p>';

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      accept_language: 'fi'
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (!response.ok) throw new Error(`Osoitehaku vastasi virheellä ${response.status}.`);

    const results = await response.json();
    state.searchCache.set(normalized, results);
    renderSearchResults(results);
  } catch (error) {
    elements.searchResults.innerHTML = `<p class="error-line">${error.message}</p>`;
  } finally {
    elements.searchButton.disabled = false;
  }
}

function renderSearchResults(results) {
  if (!results.length) {
    elements.searchResults.innerHTML = '<p class="error-line">Hakutuloksia ei löytynyt.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const result of results) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result';
    button.textContent = result.display_name;
    button.addEventListener('click', () => {
      chooseLocation(Number(result.lat), Number(result.lon), result.display_name, true);
    });
    fragment.append(button);
  }
  elements.searchResults.replaceChildren(fragment);
}

function useGps() {
  if (!navigator.geolocation) {
    elements.searchResults.innerHTML = '<p class="error-line">Selain ei tue GPS-paikannusta.</p>';
    return;
  }

  elements.gpsButton.disabled = true;
  setStatus('Haetaan GPS-sijaintia…');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      elements.gpsButton.disabled = false;
      chooseLocation(position.coords.latitude, position.coords.longitude, 'Nykyinen sijainti', true, true);
    },
    (error) => {
      elements.gpsButton.disabled = false;
      const messages = {
        1: 'Sijaintilupaa ei annettu.',
        2: 'Sijaintia ei voitu määrittää.',
        3: 'Sijainnin haku aikakatkaistiin.'
      };
      const message = messages[error.code] || 'GPS-paikannus epäonnistui.';
      elements.searchResults.innerHTML = `<p class="error-line">${message}</p>`;
      setStatus('GPS-haku epäonnistui', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function bindEvents() {
  elements.searchButton.addEventListener('click', searchAddress);
  elements.addressInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchAddress();
  });
  elements.gpsButton.addEventListener('click', useGps);

  for (const button of elements.rangeButtons) {
    button.addEventListener('click', () => {
      state.rangeMode = button.dataset.mode || 'hours';
      if (button.dataset.hours) state.hours = Number(button.dataset.hours);
      for (const item of elements.rangeButtons) item.classList.toggle('is-active', item === button);
      if (state.rangeMode === 'today') {
        elements.forecastHeading.textContent = 'UV-indeksi tänään';
        elements.tableHeading.textContent = 'Tämän päivän tunnit';
      } else {
        elements.forecastHeading.textContent = `UV-indeksi seuraavalle ${state.hours === 168 ? '7 vuorokaudelle' : `${state.hours} tunnille`}`;
        elements.tableHeading.textContent = 'Seuraavat tunnit';
      }
      if (state.forecast) {
        renderChart();
        renderTable();
      }
    });
  }
}

async function init() {
  initMap();
  bindEvents();
  await chooseLocation(HELSINKI.latitude, HELSINKI.longitude, HELSINKI.name, false);
}

init();
