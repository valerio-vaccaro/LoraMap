/* LoraMap — Data page JS */
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
const QUICK_RANGE_DAYS = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
};
const CHART_DEFS = {
    battery: { label: 'Battery Over Time', unit: '%' },
    air_temperature: { label: 'Temperature Over Time', unit: '°C' },
    light: { label: 'Luminosity Over Time', unit: '' },
};
let activeQuickRange = null;
let customDeviceColors = {};
let customDeviceNames = {};
let devices = [];
const charts = {};

async function loadCustomColors() {
    try {
        const resp = await fetch('/api/device_colors');
        if (!resp.ok) return;
        const data = await resp.json();
        customDeviceColors = data && typeof data.colors === 'object' ? data.colors : {};
    } catch {
        customDeviceColors = {};
    }
}

async function loadCustomNames() {
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

function getDeviceColor(deviceId) {
    const custom = customDeviceColors[deviceId];
    const normalized = typeof custom === 'string' ? custom.trim().toUpperCase() : null;
    if (normalized && DEVICE_COLORS.includes(normalized)) return normalized;

    const key = String(deviceId || '');
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    }
    return DEVICE_COLORS[hash % DEVICE_COLORS.length];
}

async function loadData() {
    await Promise.all([loadCustomColors(), loadCustomNames()]);
    // Populate device select
    const devResp = await fetch('/api/devices');
    if (devResp.ok) {
        const devData = await devResp.json();
        devices = devData.devices || [];
        const sel = document.getElementById('filter-device');
        devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.device_id;
            opt.textContent = getDeviceName(d.device_id);
            sel.appendChild(opt);
        });
    }

    setQuickRange('week', false);
    updateLastUpdateUtc();
    await refreshDataView();
}

async function refreshDataView() {
    await Promise.all([
        fetchMessages(),
        updateCharts(),
    ]);
}

function getFilterParams() {
    const device  = document.getElementById('filter-device').value;
    const from    = document.getElementById('filter-from').value;
    const to      = document.getElementById('filter-to').value;
    const batteryMin = document.getElementById('filter-battery-min').value;
    const batteryMax = document.getElementById('filter-battery-max').value;
    const temperatureMin = document.getElementById('filter-temperature-min').value;
    const temperatureMax = document.getElementById('filter-temperature-max').value;
    const lightMin = document.getElementById('filter-light-min').value;
    const lightMax = document.getElementById('filter-light-max').value;

    const params = new URLSearchParams();
    if (device) params.set('devices', device);
    if (from)   params.set('from', from);
    if (to)     params.set('to', to);
    if (batteryMin) params.set('battery_min', batteryMin);
    if (batteryMax) params.set('battery_max', batteryMax);
    if (temperatureMin) params.set('air_temperature_min', temperatureMin);
    if (temperatureMax) params.set('air_temperature_max', temperatureMax);
    if (lightMin) params.set('light_min', lightMin);
    if (lightMax) params.set('light_max', lightMax);

    return params;
}

async function fetchMessages() {
    const params = getFilterParams();

    const tbody = document.getElementById('messages-tbody');
    tbody.innerHTML = '<tr><td colspan="22" class="muted">Loading…</td></tr>';

    const resp = await fetch('/api/messages?' + params);
    if (!resp.ok) {
        tbody.innerHTML = '<tr><td colspan="22" class="muted">Failed to load data.</td></tr>';
        return;
    }
    const data = await resp.json();
    renderTable(data.messages || []);
    updateLastUpdateUtc();
}

function applyFilters() {
    setQuickRangeActive(null);
    refreshDataView();
}

function clearFilters() {
    document.getElementById('filter-device').value = '';
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    document.getElementById('filter-battery-min').value = '';
    document.getElementById('filter-battery-max').value = '';
    document.getElementById('filter-temperature-min').value = '';
    document.getElementById('filter-temperature-max').value = '';
    document.getElementById('filter-light-min').value = '';
    document.getElementById('filter-light-max').value = '';
    setQuickRangeActive(null);
    refreshDataView();
}

function setQuickRange(rangeKey, shouldLoad = true) {
    const days = QUICK_RANGE_DAYS[rangeKey];
    if (!days) return;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    document.getElementById('filter-from').value = toUtcDatetimeLocalValue(from);
    document.getElementById('filter-to').value = toUtcDatetimeLocalValue(now);
    setQuickRangeActive(rangeKey);

    if (shouldLoad) {
        refreshDataView();
    }
}

function setQuickRangeActive(rangeKey) {
    activeQuickRange = rangeKey;
    Object.keys(QUICK_RANGE_DAYS).forEach(key => {
        const el = document.getElementById(`range-${key}`);
        if (!el) return;
        el.classList.toggle('active', key === activeQuickRange);
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

function updateLastUpdateUtc(date = new Date()) {
    const el = document.getElementById('last-update-utc');
    if (!el) return;
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    el.textContent = `${y}-${m}-${d} ${h}:${min}:${s} UTC`;
}

function v(val, suffix = '') {
    return val != null ? val + suffix : '—';
}

function batteryBadge(battery) {
    if (battery == null) return '—';
    const cls = battery < 25 ? 'ago-old' : battery < 50 ? 'ago-warn' : 'ago-ok';
    return `<span class="ago-badge ${cls}">${battery} %</span>`;
}

function formatMetricValue(metric, value) {
    if (value == null) return '—';
    if (metric === 'battery') return `${value} %`;
    if (metric === 'air_temperature') return `${value} °C`;
    return value;
}

async function updateCharts() {
    await Promise.all(Object.keys(CHART_DEFS).map(metric => updateChart(metric)));
}

async function updateChart(metric) {
    const def = CHART_DEFS[metric];
    if (!def) return;

    const params = getFilterParams();
    const selectedDeviceId = document.getElementById('filter-device').value;
    const devicesToFetch = selectedDeviceId
        ? devices.filter(device => device.device_id === selectedDeviceId)
        : devices;
    const datasets = [];

    for (const device of devicesToFetch) {
        params.delete('devices');
        params.set('device_id', device.device_id);
        params.set('metric', metric);

        const resp = await fetch('/api/chart_data?' + params);
        if (!resp.ok) continue;

        const data = await resp.json();
        if (!data.data || !data.data.length) continue;

        const color = getDeviceColor(device.device_id);
        datasets.push({
            label: getDeviceName(device.device_id),
            data: data.data.map(point => ({ x: new Date(point.real_timestamp), y: point[metric] })),
            borderColor: color,
            backgroundColor: `${color}20`,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: false,
        });
    }

    if (charts[metric]) charts[metric].destroy();

    const canvas = document.getElementById(`chart-${metric}`);
    if (!canvas) return;

    charts[metric] = new Chart(canvas.getContext('2d'), {
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
                    title: {
                        display: true,
                        text: def.unit ? `${def.label.replace(' Over Time', '')} (${def.unit})` : def.label.replace(' Over Time', ''),
                        color: '#757575',
                    },
                    grid: { color: '#F0F0F0' },
                },
            },
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: def.label, font: { size: 13 }, color: '#424242' },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return `${context.dataset.label}: ${formatMetricValue(metric, context.parsed.y)}`;
                        },
                    },
                },
            },
        },
    });
}

function renderTable(messages) {
    const tbody  = document.getElementById('messages-tbody');
    const count  = document.getElementById('row-count');
    count.textContent = messages.length ? `${messages.length} row${messages.length !== 1 ? 's' : ''}` : '';

    if (!messages.length) {
        tbody.innerHTML = '<tr><td colspan="22" class="muted">No messages found.</td></tr>';
        return;
    }

    tbody.innerHTML = messages.map(m => {
        const time = m.received_at
            ? new Date(m.received_at).toISOString().replace('T', ' ').slice(0, 19)
            : '—';
        const realTime = m.real_timestamp
            ? new Date(m.real_timestamp).toISOString().replace('T', ' ').slice(0, 19)
            : time;
        const color = getDeviceColor(m.device_id);
        const lat = m.latitude  != null ? m.latitude.toFixed(6)  : '—';
        const lon = m.longitude != null ? m.longitude.toFixed(6) : '—';

        return `<tr>
            <td class="mono small">${time}</td>
            <td class="mono small">${realTime}</td>
            <td><strong>${escapeHtml(getDeviceName(m.device_id))}</strong></td>
            <td>
                <span class="device-color-dot" style="background:${color}"></span>
                <span class="mono small">${color}</span>
            </td>
            <td class="col-hide-mobile">${v(m.f_cnt)}</td>
            <td class="mono col-hide-mobile">${lat}</td>
            <td class="mono col-hide-mobile">${lon}</td>
            <td>${batteryBadge(m.battery)}</td>
            <td>${formatMetricValue('air_temperature', m.air_temperature)}</td>
            <td class="col-hide-mobile">${formatMetricValue('light', m.light)}</td>
            <td class="col-hide-mobile">${v(m.positioning_status)}</td>
            <td class="col-hide-mobile">${v(m.event_status)}</td>
            <td>${v(m.rssi, ' dBm')}</td>
            <td class="col-hide-mobile">${v(m.channel_rssi, ' dBm')}</td>
            <td class="col-hide-mobile">${v(m.snr, ' dB')}</td>
            <td class="col-hide-mobile">${v(m.channel_index)}</td>
            <td class="mono small col-hide-mobile">${v(m.gateway_id)}</td>
            <td class="mono small col-hide-mobile">${v(m.gateway_eui)}</td>
            <td class="col-hide-mobile">${m.spreading_factor != null ? 'SF' + m.spreading_factor : '—'}</td>
            <td class="col-hide-mobile">${m.bandwidth != null ? m.bandwidth / 1000 + ' kHz' : '—'}</td>
            <td class="col-hide-mobile">${v(m.coding_rate)}</td>
            <td class="col-hide-mobile">${v(m.consumed_airtime)}</td>
        </tr>`;
    }).join('');
}
