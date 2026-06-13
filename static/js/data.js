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
let activeQuickRange = null;
let customDeviceColors = {};
let customDeviceNames = {};

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
        const sel = document.getElementById('filter-device');
        (devData.devices || []).forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.device_id;
            opt.textContent = getDeviceName(d.device_id);
            sel.appendChild(opt);
        });
    }

    setQuickRange('week', false);
    updateLastUpdateUtc();
    await fetchMessages();
}

async function fetchMessages() {
    const device  = document.getElementById('filter-device').value;
    const from    = document.getElementById('filter-from').value;
    const to      = document.getElementById('filter-to').value;

    const params = new URLSearchParams();
    if (device) params.set('devices', device);
    if (from)   params.set('from', from);
    if (to)     params.set('to', to);

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
    fetchMessages();
}

function clearFilters() {
    document.getElementById('filter-device').value = '';
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    setQuickRangeActive(null);
    fetchMessages();
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
        fetchMessages();
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
            <td>${v(m.air_temperature, ' °C')}</td>
            <td class="col-hide-mobile">${v(m.light)}</td>
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
