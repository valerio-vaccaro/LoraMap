const DATA_DEVICE_COLORS = [
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
const DATA_QUICK_RANGE_DAYS = { day: 1, week: 7, month: 30, year: 365 };
const DATA_BOUND_FIELDS = {
    battery: { min: 'filter-battery-min', max: 'filter-battery-max', digits: 1 },
    battery_voltage: { min: 'filter-battery-voltage-min', max: 'filter-battery-voltage-max', digits: 3 },
    air_temperature: { min: 'filter-temperature-min', max: 'filter-temperature-max', digits: 2 },
    external_temperature: { min: 'filter-external-temperature-min', max: 'filter-external-temperature-max', digits: 2 },
    humidity: { min: 'filter-humidity-min', max: 'filter-humidity-max', digits: 1 },
    light: { min: 'filter-light-min', max: 'filter-light-max', digits: 1 },
};

let dataActiveQuickRange = null;
let dataCustomColors = {};
let dataCustomNames = {};
let dataDevices = [];
let currentPage = 1;
let totalPages = 1;

async function loadDataTable() {
    await Promise.all([loadDataCustomColors(), loadDataCustomNames()]);
    await loadDataDevices();
    attachDataBoundListeners();
    setQuickRange('week', false);
    await refreshDataBounds();
    await refreshDataset();
}

async function loadDataCustomColors() {
    try {
        const resp = await fetch('/api/device_colors');
        if (!resp.ok) return;
        const data = await resp.json();
        dataCustomColors = data && typeof data.colors === 'object' ? data.colors : {};
    } catch {
        dataCustomColors = {};
    }
}

async function loadDataCustomNames() {
    try {
        const resp = await fetch('/api/device_names');
        if (!resp.ok) return;
        const data = await resp.json();
        dataCustomNames = data && typeof data.names === 'object' ? data.names : {};
    } catch {
        dataCustomNames = {};
    }
}

async function loadDataDevices() {
    const devResp = await fetch('/api/devices');
    if (!devResp.ok) return;
    const devData = await devResp.json();
    dataDevices = devData.devices || [];

    const deviceSelect = document.getElementById('filter-device');
    dataDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.device_id;
        option.textContent = getDataDeviceName(device.device_id);
        deviceSelect.appendChild(option);
    });

    const boardSelect = document.getElementById('filter-board');
    const boards = [...new Set(dataDevices
        .map(device => device.device_model)
        .filter(value => typeof value === 'string' && value.trim())
    )].sort((a, b) => a.localeCompare(b));
    boards.forEach(board => {
        const option = document.createElement('option');
        option.value = board;
        option.textContent = board;
        boardSelect.appendChild(option);
    });
}

function getDataDeviceName(deviceId) {
    const shortName = dataCustomNames[deviceId];
    return typeof shortName === 'string' && shortName.trim() ? shortName.trim() : deviceId;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
}

function getDataDeviceColor(deviceId) {
    const custom = dataCustomColors[deviceId];
    const normalized = typeof custom === 'string' ? custom.trim().toUpperCase() : null;
    if (normalized && DATA_DEVICE_COLORS.includes(normalized)) return normalized;

    const key = String(deviceId || '');
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    return DATA_DEVICE_COLORS[hash % DATA_DEVICE_COLORS.length];
}

function getFilterParams() {
    const params = new URLSearchParams();
    const filters = {
        devices: document.getElementById('filter-device').value,
        datasource_id: document.getElementById('filter-datasource').value,
        board: document.getElementById('filter-board').value,
        search: document.getElementById('filter-search').value.trim(),
        from: document.getElementById('filter-from').value,
        to: document.getElementById('filter-to').value,
        battery_min: document.getElementById('filter-battery-min').value,
        battery_max: document.getElementById('filter-battery-max').value,
        battery_voltage_min: document.getElementById('filter-battery-voltage-min').value,
        battery_voltage_max: document.getElementById('filter-battery-voltage-max').value,
        air_temperature_min: document.getElementById('filter-temperature-min').value,
        air_temperature_max: document.getElementById('filter-temperature-max').value,
        external_temperature_min: document.getElementById('filter-external-temperature-min').value,
        external_temperature_max: document.getElementById('filter-external-temperature-max').value,
        humidity_min: document.getElementById('filter-humidity-min').value,
        humidity_max: document.getElementById('filter-humidity-max').value,
        light_min: document.getElementById('filter-light-min').value,
        light_max: document.getElementById('filter-light-max').value,
        per_page: document.getElementById('filter-per-page').value || '50',
        page: String(currentPage),
    };

    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    return params;
}

async function refreshDataset() {
    updateLastUpdateUtc();
    const params = getFilterParams();
    const tbody = document.getElementById('messages-tbody');
    tbody.innerHTML = '<tr><td colspan="12" class="muted">Loading…</td></tr>';

    const resp = await fetch('/api/messages?' + params.toString());
    if (!resp.ok) {
        tbody.innerHTML = '<tr><td colspan="12" class="muted">Failed to load data.</td></tr>';
        return;
    }

    const data = await resp.json();
    currentPage = data.page || 1;
    totalPages = Math.max(data.pages || 0, 1);
    renderDataTable(data.messages || []);
    renderPagination(data);
}

function attachDataBoundListeners() {
    ['filter-device', 'filter-datasource', 'filter-board', 'filter-search', 'filter-from', 'filter-to']
        .forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                refreshDataBounds();
            });
            if (id === 'filter-search') {
                el.addEventListener('input', () => {
                    refreshDataBounds();
                });
            }
        });
}

function getDataScopeParams() {
    const params = new URLSearchParams();
    const mapping = {
        devices: 'filter-device',
        datasource_id: 'filter-datasource',
        board: 'filter-board',
        search: 'filter-search',
        from: 'filter-from',
        to: 'filter-to',
    };
    Object.entries(mapping).forEach(([key, inputId]) => {
        const element = document.getElementById(inputId);
        const value = element ? element.value.trim() : '';
        if (value) params.set(key, value);
    });
    return params;
}

async function refreshDataBounds() {
    const resp = await fetch('/api/filter_bounds?' + getDataScopeParams().toString());
    if (!resp.ok) return;
    const bounds = await resp.json();
    applyBoundsToInputs(bounds, DATA_BOUND_FIELDS);
    applyDateBounds(bounds.real_timestamp || {});
}

function applyFilters() {
    currentPage = 1;
    setQuickRangeActive(null);
    refreshDataset();
}

function clearFilters() {
    [
        'filter-device', 'filter-datasource', 'filter-board', 'filter-search', 'filter-from', 'filter-to',
        'filter-battery-min', 'filter-battery-max',
        'filter-battery-voltage-min', 'filter-battery-voltage-max',
        'filter-temperature-min', 'filter-temperature-max',
        'filter-external-temperature-min', 'filter-external-temperature-max',
        'filter-humidity-min', 'filter-humidity-max',
        'filter-light-min', 'filter-light-max',
    ].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('filter-per-page').value = '50';
    currentPage = 1;
    setQuickRangeActive(null);
    refreshDataBounds();
    refreshDataset();
}

function changePage(delta) {
    const nextPage = currentPage + delta;
    if (nextPage < 1 || nextPage > totalPages) return;
    currentPage = nextPage;
    refreshDataset();
}

function setQuickRange(rangeKey, shouldLoad = true) {
    const days = DATA_QUICK_RANGE_DAYS[rangeKey];
    if (!days) return;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    document.getElementById('filter-from').value = toUtcDatetimeLocalValue(from);
    document.getElementById('filter-to').value = toUtcDatetimeLocalValue(now);
    setQuickRangeActive(rangeKey);
    refreshDataBounds();
    if (shouldLoad) {
        currentPage = 1;
        refreshDataset();
    }
}

function setQuickRangeActive(rangeKey) {
    dataActiveQuickRange = rangeKey;
    Object.keys(DATA_QUICK_RANGE_DAYS).forEach(key => {
        const el = document.getElementById(`range-${key}`);
        if (el) el.classList.toggle('active', key === dataActiveQuickRange);
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

function applyBoundsToInputs(bounds, config) {
    Object.entries(config).forEach(([field, meta]) => {
        const range = bounds[field] || {};
        applyNumericBound(meta.min, range.min, meta.digits, 'min');
        applyNumericBound(meta.max, range.max, meta.digits, 'max');
    });
}

function applyNumericBound(inputId, boundValue, digits, kind) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (boundValue == null) {
        input.removeAttribute(kind);
        return;
    }
    const formatted = formatNumber(boundValue, digits);
    input.setAttribute(kind, String(boundValue));
    if (!input.value) {
        input.value = formatted;
        return;
    }
    const current = Number(input.value);
    if (Number.isNaN(current)) return;
    if (kind === 'min' && current < boundValue) input.value = formatted;
    if (kind === 'max' && current > boundValue) input.value = formatted;
}

function applyDateBounds(range) {
    const fromInput = document.getElementById('filter-from');
    const toInput = document.getElementById('filter-to');
    if (!fromInput || !toInput) return;
    if (range.min) {
        const minValue = toUtcDatetimeLocalValue(new Date(range.min));
        fromInput.min = minValue;
        toInput.min = minValue;
    }
    if (range.max) {
        const maxValue = toUtcDatetimeLocalValue(new Date(range.max));
        fromInput.max = maxValue;
        toInput.max = maxValue;
    }
}

function v(val, suffix = '') {
    return val != null ? val + suffix : '—';
}

function formatNumber(value, digits = 1) {
    return Number(value).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatMetricValue(metric, value) {
    if (value == null) return '—';
    if (metric === 'battery_voltage') return `${formatNumber(value, 3)} V`;
    if (metric === 'air_temperature' || metric === 'external_temperature') return `${formatNumber(value, 2)} °C`;
    if (metric === 'humidity') return `${formatNumber(value, 1)} %`;
    if (metric === 'light') return formatNumber(value, 1);
    return value;
}

function batteryBadge(battery) {
    if (battery == null) return '—';
    const cls = battery < 25 ? 'ago-old' : battery < 50 ? 'ago-warn' : 'ago-ok';
    return `<span class="ago-badge ${cls}">${formatNumber(battery, 1)} %</span>`;
}

function renderDataTable(messages) {
    const tbody = document.getElementById('messages-tbody');
    const count = document.getElementById('row-count');
    count.textContent = messages.length ? `${messages.length} row${messages.length !== 1 ? 's' : ''}` : '0 rows';

    if (!messages.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="muted">No messages found.</td></tr>';
        return;
    }

    tbody.innerHTML = messages.map(message => {
        const received = message.received_at ? new Date(message.received_at).toISOString().replace('T', ' ').slice(0, 19) : '—';
        const real = message.real_timestamp ? new Date(message.real_timestamp).toISOString().replace('T', ' ').slice(0, 19) : received;
        const color = getDataDeviceColor(message.device_id);
        const lat = message.latitude != null ? message.latitude.toFixed(6) : '—';
        const lon = message.longitude != null ? message.longitude.toFixed(6) : '—';

        return `<tr>
            <td>${escapeHtml(message.datasource_name || '—')}</td>
            <td class="mono small">${received}</td>
            <td class="mono small">${real}</td>
            <td>
                <div class="table-device-cell">
                    <span class="device-color-dot" style="background:${color}"></span>
                    <div class="table-device-meta">
                        <strong>${escapeHtml(getDataDeviceName(message.device_id))}</strong>
                        <span class="table-device-board">${escapeHtml(message.device_model || '—')}</span>
                    </div>
                </div>
            </td>
            <td class="col-hide-mobile">${v(message.f_cnt)}</td>
            <td class="col-hide-mobile">
                <div class="table-location-cell mono small">
                    <span>Lat: ${lat}</span>
                    <span>Lon: ${lon}</span>
                </div>
            </td>
            <td>
                <div class="table-battery-cell">
                    <span>${batteryBadge(message.battery)}</span>
                    <span class="table-battery-voltage">${formatMetricValue('battery_voltage', message.battery_voltage)}</span>
                </div>
            </td>
            <td>
                <div class="table-environment-cell">
                    <span>In: ${formatMetricValue('air_temperature', message.air_temperature)}</span>
                    <span>Out: ${formatMetricValue('external_temperature', message.external_temperature)}</span>
                    <span>Hum: ${formatMetricValue('humidity', message.humidity)}</span>
                    <span>Lux: ${formatMetricValue('light', message.light)}</span>
                </div>
            </td>
            <td class="col-hide-mobile">
                <div class="table-status-cell">
                    <span>Pos: ${v(message.positioning_status)}</span>
                    <span>Evt: ${v(message.event_status)}</span>
                </div>
            </td>
            <td>
                <div class="table-radio-cell">
                    <span>RSSI: ${v(message.rssi, ' dBm')}</span>
                    <span>SNR: ${v(message.snr, ' dB')}</span>
                    <span>Ch: ${v(message.channel_index)}</span>
                </div>
            </td>
            <td class="col-hide-mobile">
                <div class="table-gateway-cell mono small">
                    <span>ID: ${escapeHtml(v(message.gateway_id))}</span>
                    <span>EUI: ${escapeHtml(v(message.gateway_eui))}</span>
                </div>
            </td>
            <td class="col-hide-mobile">
                <div class="table-lora-cell">
                    <span>SF: ${message.spreading_factor != null ? `SF${message.spreading_factor}` : '—'}</span>
                    <span>BW: ${message.bandwidth != null ? `${message.bandwidth / 1000} kHz` : '—'}</span>
                    <span>CR: ${v(message.coding_rate)}</span>
                    <span>Air: ${v(message.consumed_airtime)}</span>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function renderPagination(data) {
    const total = data.total || 0;
    const from = total ? ((data.page - 1) * data.per_page) + 1 : 0;
    const to = total ? Math.min(data.page * data.per_page, total) : 0;
    document.getElementById('pagination-summary').textContent = total
        ? `Showing ${from}-${to} of ${total} rows`
        : 'No rows found';
    document.getElementById('page-indicator').textContent = `Page ${data.page || 1} / ${Math.max(data.pages || 0, 1)}`;
    document.getElementById('page-prev').disabled = (data.page || 1) <= 1;
    document.getElementById('page-next').disabled = (data.page || 1) >= Math.max(data.pages || 1, 1);
}
