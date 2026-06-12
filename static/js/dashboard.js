/* LoraMap — Dashboard JS */

const DEVICE_COLORS = [
    '#E53935', '#1E88E5', '#43A047', '#F4511E',
    '#8E24AA', '#00ACC1', '#FB8C00', '#D81B60',
    '#6D4C41', '#546E7A', '#7CB342', '#3949AB',
    '#00897B', '#C0CA33', '#5E35B1', '#FDD835',
    '#8D6E63', '#5C6BC0', '#26A69A', '#9CCC65',
    '#FF7043', '#EC407A', '#AB47BC', '#29B6F6',
    '#66BB6A', '#FFCA28', '#FFA726', '#BDBDBD',
    '#78909C', '#26C6DA', '#D4E157', '#EF5350',
    '#C62828', '#1565C0', '#2E7D32', '#E65100',
    '#6A1B9A', '#00838F', '#EF6C00', '#AD1457',
    '#4E342E', '#37474F', '#558B2F', '#283593',
    '#00695C', '#9E9D24', '#4527A0', '#F9A825',
    '#A1887F', '#7986CB', '#4DB6AC', '#AED581',
    '#FF8A65', '#F48FB1', '#CE93D8', '#81D4FA',
    '#A5D6A7', '#FFE082', '#FFCC80', '#E0E0E0',
    '#90A4AE', '#80DEEA', '#E6EE9C', '#EF9A9A',
];

// metric -> { chart instance, label, unit }
const CHART_DEFS = {
    battery:       { label: 'Battery Over Time',        unit: '%'   },
    air_temperature: { label: 'Air Temperature Over Time', unit: '°C' },
    light:         { label: 'Light Over Time',           unit: ''    },
    positioning_status: { label: 'Positioning Status Over Time', unit: '', categorical: true },
    event_status:  { label: 'Event Status Over Time', unit: '', categorical: true },
    rssi:          { label: 'RSSI Over Time',            unit: 'dBm' },
    channel_rssi:  { label: 'Channel RSSI Over Time',   unit: 'dBm' },
    snr:           { label: 'SNR Over Time',             unit: 'dB'  },
    channel_index: { label: 'Channel Index Over Time',  unit: ''    },
};

const QUICK_RANGE_DAYS = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
};

const charts = {};   // metric -> Chart instance
let deviceList = [];
let allDevices = [];
let activeQuickRange = null;
let customDeviceColors = {};

function loadCustomColors() {
    customDeviceColors = {};
}

async function fetchCustomColors() {
    try {
        const resp = await fetch('/api/device_colors');
        if (!resp.ok) return;
        const data = await resp.json();
        const colors = data && typeof data.colors === 'object' ? data.colors : {};
        customDeviceColors = colors || {};
    } catch {
        customDeviceColors = {};
    }
}

function normalizeColor(color) {
    if (typeof color !== 'string') return null;
    const c = color.trim().toUpperCase();
    return DEVICE_COLORS.includes(c) ? c : null;
}

function getDeviceColor(deviceId) {
    const custom = normalizeColor(customDeviceColors[deviceId]);
    if (custom) return custom;

    const key = String(deviceId || '');
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    }
    return DEVICE_COLORS[hash % DEVICE_COLORS.length];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function loadDashboard() {
    loadCustomColors();
    await fetchCustomColors();
    const resp = await fetch('/api/devices');
    if (!resp.ok) return;
    const data = await resp.json();
    allDevices = data.devices || [];
    populateFilterDeviceSelect(allDevices);
    setQuickRange('week', false);
    await refreshDashboard();
}

async function refreshDashboard() {
    const params = getFilterParams();
    const resp = await fetch('/api/devices?' + params);
    if (!resp.ok) return;
    const data = await resp.json();
    deviceList = data.devices || [];

    renderDeviceTable(deviceList);
    populateDeviceSelects(deviceList);
    for (const metric of Object.keys(CHART_DEFS)) {
        await updateChart(metric);
    }
}

function populateFilterDeviceSelect(devices) {
    const sel = document.getElementById('filter-device');
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.device_id;
        opt.textContent = d.device_id;
        sel.appendChild(opt);
    });
}

function getFilterParams() {
    const params = new URLSearchParams();
    const device = document.getElementById('filter-device').value;
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;
    if (device) params.set('devices', device);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params;
}

function applyFilters() {
    setQuickRangeActive(null);
    refreshDashboard();
}

function clearFilters() {
    document.getElementById('filter-device').value = '';
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    setQuickRangeActive(null);
    refreshDashboard();
}

function setQuickRange(rangeKey, shouldLoad = true) {
    const days = QUICK_RANGE_DAYS[rangeKey];
    if (!days) return;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    document.getElementById('filter-from').value = toUtcDatetimeLocalValue(from);
    document.getElementById('filter-to').value = toUtcDatetimeLocalValue(now);
    setQuickRangeActive(rangeKey);

    if (shouldLoad) refreshDashboard();
}

function setQuickRangeActive(rangeKey) {
    activeQuickRange = rangeKey;
    Object.keys(QUICK_RANGE_DAYS).forEach(key => {
        const el = document.getElementById(`range-${key}`);
        if (el) el.classList.toggle('active', key === activeQuickRange);
    });
}

function toUtcDatetimeLocalValue(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function formatTimeAgo(seconds) {
    if (seconds == null) return '—';
    if (seconds < 60)   return seconds + 's ago';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

function v(val, suffix = '') {
    return val != null ? val + suffix : '—';
}

function batteryBadge(battery) {
    if (battery == null) return '—';
    const cls = battery < 25 ? 'ago-old' : battery < 50 ? 'ago-warn' : 'ago-ok';
    return `<span class="ago-badge ${cls}">${battery} %</span>`;
}

function fmt(iso) {
    return iso ? new Date(iso).toLocaleString() : '—';
}

function dualTime(realIso, receivedIso) {
    if (!realIso && !receivedIso) return '—';
    return `<span>Real: ${fmt(realIso)}</span><br><span class="muted small">Received: ${fmt(receivedIso)}</span>`;
}

function renderColorPicker(deviceId, color) {
    const encodedId = encodeURIComponent(deviceId);
    return `<details class="color-picker">
        <summary>
            <span class="device-color-dot" style="background:${color}"></span>
            <span class="mono small">${color}</span>
        </summary>
        <div class="color-grid">
            ${DEVICE_COLORS.map(c => `
                <button
                    type="button"
                    class="color-chip ${c === color ? 'selected' : ''}"
                    title="${c}"
                    aria-label="Set color ${c}"
                    style="background:${c}"
                    onclick="setDeviceColor('${encodedId}', '${c}')"></button>
            `).join('')}
        </div>
    </details>`;
}

function renderDeviceTable(devices) {
    const tbody = document.getElementById('device-table-body');
    const cards = document.getElementById('device-summary-cards');
    if (!devices.length) {
        tbody.innerHTML = '<tr><td colspan="19" class="muted">No data yet. Add a data source and fetch.</td></tr>';
        cards.innerHTML = '<p class="muted">No data yet. Add a data source and fetch.</p>';
        return;
    }

    tbody.innerHTML = devices.map(d => {
        const pos = (d.last_latitude != null && d.last_longitude != null)
            ? `${d.last_latitude.toFixed(5)}, ${d.last_longitude.toFixed(5)}
               <a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.last_latitude},${d.last_longitude}`)}" target="_blank" rel="noopener">Map</a>`
            : '—';

        const lastSeen = dualTime(d.last_real_timestamp, d.last_received_at);
        const lastGps = dualTime(d.last_gps_at, d.last_gps_received_at);

        const agoClass = d.seconds_ago != null && d.seconds_ago > 7200 ? 'ago-old' :
                         d.seconds_ago != null && d.seconds_ago > 1800 ? 'ago-warn' : 'ago-ok';
        const gpsAgoClass = d.gps_seconds_ago != null && d.gps_seconds_ago > 7200 ? 'ago-old' :
                            d.gps_seconds_ago != null && d.gps_seconds_ago > 1800 ? 'ago-warn' : 'ago-ok';

        const color = getDeviceColor(d.device_id);

        return `<tr>
            <td>
                <strong>${d.device_id}</strong>
                ${renderColorPicker(d.device_id, color)}
            </td>
            <td class="mono col-hide-mobile">${pos}</td>
            <td class="mono small col-hide-mobile">${lastGps}</td>
            <td class="col-hide-mobile"><span class="ago-badge ${gpsAgoClass}">${formatTimeAgo(d.gps_seconds_ago)}</span></td>
            <td>${batteryBadge(d.last_battery)}</td>
            <td>${v(d.last_air_temperature, ' °C')}</td>
            <td class="col-hide-mobile">${v(d.last_light)}</td>
            <td class="col-hide-mobile">${v(d.last_positioning_status)}</td>
            <td class="col-hide-mobile">${v(d.last_event_status)}</td>
            <td>${v(d.last_rssi, ' dBm')}</td>
            <td class="col-hide-mobile">${v(d.last_snr, ' dB')}</td>
            <td class="col-hide-mobile">${v(d.last_channel_index)}</td>
            <td class="col-hide-mobile">${d.last_spreading_factor != null ? 'SF' + d.last_spreading_factor : '—'}</td>
            <td class="col-hide-mobile">${d.last_bandwidth != null ? d.last_bandwidth / 1000 + ' kHz' : '—'}</td>
            <td class="col-hide-mobile">${v(d.last_coding_rate)}</td>
            <td class="col-hide-mobile">${v(d.last_consumed_airtime)}</td>
            <td class="mono">${lastSeen}</td>
            <td><span class="ago-badge ${agoClass}">${formatTimeAgo(d.seconds_ago)}</span></td>
            <td class="col-hide-mobile">${d.message_count}</td>
        </tr>`;
    }).join('');

    cards.innerHTML = devices.map(d => {
        const hasPosition = d.last_latitude != null && d.last_longitude != null;
        const mapUrl = hasPosition
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.last_latitude},${d.last_longitude}`)}`
            : null;
        const agoClass = d.seconds_ago != null && d.seconds_ago > 7200 ? 'ago-old' :
                         d.seconds_ago != null && d.seconds_ago > 1800 ? 'ago-warn' : 'ago-ok';
        const gpsAgoClass = d.gps_seconds_ago != null && d.gps_seconds_ago > 7200 ? 'ago-old' :
                            d.gps_seconds_ago != null && d.gps_seconds_ago > 1800 ? 'ago-warn' : 'ago-ok';
        const color = getDeviceColor(d.device_id);

        return `<article class="device-summary-card">
            <div class="device-summary-card-header">
                <div>
                    <strong class="device-summary-name">${d.device_id}</strong>
                    ${renderColorPicker(d.device_id, color)}
                </div>
                <span class="ago-badge ${agoClass}">${formatTimeAgo(d.seconds_ago)}</span>
            </div>

            <div class="device-summary-primary">
                <div><span>Battery</span><strong>${batteryBadge(d.last_battery)}</strong></div>
                <div><span>Temperature</span><strong>${v(d.last_air_temperature, ' °C')}</strong></div>
                <div><span>Light</span><strong>${v(d.last_light)}</strong></div>
                <div><span>Positioning status</span><strong>${v(d.last_positioning_status)}</strong></div>
                <div><span>Event status</span><strong>${v(d.last_event_status)}</strong></div>
                <div><span>RSSI</span><strong>${v(d.last_rssi, ' dBm')}</strong></div>
                <div><span>SNR</span><strong>${v(d.last_snr, ' dB')}</strong></div>
                <div><span>Messages</span><strong>${d.message_count}</strong></div>
            </div>

            ${mapUrl ? `<a class="btn btn-secondary btn-sm device-map-link" href="${mapUrl}" target="_blank" rel="noopener">
                View last position on map
            </a>` : '<p class="muted small">No position available</p>'}

            <details class="device-summary-details">
                <summary>More details</summary>
                <div class="device-summary-detail-grid">
                    <div><span>Last seen</span><strong>${fmt(d.last_real_timestamp)}</strong></div>
                    <div><span>Received</span><strong>${fmt(d.last_received_at)}</strong></div>
                    <div><span>GPS age</span><strong><span class="ago-badge ${gpsAgoClass}">${formatTimeAgo(d.gps_seconds_ago)}</span></strong></div>
                    <div><span>Last GPS</span><strong>${fmt(d.last_gps_at)}</strong></div>
                    <div><span>Position</span><strong>${hasPosition ? `${d.last_latitude.toFixed(5)}, ${d.last_longitude.toFixed(5)}` : '—'}</strong></div>
                    <div><span>Channel</span><strong>${v(d.last_channel_index)}</strong></div>
                    <div><span>Spreading factor</span><strong>${d.last_spreading_factor != null ? 'SF' + d.last_spreading_factor : '—'}</strong></div>
                    <div><span>Bandwidth</span><strong>${d.last_bandwidth != null ? d.last_bandwidth / 1000 + ' kHz' : '—'}</strong></div>
                    <div><span>Coding rate</span><strong>${v(d.last_coding_rate)}</strong></div>
                    <div><span>Airtime</span><strong>${v(d.last_consumed_airtime)}</strong></div>
                </div>
            </details>
        </article>`;
    }).join('');
}

async function setDeviceColor(encodedDeviceId, color) {
    const deviceId = decodeURIComponent(encodedDeviceId);
    const normalized = normalizeColor(color);
    if (!normalized) return;
    const resp = await fetch('/api/device_colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, color: normalized }),
    });
    if (!resp.ok) return;
    customDeviceColors[deviceId] = normalized;
    renderDeviceTable(deviceList);
    for (const metric of Object.keys(CHART_DEFS)) {
        await updateChart(metric);
    }
}

// ---------------------------------------------------------------------------
// Device selects
// ---------------------------------------------------------------------------

function populateDeviceSelects(devices) {
    for (const metric of Object.keys(CHART_DEFS)) {
        const sel = document.getElementById('sel-' + metric);
        if (!sel) continue;
        const currentVal = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.device_id;
            opt.textContent = d.device_id;
            sel.appendChild(opt);
        });
        sel.value = currentVal;
    }
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

async function updateChart(metric) {
    const def = CHART_DEFS[metric];
    if (!def) return;

    const sel = document.getElementById('sel-' + metric);
    const deviceId = sel ? sel.value : '';
    const yLabel = def.unit ? `${metric.replace(/_/g, ' ')} (${def.unit})` : metric.replace(/_/g, ' ');

    const datasets = [];
    const devicesToFetch = deviceId ? [{ device_id: deviceId }] : deviceList;

    for (let i = 0; i < devicesToFetch.length; i++) {
        const id = devicesToFetch[i].device_id;
        const params = getFilterParams();
        params.delete('devices');
        params.set('device_id', id);
        params.set('metric', metric);
        const resp = await fetch('/api/chart_data?' + params);
        if (!resp.ok) continue;
        const data = await resp.json();

        if (data.data && data.data.length > 0) {
            const color = getDeviceColor(id);
            datasets.push({
                label: id,
                data: data.data.map(d => ({ x: new Date(d.real_timestamp), y: d[metric] })),
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.3,
                fill: false,
            });
        }
    }

    if (charts[metric]) charts[metric].destroy();

    const ctx = document.getElementById('chart-' + metric).getContext('2d');
    charts[metric] = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        tooltipFormat: 'MMM d, HH:mm',
                        displayFormats: { hour: 'HH:mm', day: 'MMM d' },
                    },
                    title: { display: true, text: 'Time', color: '#757575' },
                    grid: { color: '#F0F0F0' },
                },
                y: {
                    type: def.categorical ? 'category' : 'linear',
                    title: { display: true, text: yLabel, color: '#757575' },
                    grid: { color: '#F0F0F0' },
                },
            },
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: def.label, font: { size: 13 }, color: '#424242' },
            },
        },
    });
}
