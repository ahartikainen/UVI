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
  mapResizeObserver: null,
  clockTimer: null,
  lastForecastHour: null,
  lastSearchAt: 0,
  searchCache: new Map(),
  timezoneMode: 'location',
  customTimezone: '',
  displayTimezone: 'Europe/Helsinki'
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
  currentUvTime: document.querySelector('#currentUvTime'),
  currentClearUv: document.querySelector('#currentClearUv'),
  currentClearDetail: document.querySelector('#currentClearDetail'),
  currentClearUvTime: document.querySelector('#currentClearUvTime'),
  dataTimeNote: document.querySelector('#dataTimeNote'),
  todayMax: document.querySelector('#todayMax'),
  todayMaxTime: document.querySelector('#todayMaxTime'),
  clearSkyMax: document.querySelector('#clearSkyMax'),
  clearSkyMaxTime: document.querySelector('#clearSkyMaxTime'),
  cloudImpact: document.querySelector('#cloudImpact'),
  cloudImpactDetail: document.querySelector('#cloudImpactDetail'),
  interpretationText: document.querySelector('#interpretationText'),
  selectedPoint: document.querySelector('#selectedPoint'),
  tableBody: document.querySelector('#forecastTableBody'),
  tableHeading: document.querySelector('#tableHeading'),
  forecastHeading: document.querySelector('#forecastHeading'),
  sunProtectionBadge: document.querySelector('#sunProtectionBadge'),
  sunProtectionNow: document.querySelector('#sunProtectionNow'),
  sunProtectionMessage: document.querySelector('#sunProtectionMessage'),
  nextProtectionChange: document.querySelector('#nextProtectionChange'),
  actualProtectionStart: document.querySelector('#actualProtectionStart'),
  actualProtectionEnd: document.querySelector('#actualProtectionEnd'),
  clearProtectionStart: document.querySelector('#clearProtectionStart'),
  clearProtectionEnd: document.querySelector('#clearProtectionEnd'),
  rangeButtons: [...document.querySelectorAll('.range-button')],
  timezoneMode: document.querySelector('#timezoneMode'),
  customTimezone: document.querySelector('#customTimezone'),
  applyTimezone: document.querySelector('#applyTimezone'),
  timezoneStatus: document.querySelector('#timezoneStatus')
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

function activeTimezone() {
  return state.displayTimezone || 'UTC';
}

function dateKey(timestamp = Date.now(), timezone = activeTimezone()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateTime(timestamp, compact = false) {
  return new Intl.DateTimeFormat('fi-FI', compact
    ? { timeZone: activeTimezone(), hour: '2-digit', minute: '2-digit' }
    : { timeZone: activeTimezone(), weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }
  ).format(new Date(timestamp));
}

function requestedTimezone() {
  if (state.timezoneMode === 'device') return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (state.timezoneMode === 'utc') return 'UTC';
  if (state.timezoneMode === 'custom') return state.customTimezone.trim();
  return 'auto';
}

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('fi-FI', { timeZone: timezone }).format();
    return true;
  } catch (_error) {
    return false;
  }
}

function timezoneDescription() {
  const zone = activeTimezone();
  if (state.timezoneMode === 'location') return `sijainnin paikallinen aika (${zone})`;
  if (state.timezoneMode === 'device') return `laitteen aikavyöhyke (${zone})`;
  if (state.timezoneMode === 'utc') return 'UTC';
  return `valittu aikavyöhyke (${zone})`;
}

const FINLAND_BOUNDS = [[19.0, 59.5], [32.0, 70.2]];
const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap-tekijät'
    }
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
};

function createLocationMarker(size = 18) {
  const markerElement = document.createElement('div');
  markerElement.className = 'map-location-marker';
  markerElement.style.width = `${size}px`;
  markerElement.style.height = `${size}px`;
  markerElement.setAttribute('aria-label', 'Valittu sijainti');
  return markerElement;
}

function refreshMapSizes() {
  state.map?.resize();
  state.overviewMap?.resize();
}

function scheduleMapRefresh(refitOverview = false) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    refreshMapSizes();
    if (refitOverview && state.overviewMap) {
      state.overviewMap.fitBounds(FINLAND_BOUNDS, { padding: 18, duration: 0 });
    }
  }));
}

function initMaps() {
  state.map = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: [state.longitude, state.latitude],
    zoom: 10.5,
    attributionControl: true
  });
  state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  state.marker = new maplibregl.Marker({ element: createLocationMarker(20), anchor: 'center' })
    .setLngLat([state.longitude, state.latitude])
    .addTo(state.map);
  state.map.on('click', ({ lngLat }) => chooseLocation(lngLat.lat, lngLat.lng, 'Kartalta valittu sijainti', false));

  state.overviewMap = new maplibregl.Map({
    container: 'finlandMap',
    style: MAP_STYLE,
    center: [25.5, 64.8],
    zoom: 3.2,
    interactive: false,
    attributionControl: false
  });
  state.overviewMarker = new maplibregl.Marker({ element: createLocationMarker(16), anchor: 'center' })
    .setLngLat([state.longitude, state.latitude])
    .addTo(state.overviewMap);

  state.map.on('load', () => scheduleMapRefresh(false));
  state.overviewMap.on('load', () => scheduleMapRefresh(true));
  window.addEventListener('load', () => scheduleMapRefresh(true), { once: true });
  window.addEventListener('resize', () => scheduleMapRefresh(true));
  window.addEventListener('orientationchange', () => scheduleMapRefresh(true));

  if ('ResizeObserver' in window) {
    state.mapResizeObserver = new ResizeObserver(() => scheduleMapRefresh(false));
    state.mapResizeObserver.observe(document.querySelector('#map'));
    state.mapResizeObserver.observe(document.querySelector('#finlandMap'));
  }
}

async function fetchForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    hourly: 'uv_index,uv_index_clear_sky',
    forecast_days: '7',
    past_days: '1',
    timezone: requestedTimezone(),
    timeformat: 'unixtime'
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
  state.marker.setLngLat([longitude, latitude]);
  state.overviewMarker.setLngLat([longitude, latitude]);
  if (centerMap) state.map.easeTo({ center: [longitude, latitude], zoom: 11.5, duration: 500 });

  const coordinateText = `${formatCoordinate(latitude, 'N', 'S')}, ${formatCoordinate(longitude, 'E', 'W')}`;
  elements.locationName.textContent = name;
  elements.coordinates.textContent = coordinateText;
  elements.usedLocationName.textContent = name;
  elements.usedLocationCoordinates.textContent = coordinateText;
  elements.searchResults.replaceChildren();

  setStatus('Haetaan ennustetta…');
  try {
    state.forecast = await fetchForecast(latitude, longitude);
    state.displayTimezone = state.forecast.timezone || (requestedTimezone() === 'auto' ? 'UTC' : requestedTimezone());
    elements.timezoneStatus.textContent = `Käytössä: ${timezoneDescription()}.`;
    renderAll();
    scheduleMapRefresh(false);
    setStatus('Ennuste päivitetty', 'ready');
  } catch (error) {
    setStatus('Haku epäonnistui', 'error');
    elements.selectedPoint.textContent = error.message;
  }
}

function allRows() {
  const hourly = state.forecast.hourly;
  return hourly.time.map((timestamp, index) => ({
    timestamp: Number(timestamp) * 1000,
    uv: Number(hourly.uv_index[index]),
    clear: Number(hourly.uv_index_clear_sky[index])
  }));
}

function todayRows() {
  const key = dateKey();
  return allRows().filter((row) => dateKey(row.timestamp) === key);
}

function upcomingRows() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  return allRows().filter((row) => row.timestamp >= cutoff);
}

function visibleRows() {
  return state.rangeMode === 'today' ? todayRows() : upcomingRows().slice(0, state.hours);
}

function currentStartHourRow() {
  const now = Date.now();
  const rows = allRows();
  let current = rows[0] || null;
  for (const row of rows) {
    if (row.timestamp > now) break;
    current = row;
  }
  return current;
}

function maxBy(rows, key) {
  return rows.reduce((best, row) => !best || row[key] > best[key] ? row : best, null);
}

function renderSummary() {
  const current = currentStartHourRow();
  const today = todayRows();
  const actualMax = maxBy(today, 'uv');
  const clearMax = maxBy(today, 'clear');

  const currentClock = current ? `klo ${formatDateTime(current.timestamp, true)}` : '';
  elements.currentUv.textContent = formatUv(current?.uv);
  elements.currentUvTime.textContent = currentClock;
  elements.currentUvLevel.textContent = current ? `${uvLevel(current.uv)} · sääennuste huomioitu` : 'Ei tietoa';
  elements.currentClearUv.textContent = formatUv(current?.clear);
  elements.currentClearUvTime.textContent = currentClock;
  elements.currentClearDetail.textContent = current ? 'Pilvetön vertailuarvo' : 'Ei tietoa';
  elements.dataTimeNote.textContent = current ? `Yhteenvedossa käytetty Open-Meteon tuntiarvo: ${formatDateTime(current.timestamp)}. Aikavyöhyke: ${timezoneDescription()}. Arvo valitaan nykyisen alkaneen tunnin tuntipisteestä.` : 'Käytettyä ennusteaikaa ei ole saatavilla.';
  elements.todayMax.textContent = formatUv(actualMax?.uv);
  elements.todayMaxTime.textContent = actualMax ? `Sääennuste huomioitu · ${formatDateTime(actualMax.timestamp, true)}` : 'Ei tietoa';
  elements.clearSkyMax.textContent = formatUv(clearMax?.clear);
  elements.clearSkyMaxTime.textContent = clearMax ? `Pilvetön vertailu · ${formatDateTime(clearMax.timestamp, true)}` : 'Ei tietoa';

  const actual = current?.uv;
  const clear = current?.clear;
  if (!Number.isFinite(actual) || !Number.isFinite(clear)) {
    elements.cloudImpact.textContent = '–';
    elements.cloudImpactDetail.textContent = 'Pilvien vaikutusta ei voitu laskea';
    elements.interpretationText.textContent = 'UV-arvojen tulkintaa ei voitu muodostaa.';
  } else {
    const reduction = clear > 0 ? Math.max(0, Math.min(100, (1 - actual / clear) * 100)) : 0;
    const difference = Math.max(0, clear - actual);
    elements.cloudImpact.textContent = clear > 0 ? `−${Math.round(reduction)} %` : '0 %';
    elements.cloudImpactDetail.textContent = `Noin ${formatUv(difference)} UVI-yksikköä pilvetöntä arvoa alempi`;
    if (Math.abs(clear - actual) < 0.2) {
      elements.interpretationText.textContent = 'Arvot ovat lähes samat. Pilvisyys ei ennusteen mukaan juuri vähennä UV-säteilyä, joten käytä sääennusteen huomioivaa UV-indeksiä.';
    } else {
      elements.interpretationText.textContent = `Käytä tavallisesti sääennusteen huomioivaa arvoa ${formatUv(actual)}. Pilvet pienentävät arvoa tällä tuntipisteellä arviolta ${Math.round(reduction)} % eli ${formatUv(difference)} UVI-yksikköä. Pilvettömän taivaan arvo ${formatUv(clear)} kertoo mahdollisen tason, jos pilvet väistyvät.`;
    }
  }
}

function interpolateThresholdTime(first, second, key) {
  const value1 = first[key];
  const value2 = second[key];
  if (!Number.isFinite(value1) || !Number.isFinite(value2) || value1 === value2) return null;
  const fraction = (PROTECTION_LIMIT - value1) / (value2 - value1);
  if (fraction < 0 || fraction > 1) return null;
  const time1 = first.timestamp;
  const time2 = second.timestamp;
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
  return value ? new Intl.DateTimeFormat('fi-FI', { timeZone: activeTimezone(), hour: '2-digit', minute: '2-digit' }).format(value) : 'Ei tänään';
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

function nextProtectionChangeText(period, now = new Date()) {
  if (!period) return 'Sääennusteen mukaan UVI 3 -raja ei ylity tänään.';
  if (now < period.start) return `Suojautuminen alkaa ${formatDuration(period.start - now)} kuluttua, klo ${formatClock(period.start)}.`;
  if (now <= period.end) return `Suojautumista suositellaan vielä ${formatDuration(period.end - now)}, klo ${formatClock(period.end)} asti.`;
  return `Tämän päivän suojausjakso päättyi klo ${formatClock(period.end)}.`;
}

function protectionPeriods(rows, key) {
  const byDay = new Map();
  for (const row of rows) {
    const keyDate = dateKey(row.timestamp);
    if (!byDay.has(keyDate)) byDay.set(keyDate, []);
    byDay.get(keyDate).push(row);
  }
  return [...byDay.values()].map((dayRows) => protectionPeriod(dayRows, key)).filter(Boolean);
}

function renderProtection() {
  const rows = todayRows();
  const current = currentStartHourRow();
  const actualPeriod = protectionPeriod(rows, 'uv');
  const clearPeriod = protectionPeriod(rows, 'clear');
  const activeActualNow = current?.uv >= PROTECTION_LIMIT;
  const activeClearNow = current?.clear >= PROTECTION_LIMIT;

  elements.actualProtectionStart.textContent = formatClock(actualPeriod?.start);
  elements.actualProtectionEnd.textContent = formatClock(actualPeriod?.end);
  elements.clearProtectionStart.textContent = formatClock(clearPeriod?.start);
  elements.clearProtectionEnd.textContent = formatClock(clearPeriod?.end);
  elements.nextProtectionChange.textContent = nextProtectionChangeText(actualPeriod);

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

function xTickIntervalHours(rowCount) {
  const mobile = window.innerWidth <= 560;
  if (rowCount <= 24) return mobile ? 3 : 2;
  if (rowCount <= 72) return mobile ? 12 : 6;
  return mobile ? 24 : 12;
}

function localHour(timestamp) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: activeTimezone(), hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(timestamp));
  return Number(parts.find((part) => part.type === 'hour')?.value || 0);
}

function formatXAxisTick(timestamp, rowCount) {
  const hour = localHour(timestamp);
  if (rowCount > 24 && hour === 0) {
    return new Intl.DateTimeFormat('fi-FI', {
      timeZone: activeTimezone(), weekday: 'short', day: 'numeric', month: 'numeric'
    }).format(new Date(timestamp));
  }
  return new Intl.DateTimeFormat('fi-FI', {
    timeZone: activeTimezone(), hour: '2-digit', minute: '2-digit'
  }).format(new Date(timestamp));
}

function renderChart(rows) {
  const canvas = document.querySelector('#uvChart');
  const context = canvas.getContext('2d');
  if (state.chart) state.chart.destroy();

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim();
  const muted = styles.getPropertyValue('--muted').trim();
  const clearSkyColor = styles.getPropertyValue('--clear-sky').trim() || '#a26824';
  const border = styles.getPropertyValue('--border').trim();
  const actualPeriods = protectionPeriods(rows, 'uv');
  const clearPeriods = protectionPeriods(rows, 'clear');
  const currentRow = currentStartHourRow();
  const selectedTimestamp = currentRow ? currentRow.timestamp : null;

  const guidePlugin = {
    id: 'timeAndProtectionGuides',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
      const drawBand = (period, fillStyle) => {
        if (!period) return;
        const left = Math.max(x.left, x.getPixelForValue(period.start.getTime()));
        const right = Math.min(x.right, x.getPixelForValue(period.end.getTime()));
        if (right <= left) return;
        ctx.save();
        ctx.fillStyle = fillStyle;
        ctx.fillRect(left, top, right - left, bottom - top);
        ctx.restore();
      };
      clearPeriods.forEach((period) => drawBand(period, 'rgba(162, 104, 36, 0.08)'));
      actualPeriods.forEach((period) => drawBand(period, 'rgba(31, 111, 120, 0.12)'));
    },
    afterDatasetsDraw(chart) {
      const now = Date.now();
      const firstTime = rows.length ? rows[0].timestamp : NaN;
      const lastTime = rows.length ? rows[rows.length - 1].timestamp : NaN;
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
    plugins: [guidePlugin],
    data: {
      datasets: [
        {
          label: 'Sääennuste huomioitu',
          data: rows.map((row) => ({ x: row.timestamp, y: row.uv })),
          borderColor: accent,
          backgroundColor: accent,
          borderWidth: 2.5,
          pointRadius: rows.map((row) => row.timestamp === selectedTimestamp ? 6 : (rows.length <= 72 ? 2.2 : 1.2)),
          pointBackgroundColor: rows.map((row) => row.timestamp === selectedTimestamp ? '#b03a2e' : accent),
          pointBorderWidth: rows.map((row) => row.timestamp === selectedTimestamp ? 2 : 0),
          pointBorderColor: '#ffffff',
          pointHoverRadius: 6,
          tension: 0.22,
          fill: false
        },
        {
          label: 'Pilvetön taivas',
          data: rows.map((row) => ({ x: row.timestamp, y: row.clear })),
          borderColor: clearSkyColor,
          backgroundColor: clearSkyColor,
          borderWidth: 1.7,
          borderDash: [6, 5],
          pointRadius: rows.map((row) => row.timestamp === selectedTimestamp ? 5 : (rows.length <= 72 ? 1.8 : 1)),
          pointBackgroundColor: rows.map((row) => row.timestamp === selectedTimestamp ? '#b03a2e' : clearSkyColor),
          pointBorderWidth: rows.map((row) => row.timestamp === selectedTimestamp ? 2 : 0),
          pointBorderColor: '#ffffff',
          pointHoverRadius: 5,
          tension: 0.22,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      interaction: { mode: 'index', intersect: false },
      onClick: (_event, active) => {
        if (!active.length) return;
        const row = rows[active[0].index];
        elements.selectedPoint.textContent = `Valittu ${formatDateTime(row.timestamp)} · sääennuste huomioitu ${formatUv(row.uv)} (${uvLevel(row.uv)}) · pilvetön taivas ${formatUv(row.clear)}`;
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
          min: rows.length ? rows[0].timestamp : undefined,
          max: rows.length ? rows[rows.length - 1].timestamp : undefined,
          grid: {
            display: true,
            drawTicks: true,
            color: (context) => {
              const first = rows[0]?.timestamp || 0;
              const hourIndex = Math.round((Number(context.tick?.value) - first) / 3600000);
              return hourIndex % 6 === 0 ? 'rgba(102, 117, 125, 0.22)' : 'rgba(102, 117, 125, 0.10)';
            },
            lineWidth: (context) => {
              const first = rows[0]?.timestamp || 0;
              const hourIndex = Math.round((Number(context.tick?.value) - first) / 3600000);
              return hourIndex % 6 === 0 ? 1 : 0.7;
            }
          },
          ticks: {
            stepSize: 60 * 60 * 1000,
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0,
            callback: (value) => {
              const first = rows[0]?.timestamp || Number(value);
              const hourIndex = Math.round((Number(value) - first) / 3600000);
              const interval = xTickIntervalHours(rows.length);
              if (hourIndex % interval !== 0 && !(rows.length > 24 && localHour(Number(value)) === 0)) return '';
              return formatXAxisTick(Number(value), rows.length);
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
  const currentHour = currentStartHourRow()?.timestamp;
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.timestamp === currentHour) {
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
  const selected = currentStartHourRow();
  elements.selectedPoint.textContent = selected
    ? `Valittu nyt: ${formatDateTime(selected.timestamp)} · sääennuste huomioitu ${formatUv(selected.uv)} (${uvLevel(selected.uv)}) · pilvetön taivas ${formatUv(selected.clear)}`
    : 'Nykyisen tunnin tietoa ei ole saatavilla.';
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

function startTimeFollower() {
  if (state.clockTimer) clearInterval(state.clockTimer);
  state.lastForecastHour = `${dateKey()}-${formatDateTime(Date.now(), true).slice(0, 2)}`;
  state.clockTimer = setInterval(async () => {
    if (!state.forecast) return;
    const now = new Date();
    const hourKey = `${dateKey(now.getTime())}-${formatDateTime(now.getTime(), true).slice(0, 2)}`;
    const needsFreshForecast = state.lastForecastHour !== hourKey;
    state.lastForecastHour = hourKey;
    if (needsFreshForecast) {
      try {
        state.forecast = await fetchForecast(state.latitude, state.longitude);
      } catch (_error) {
        // Säilytä viimeisin onnistunut ennuste, jos tuntipäivitys epäonnistuu.
      }
    }
    renderAll();
  }, 60 * 1000);
}

function bindEvents() {
  elements.searchButton.addEventListener('click', searchAddress);
  elements.addressInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') searchAddress(); });
  elements.gpsButton.addEventListener('click', useGps);
  elements.timezoneMode.addEventListener('change', () => {
    elements.customTimezone.classList.toggle('is-hidden', elements.timezoneMode.value !== 'custom');
    if (elements.timezoneMode.value === 'custom') elements.customTimezone.focus();
  });
  elements.applyTimezone.addEventListener('click', async () => {
    state.timezoneMode = elements.timezoneMode.value;
    state.customTimezone = elements.customTimezone.value;
    const zone = requestedTimezone();
    if (state.timezoneMode === 'custom' && !isValidTimezone(zone)) {
      elements.timezoneStatus.textContent = 'Aikavyöhykettä ei tunnistettu. Käytä IANA-muotoa, esimerkiksi Europe/London.';
      return;
    }
    await chooseLocation(state.latitude, state.longitude, state.locationName, false);
  });
  elements.customTimezone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') elements.applyTimezone.click();
  });
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
  startTimeFollower();
  await chooseLocation(HELSINKI.latitude, HELSINKI.longitude, HELSINKI.name, false);
}

init();
