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
    rssi:          { label: 'RSSI Over Time',            unit: 'dBm' },
    channel_rssi:  { label: 'Channel RSSI Over Time',   unit: 'dBm' },
    snr:           { label: 'SNR Over Time',             unit: 'dB'  },
    channel_index: { label: 'Channel Index Over Time',  unit: ''    },
    consumed_airtime: { label: 'Airtime Over Time', unit: 'ms' },
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
let customDeviceNames = {};
let boardOptions = [];

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

async function fetchCustomNames() {
    try {
        const resp = await fetch('/api/device_names');
        if (!resp.ok) return;
        const data = await resp.json();
        customDeviceNames = data && typeof data.names === 'object' ? data.names : {};
    } catch {
        customDeviceNames = {};
    }
}

function getDeviceName(deviceId) {
    const shortName = customDeviceNames[deviceId];
    return typeof shortName === 'string' && shortName.trim() ? shortName.trim() : deviceId;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
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
    await Promise.all([fetchCustomColors(), fetchCustomNames()]);
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

    updateBoardFilterOptions();
    renderDeviceTable(deviceList);
    populateDeviceSelects(deviceList);
    for (const metric of Object.keys(CHART_DEFS)) {
        await updateChart(metric);
    }
}

function populateFilterDeviceSelect(devices) {
    const sel = document.getElementById('filter-device');
    const currentVal = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.device_id;
        opt.textContent = getDeviceName(d.device_id);
        sel.appendChild(opt);
    });
    sel.value = currentVal;
}

function getFilterParams() {
    const params = new URLSearchParams();
    const device = document.getElementById('filter-device').value;
    const board = document.getElementById('filter-board').value;
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;
    if (device) params.set('devices', device);
    if (board) params.set('board', board);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params;
}

function updateBoardFilterOptions() {
    const select = document.getElementById('filter-board');
    if (!select) return;
    const currentValue = select.value;

    for (const device of allDevices) {
        if (device.device_model && !boardOptions.includes(device.device_model)) {
            boardOptions.push(device.device_model);
        }
    }
    boardOptions.sort((a, b) => a.localeCompare(b));

    select.innerHTML = '<option value="">All boards</option>';
    boardOptions.forEach(board => {
        const option = document.createElement('option');
        option.value = board;
        option.textContent = board;
        select.appendChild(option);
    });

    if (currentValue && boardOptions.includes(currentValue)) {
        select.value = currentValue;
    }
}

function applyFilters() {
    setQuickRangeActive(null);
    refreshDashboard();
}

function clearFilters() {
    document.getElementById('filter-device').value = '';
    document.getElementById('filter-board').value = '';
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

function environmentBadge(value, suffix, cls) {
    if (value == null) return '<span class="muted">—</span>';
    return `<span class="ago-badge ${cls}">${value}${suffix}</span>`;
}

function environmentValues(temperature, light) {
    return `<div class="environment-values">
        <div><span>Temperature</span>${environmentBadge(temperature, ' °C', 'env-temperature')}</div>
        <div><span>Light</span>${environmentBadge(light, '', 'env-light')}</div>
    </div>`;
}

function statusValues(positioningStatus, eventStatus) {
    return `<div class="summary-stacked-values">
        <div><span>Position</span><strong>${v(positioningStatus)}</strong></div>
        <div><span>Event</span><strong>${v(eventStatus)}</strong></div>
    </div>`;
}

function radioValues(device) {
    return `<div class="summary-stacked-values radio-values">
        <div><span>RSSI</span><strong>${v(device.last_rssi, ' dBm')}</strong></div>
        <div><span>SNR</span><strong>${v(device.last_snr, ' dB')}</strong></div>
        <div><span>Channel</span><strong>${v(device.last_channel_index)}</strong></div>
    </div>`;
}

function loraConfigurationValues(device) {
    return `<div class="summary-stacked-values lora-configuration-values">
        <div><span>SF</span><strong>${device.last_spreading_factor != null ? 'SF' + device.last_spreading_factor : '—'}</strong></div>
        <div><span>Bandwidth</span><strong>${device.last_bandwidth != null ? device.last_bandwidth / 1000 + ' kHz' : '—'}</strong></div>
        <div><span>Coding rate</span><strong>${v(device.last_coding_rate)}</strong></div>
    </div>`;
}

function fmt(iso) {
    return iso ? new Date(iso).toLocaleString() : '—';
}

function dualTime(realIso, receivedIso, footer = '') {
    if (!realIso && !receivedIso) return '—';
    return `<span>Real: ${fmt(realIso)}</span><br>
        <span class="muted small">Received: ${fmt(receivedIso)}</span>
        ${footer ? `<div class="summary-time-footer">${footer}</div>` : ''}`;
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

function renderShortNameEditor(deviceId) {
    const encodedId = encodeURIComponent(deviceId);
    const shortName = customDeviceNames[deviceId] || '';
    return `<div class="device-name-editor">
        <div>
            <span class="device-name-label">Real name</span>
            <strong class="mono" title="${escapeHtml(deviceId)}">${escapeHtml(deviceId)}</strong>
        </div>
        <label class="device-name-controls">
            <span class="device-name-label">Short name</span>
            <input type="text"
                   maxlength="50"
                   value="${escapeHtml(shortName)}"
                   placeholder="Uses real name when empty"
                   aria-label="Short name for ${escapeHtml(deviceId)}"
                   onkeydown="if (event.key === 'Enter') saveDeviceName('${encodedId}', this)"
                   onchange="saveDeviceName('${encodedId}', this)">
        </label>
    </div>`;
}

function renderDeviceTable(devices) {
    const tbody = document.getElementById('device-table-body');
    const cards = document.getElementById('device-summary-cards');
    if (!devices.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="muted">No data yet. Add a data source and fetch.</td></tr>';
        cards.innerHTML = '<p class="muted">No data yet. Add a data source and fetch.</p>';
        return;
    }

    tbody.innerHTML = devices.map(d => {
        const pos = (d.last_latitude != null && d.last_longitude != null)
            ? `${d.last_latitude.toFixed(5)}, ${d.last_longitude.toFixed(5)}
               <a class="btn btn-ghost btn-sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.last_latitude},${d.last_longitude}`)}" target="_blank" rel="noopener">Map</a>`
            : '—';

        const agoClass = d.seconds_ago != null && d.seconds_ago > 7200 ? 'ago-old' :
                         d.seconds_ago != null && d.seconds_ago > 1800 ? 'ago-warn' : 'ago-ok';
        const gpsAgoClass = d.gps_seconds_ago != null && d.gps_seconds_ago > 7200 ? 'ago-old' :
                            d.gps_seconds_ago != null && d.gps_seconds_ago > 1800 ? 'ago-warn' : 'ago-ok';
        const lastSeen = dualTime(
            d.last_real_timestamp,
            d.last_received_at,
            `<span class="ago-badge ${agoClass}">${formatTimeAgo(d.seconds_ago)}</span>`,
        );
        const lastGps = dualTime(
            d.last_gps_at,
            d.last_gps_received_at,
            `<span class="ago-badge ${gpsAgoClass}">${formatTimeAgo(d.gps_seconds_ago)}</span>`,
        );

        const color = getDeviceColor(d.device_id);

        return `<tr>
            <td>
                ${renderShortNameEditor(d.device_id)}
                ${renderColorPicker(d.device_id, color)}
            </td>
            <td class="mono col-hide-mobile">${pos}</td>
            <td class="mono">${lastSeen}</td>
            <td class="mono small col-hide-mobile">${lastGps}</td>
            <td>${batteryBadge(d.last_battery)}</td>
            <td class="col-hide-mobile">${environmentValues(d.last_air_temperature, d.last_light)}</td>
            <td class="col-hide-mobile">${statusValues(d.last_positioning_status, d.last_event_status)}</td>
            <td class="col-hide-mobile">${radioValues(d)}</td>
            <td class="col-hide-mobile">${loraConfigurationValues(d)}</td>
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
                    ${renderShortNameEditor(d.device_id)}
                    ${renderColorPicker(d.device_id, color)}
                </div>
                <span class="ago-badge ${agoClass}">${formatTimeAgo(d.seconds_ago)}</span>
            </div>

            <div class="device-summary-primary">
                <div><span>Battery</span><strong>${batteryBadge(d.last_battery)}</strong></div>
                <div><span>Environment</span>${environmentValues(d.last_air_temperature, d.last_light)}</div>
                <div><span>Status</span>${statusValues(d.last_positioning_status, d.last_event_status)}</div>
                <div><span>Radio</span>${radioValues(d)}</div>
                <div><span>LoRa configuration</span>${loraConfigurationValues(d)}</div>
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

async function saveDeviceName(encodedDeviceId, input) {
    const deviceId = decodeURIComponent(encodedDeviceId);
    const shortName = input.value.trim();
    input.disabled = true;
    try {
        const resp = await fetch('/api/device_names', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId, short_name: shortName }),
        });
        if (!resp.ok) return;
        if (shortName) customDeviceNames[deviceId] = shortName;
        else delete customDeviceNames[deviceId];
        renderDeviceTable(deviceList);
        populateFilterDeviceSelect(allDevices);
        populateDeviceSelects(deviceList);
        for (const metric of Object.keys(CHART_DEFS)) {
            await updateChart(metric);
        }
    } finally {
        input.disabled = false;
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
            opt.textContent = getDeviceName(d.device_id);
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
                label: getDeviceName(id),
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
                        tooltipFormat: 'd MMM, HH:mm',
                        displayFormats: {
                            minute: 'd MMM HH:mm',
                            hour: 'd MMM HH:mm',
                            day: 'd MMM',
                            month: 'MMM yyyy',
                        },
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
