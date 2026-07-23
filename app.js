'use strict';

const HELSINKI = { latitude: 60.1699, longitude: 24.9384, name: 'Helsingin keskusta' };
const PROTECTION_LIMIT = 3;

const state = {
  latitude: HELSINKI.latitude,
  longitude: HELSINKI.longitude,
  locationName: HELSINKI.name,
  rangeMode: 'today',
  hours: 24,
  forecast: null,
  chart: null,
  marker: null,
  overviewMarker: null,
  map: null,
  overviewMap: null,
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
  coordinates: document.querySelector('#coordinates'),
  usedLocationName: document.querySelector('#usedLocationName'),
  usedLocationCoordinates: document.querySelector('#usedLocationCoordinates'),
  currentUv: document.querySelector('#currentUv'),
  currentUvLevel: document.querySelector('#currentUvLevel'),
  currentClearUv: document.querySelector('#currentClearUv'),
  currentClearDetail: document.querySelector('#currentClearDetail'),
  todayMax: document.querySelector('#todayMax'),
  todayMaxTime: document.querySelector('#todayMaxTime'),
  clearSkyMax: document.querySelector('#clearSkyMax'),
  clearSkyMaxTime: document.querySelector('#clearSkyMaxTime'),
  interpretationText: document.querySelector('#interpretationText'),
  selectedPoint: document.querySelector('#selectedPoint'),
  tableBody: document.querySelector('#forecastTableBody'),
  tableHeading: document.querySelector('#tableHeading'),
  forecastHeading: document.querySelector('#forecastHeading'),
  sunProtectionBadge: document.querySelector('#sunProtectionBadge'),
  sunProtectionNow: document.querySelector('#sunProtectionNow'),
  sunProtectionMessage: document.querySelector('#sunProtectionMessage'),
  actualProtectionStart: document.querySelector('#actualProtectionStart'),
  actualProtectionEnd: document.querySelector('#actualProtectionEnd'),
  clearProtectionStart: document.querySelector('#clearProtectionStart'),
  clearProtectionEnd: document.querySelector('#clearProtectionEnd'),
  rangeButtons: [...document.querySelectorAll('.range-button')]
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

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(isoString, compact = false) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('fi-FI', compact
    ? { hour: '2-digit', minute: '2-digit' }
    : { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }
  ).format(date);
}

function initMaps() {
  state.map = L.map('map', { zoomControl: true }).setView([state.latitude, state.longitude], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-tekijät'
  }).addTo(state.map);
  state.marker = L.circleMarker([state.latitude, state.longitude], {
    radius: 9,
    weight: 3,
    color: '#17555c',
    fillColor: '#ffffff',
    fillOpacity: 1
  }).addTo(state.map).bindTooltip('Valittu sijainti');
  state.map.on('click', ({ latlng }) => chooseLocation(latlng.lat, latlng.lng, 'Kartalta valittu sijainti', false));

  state.overviewMap = L.map('finlandMap', {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false
  }).fitBounds([[59.5, 19.0], [70.2, 32.0]], { padding: [8, 8] });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 8 }).addTo(state.overviewMap);
  state.overviewMarker = L.circleMarker([state.latitude, state.longitude], {
    radius: 7,
    weight: 3,
    color: '#17555c',
    fillColor: '#ffffff',
    fillOpacity: 1
  }).addTo(state.overviewMap);

  window.addEventListener('resize', () => {
    state.map.invalidateSize(false);
    state.overviewMap.invalidateSize(false);
  });
}

async function fetchForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    hourly: 'uv_index,uv_index_clear_sky',
    forecast_days: '7',
    past_days: '1',
    timezone: 'auto'
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Sääpalvelu vastasi virheellä ${response.status}.`);
  const data = await response.json();
  if (!data.hourly?.time || !data.hourly?.uv_index || !data.hourly?.uv_index_clear_sky) {
    throw new Error('Sääpalvelun vastauksesta puuttui UV-tuntidata.');
  }
  return data;
}

async function chooseLocation(latitude, longitude, name, centerMap = true) {
  state.latitude = latitude;
  state.longitude = longitude;
  state.locationName = name;
  state.marker.setLatLng([latitude, longitude]).bindTooltip(`Valittu sijainti: ${name}`);
  state.overviewMarker.setLatLng([latitude, longitude]).bindTooltip(`Valittu sijainti: ${name}`);
  if (centerMap) state.map.setView([latitude, longitude], 13);

  const coordinateText = `${formatCoordinate(latitude, 'N', 'S')}, ${formatCoordinate(longitude, 'E', 'W')}`;
  elements.locationName.textContent = name;
  elements.coordinates.textContent = coordinateText;
  elements.usedLocationName.textContent = name;
  elements.usedLocationCoordinates.textContent = coordinateText;
  elements.searchResults.replaceChildren();

  setStatus('Haetaan ennustetta…');
  try {
    state.forecast = await fetchForecast(latitude, longitude);
    renderAll();
    setTimeout(() => {
      state.map.invalidateSize(false);
      state.overviewMap.invalidateSize(false);
    }, 100);
    setStatus('Ennuste päivitetty', 'ready');
  } catch (error) {
    setStatus('Haku epäonnistui', 'error');
    elements.selectedPoint.textContent = error.message;
  }
}

function allRows() {
  const hourly = state.forecast.hourly;
  return hourly.time.map((timestamp, index) => ({
    timestamp,
    uv: Number(hourly.uv_index[index]),
    clear: Number(hourly.uv_index_clear_sky[index])
  }));
}

function todayRows() {
  const key = dateKey();
  return allRows().filter((row) => row.timestamp.startsWith(key));
}

function upcomingRows() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  return allRows().filter((row) => new Date(row.timestamp).getTime() >= cutoff);
}

function visibleRows() {
  return state.rangeMode === 'today' ? todayRows() : upcomingRows().slice(0, state.hours);
}

function nearestCurrentRow() {
  const now = Date.now();
  return allRows().reduce((best, row) => {
    const distance = Math.abs(new Date(row.timestamp).getTime() - now);
    return !best || distance < best.distance ? { row, distance } : best;
  }, null)?.row;
}

function maxBy(rows, key) {
  return rows.reduce((best, row) => !best || row[key] > best[key] ? row : best, null);
}

function renderSummary() {
  const current = nearestCurrentRow();
  const today = todayRows();
  const actualMax = maxBy(today, 'uv');
  const clearMax = maxBy(today, 'clear');

  elements.currentUv.textContent = formatUv(current?.uv);
  elements.currentUvLevel.textContent = current ? `${uvLevel(current.uv)} · sääennuste huomioitu · ${formatDateTime(current.timestamp, true)}` : 'Ei tietoa';
  elements.currentClearUv.textContent = formatUv(current?.clear);
  elements.currentClearDetail.textContent = current ? `Pilvetön vertailuarvo · ${formatDateTime(current.timestamp, true)}` : 'Ei tietoa';
  elements.todayMax.textContent = formatUv(actualMax?.uv);
  elements.todayMaxTime.textContent = actualMax ? `Sääennuste huomioitu · ${formatDateTime(actualMax.timestamp, true)}` : 'Ei tietoa';
  elements.clearSkyMax.textContent = formatUv(clearMax?.clear);
  elements.clearSkyMaxTime.textContent = clearMax ? `Pilvetön vertailu · ${formatDateTime(clearMax.timestamp, true)}` : 'Ei tietoa';

  const actual = current?.uv;
  const clear = current?.clear;
  if (!Number.isFinite(actual) || !Number.isFinite(clear)) {
    elements.interpretationText.textContent = 'UV-arvojen tulkintaa ei voitu muodostaa.';
  } else if (Math.abs(clear - actual) < 0.2) {
    elements.interpretationText.textContent = 'Arvot ovat lähes samat. Pilvisyys ei ennusteen mukaan juuri vähennä UV-säteilyä, joten käytä sääennusteen huomioivaa UV-indeksiä.';
  } else {
    elements.interpretationText.textContent = `Käytä tavallisesti sääennusteen huomioivaa arvoa ${formatUv(actual)}. Pilvettömän taivaan arvo ${formatUv(clear)} kertoo mahdollisen tason, jos pilvet väistyvät tai ennustettu pilvisyys muuttuu. Vaihtelevässä säässä suojaudu mieluummin korkeamman arvon mukaan.`;
  }
}

function interpolateThresholdTime(first, second, key) {
  const value1 = first[key];
  const value2 = second[key];
  if (!Number.isFinite(value1) || !Number.isFinite(value2) || value1 === value2) return null;
  const fraction = (PROTECTION_LIMIT - value1) / (value2 - value1);
  if (fraction < 0 || fraction > 1) return null;
  const time1 = new Date(first.timestamp).getTime();
  const time2 = new Date(second.timestamp).getTime();
  const interpolated = time1 + fraction * (time2 - time1);
  return new Date(Math.round(interpolated / 60000) * 60000);
}

function protectionPeriod(rows, key) {
  if (!rows.length || !rows.some((row) => row[key] >= PROTECTION_LIMIT)) return null;

  let start = null;
  let end = null;
  for (let index = 0; index < rows.length - 1; index += 1) {
    const first = rows[index];
    const second = rows[index + 1];
    if (first[key] < PROTECTION_LIMIT && second[key] >= PROTECTION_LIMIT && !start) {
      start = interpolateThresholdTime(first, second, key);
    }
    if (first[key] >= PROTECTION_LIMIT && second[key] < PROTECTION_LIMIT) {
      end = interpolateThresholdTime(first, second, key);
    }
  }

  const firstAbove = rows.find((row) => row[key] >= PROTECTION_LIMIT);
  const lastAbove = [...rows].reverse().find((row) => row[key] >= PROTECTION_LIMIT);
  return {
    start: start || new Date(firstAbove.timestamp),
    end: end || new Date(lastAbove.timestamp)
  };
}

function formatClock(value) {
  return value ? new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit' }).format(value) : 'Ei tänään';
}

function renderProtection() {
  const rows = todayRows();
  const current = nearestCurrentRow();
  const actualPeriod = protectionPeriod(rows, 'uv');
  const clearPeriod = protectionPeriod(rows, 'clear');
  const activeActualNow = current?.uv >= PROTECTION_LIMIT;
  const activeClearNow = current?.clear >= PROTECTION_LIMIT;

  elements.actualProtectionStart.textContent = formatClock(actualPeriod?.start);
  elements.actualProtectionEnd.textContent = formatClock(actualPeriod?.end);
  elements.clearProtectionStart.textContent = formatClock(clearPeriod?.start);
  elements.clearProtectionEnd.textContent = formatClock(clearPeriod?.end);

  if (activeActualNow) {
    elements.sunProtectionBadge.textContent = 'Voimassa nyt';
    elements.sunProtectionNow.textContent = `Suojaudu nyt (UVI ${formatUv(current.uv)})`;
  } else if (activeClearNow) {
    elements.sunProtectionBadge.textContent = 'Mahdollinen tarve';
    elements.sunProtectionNow.textContent = `Sääennuste huomioitu UVI ${formatUv(current?.uv)}, pilvettömän taivaan UVI ${formatUv(current?.clear)}`;
  } else {
    elements.sunProtectionBadge.textContent = actualPeriod || clearPeriod ? 'Ei voimassa nyt' : 'Ei suositusjaksoa';
    elements.sunProtectionNow.textContent = `Sääennuste huomioitu UVI ${formatUv(current?.uv)} · pilvetön taivas ${formatUv(current?.clear)}`;
  }

  const actualText = actualPeriod ? `${formatClock(actualPeriod.start)}–${formatClock(actualPeriod.end)}` : 'ei ylitä rajaa';
  const clearText = clearPeriod ? `${formatClock(clearPeriod.start)}–${formatClock(clearPeriod.end)}` : 'ei ylitä rajaa';
  elements.sunProtectionMessage.textContent = `UVI ≥ ${PROTECTION_LIMIT}: sääennuste huomioitu ${actualText}; pilvetön taivas ${clearText}. Raja-ajat on laskettu tuntipisteiden välistä lineaarisella interpoloinnilla minuutin tarkkuudella.`;
}

function renderChart(rows) {
  const canvas = document.querySelector('#uvChart');
  const context = canvas.getContext('2d');
  if (state.chart) state.chart.destroy();

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  const border = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();

  const nowLinePlugin = {
    id: 'nowLine',
    afterDatasetsDraw(chart) {
      const now = Date.now();
      const firstTime = rows.length ? new Date(rows[0].timestamp).getTime() : NaN;
      const lastTime = rows.length ? new Date(rows[rows.length - 1].timestamp).getTime() : NaN;
      if (!Number.isFinite(firstTime) || now < firstTime || now > lastTime) return;
      const x = chart.scales.x.getPixelForValue(now);
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#b03a2e';
      ctx.stroke();
      ctx.fillStyle = '#b03a2e';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Nyt', x, top + 14);
      ctx.restore();
    }
  };

  state.chart = new Chart(context, {
    type: 'line',
    plugins: [nowLinePlugin],
    data: {
      datasets: [
        {
          label: 'Sääennuste huomioitu',
          data: rows.map((row) => ({ x: new Date(row.timestamp).getTime(), y: row.uv })),
          borderColor: accent,
          backgroundColor: 'rgba(31, 111, 120, 0.08)',
          borderWidth: 2.5,
          pointRadius: rows.length <= 24 ? 2.5 : 0,
          pointHoverRadius: 6,
          tension: 0.22,
          fill: false
        },
        {
          label: 'Pilvetön taivas',
          data: rows.map((row) => ({ x: new Date(row.timestamp).getTime(), y: row.clear })),
          borderColor: muted,
          borderWidth: 1.7,
          borderDash: [6, 5],
          pointRadius: rows.length <= 24 ? 2 : 0,
          pointHoverRadius: 5,
          tension: 0.22,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      onClick: (_event, active) => {
        if (!active.length) return;
        const row = rows[active[0].index];
        elements.selectedPoint.textContent = `${formatDateTime(row.timestamp)} · sääennuste huomioitu ${formatUv(row.uv)} (${uvLevel(row.uv)}) · pilvetön taivas ${formatUv(row.clear)}`;
      },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
        tooltip: {
          callbacks: {
            title: (items) => formatDateTime(rows[items[0].dataIndex].timestamp),
            label: (item) => `${item.dataset.label}: ${formatUv(item.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: rows.length ? new Date(rows[0].timestamp).getTime() : undefined,
          max: rows.length ? new Date(rows[rows.length - 1].timestamp).getTime() : undefined,
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            maxTicksLimit: window.innerWidth <= 560 ? 5 : 9,
            callback: (value) => {
              const date = new Date(value);
              return rows.length <= 24
                ? new Intl.DateTimeFormat('fi-FI', { hour: '2-digit' }).format(date)
                : new Intl.DateTimeFormat('fi-FI', { weekday: 'short', hour: '2-digit' }).format(date);
            }
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 6,
          grid: { color: border },
          title: { display: window.innerWidth > 560, text: 'UV-indeksi' }
        }
      }
    }
  });
}

function renderTable(rows) {
  const fragment = document.createDocumentFragment();
  const currentHour = new Date();
  currentHour.setMinutes(0, 0, 0);
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (new Date(row.timestamp).getTime() === currentHour.getTime()) {
      tr.classList.add('is-current-hour');
      tr.setAttribute('aria-current', 'time');
    }
    const time = document.createElement('td');
    const actual = document.createElement('td');
    const clear = document.createElement('td');
    time.dataset.label = 'Aika';
    actual.dataset.label = 'Sääennuste';
    clear.dataset.label = 'Pilvetön';
    time.textContent = formatDateTime(row.timestamp);
    actual.textContent = `${formatUv(row.uv)} · ${uvLevel(row.uv)}`;
    clear.textContent = formatUv(row.clear);
    tr.append(time, actual, clear);
    fragment.append(tr);
  }
  elements.tableBody.replaceChildren(fragment);
  elements.tableHeading.textContent = state.rangeMode === 'today' ? 'Tämän päivän tunnit' : `Samat ${rows.length} tuntia kuin kuvaajassa`;
}

function renderAll() {
  const rows = visibleRows();
  const title = state.rangeMode === 'today' ? 'UV-indeksi tänään' : `UV-indeksi seuraavat ${state.hours} h`;
  elements.forecastHeading.textContent = title;
  renderSummary();
  renderProtection();
  renderChart(rows);
  renderTable(rows);
  elements.selectedPoint.textContent = 'Kuvaaja ja taulukko käyttävät täsmälleen samaa tuntiaineistoa. Napauta kuvaajaa nähdäksesi molemmat UV-arvot.';
}

async function searchAddress() {
  const query = elements.addressInput.value.trim();
  if (query.length < 3) {
    elements.searchResults.innerHTML = '<p class="error-line">Kirjoita vähintään kolme merkkiä.</p>';
    return;
  }
  const normalized = query.toLocaleLowerCase('fi-FI');
  if (state.searchCache.has(normalized)) return renderSearchResults(state.searchCache.get(normalized));
  if (Date.now() - state.lastSearchAt < 1100) {
    elements.searchResults.innerHTML = '<p class="loading-line">Odota hetki ennen seuraavaa hakua.</p>';
    return;
  }
  state.lastSearchAt = Date.now();
  elements.searchButton.disabled = true;
  elements.searchResults.innerHTML = '<p class="loading-line">Haetaan osoitetta…</p>';
  try {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '1', limit: '5', accept_language: 'fi' });
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
    button.addEventListener('click', () => chooseLocation(Number(result.lat), Number(result.lon), result.display_name, true));
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
      chooseLocation(position.coords.latitude, position.coords.longitude, 'Nykyinen sijainti', true);
    },
    (error) => {
      elements.gpsButton.disabled = false;
      const messages = { 1: 'Sijaintilupaa ei annettu.', 2: 'Sijaintia ei voitu määrittää.', 3: 'Sijainnin haku aikakatkaistiin.' };
      elements.searchResults.innerHTML = `<p class="error-line">${messages[error.code] || 'GPS-paikannus epäonnistui.'}</p>`;
      setStatus('GPS-haku epäonnistui', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function bindEvents() {
  elements.searchButton.addEventListener('click', searchAddress);
  elements.addressInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') searchAddress(); });
  elements.gpsButton.addEventListener('click', useGps);
  for (const button of elements.rangeButtons) {
    button.addEventListener('click', () => {
      state.rangeMode = button.dataset.mode;
      state.hours = Number(button.dataset.hours || 24);
      elements.rangeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      if (state.forecast) renderAll();
    });
  }
}

async function init() {
  initMaps();
  bindEvents();
  await chooseLocation(HELSINKI.latitude, HELSINKI.longitude, HELSINKI.name, false);
}

init();
