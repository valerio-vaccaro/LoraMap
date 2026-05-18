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
];
const COLOR_STORAGE_KEY = 'loramap.deviceColors.v1';
const QUICK_RANGE_DAYS = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
};
let activeQuickRange = null;

function getDeviceColor(deviceId) {
    try {
        const raw = localStorage.getItem(COLOR_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const custom = parsed && typeof parsed === 'object' ? parsed[deviceId] : null;
        const normalized = typeof custom === 'string' ? custom.trim().toUpperCase() : null;
        if (normalized && DEVICE_COLORS.includes(normalized)) return normalized;
    } catch {
        // ignore malformed storage and fallback to deterministic color
    }

    const key = String(deviceId || '');
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    }
    return DEVICE_COLORS[hash % DEVICE_COLORS.length];
}

async function loadData() {
    // Populate device select
    const devResp = await fetch('/api/devices');
    if (devResp.ok) {
        const devData = await devResp.json();
        const sel = document.getElementById('filter-device');
        (devData.devices || []).forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.device_id;
            opt.textContent = d.device_id;
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
    tbody.innerHTML = '<tr><td colspan="17" class="muted">Loading…</td></tr>';

    const resp = await fetch('/api/messages?' + params);
    if (!resp.ok) {
        tbody.innerHTML = '<tr><td colspan="17" class="muted">Failed to load data.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="17" class="muted">No messages found.</td></tr>';
        return;
    }

    tbody.innerHTML = messages.map(m => {
        const time = m.received_at
            ? new Date(m.received_at).toISOString().replace('T', ' ').slice(0, 19)
            : '—';
        const color = getDeviceColor(m.device_id);
        const lat = m.latitude  != null ? m.latitude.toFixed(6)  : '—';
        const lon = m.longitude != null ? m.longitude.toFixed(6) : '—';

        return `<tr>
            <td class="mono small">${time}</td>
            <td><strong>${m.device_id}</strong></td>
            <td>
                <span class="device-color-dot" style="background:${color}"></span>
                <span class="mono small">${color}</span>
            </td>
            <td class="col-hide-mobile">${v(m.f_cnt)}</td>
            <td class="mono col-hide-mobile">${lat}</td>
            <td class="mono col-hide-mobile">${lon}</td>
            <td>${batteryBadge(m.battery)}</td>
            <td class="col-hide-mobile">${v(m.positioning_status)}</td>
            <td>${v(m.rssi, ' dBm')}</td>
            <td class="col-hide-mobile">${v(m.channel_rssi, ' dBm')}</td>
            <td class="col-hide-mobile">${v(m.snr, ' dB')}</td>
            <td class="col-hide-mobile">${v(m.channel_index)}</td>
            <td class="col-hide-mobile">${v(m.gateway_count)}</td>
            <td class="col-hide-mobile">${m.spreading_factor != null ? 'SF' + m.spreading_factor : '—'}</td>
            <td class="col-hide-mobile">${m.bandwidth != null ? m.bandwidth / 1000 + ' kHz' : '—'}</td>
            <td class="col-hide-mobile">${v(m.coding_rate)}</td>
            <td class="col-hide-mobile">${v(m.consumed_airtime)}</td>
        </tr>`;
    }).join('');
}
