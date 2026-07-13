const SENSOR_DEVICE_COLORS = [
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
const SENSOR_QUICK_RANGE_DAYS = { day: 1, week: 7, month: 30, year: 365 };
const SENSOR_CHART_DEFS = {
    battery: { label: 'Battery Over Time', unit: '%' },
    battery_voltage: { label: 'Battery Voltage Over Time', unit: 'V' },
    air_temperature: { label: 'Internal Temperature Over Time', unit: '°C' },
    external_temperature: { label: 'External Temperature Over Time', unit: '°C' },
    humidity: { label: 'Humidity Over Time', unit: '%' },
    light: { label: 'Luminosity Over Time', unit: '' },
};
const SENSOR_BOUND_FIELDS = {
    battery: { min: 'filter-battery-min', max: 'filter-battery-max', digits: 1 },
    battery_voltage: { min: 'filter-battery-voltage-min', max: 'filter-battery-voltage-max', digits: 3 },
    air_temperature: { min: 'filter-temperature-min', max: 'filter-temperature-max', digits: 2 },
    external_temperature: { min: 'filter-external-temperature-min', max: 'filter-external-temperature-max', digits: 2 },
    humidity: { min: 'filter-humidity-min', max: 'filter-humidity-max', digits: 1 },
    light: { min: 'filter-light-min', max: 'filter-light-max', digits: 1 },
};

let sensorActiveQuickRange = null;
let sensorCustomColors = {};
let sensorCustomNames = {};
let sensorDevices = [];
const sensorCharts = {};

async function loadSensors() {
    await Promise.all([loadSensorCustomColors(), loadSensorCustomNames()]);
    await loadSensorDevices();
    attachSensorBoundListeners();
    setQuickRange('week', false);
    await refreshSensorBounds();
    await refreshSensorCharts();
}

async function loadSensorCustomColors() {
    try {
        const resp = await fetch('/api/device_colors');
        if (!resp.ok) return;
        const data = await resp.json();
        sensorCustomColors = data && typeof data.colors === 'object' ? data.colors : {};
    } catch {
        sensorCustomColors = {};
    }
}

async function loadSensorCustomNames() {
    try {
        const resp = await fetch('/api/device_names');
        if (!resp.ok) return;
        const data = await resp.json();
        sensorCustomNames = data && typeof data.names === 'object' ? data.names : {};
    } catch {
        sensorCustomNames = {};
    }
}

async function loadSensorDevices() {
    const devResp = await fetch('/api/devices');
    if (!devResp.ok) return;
    const devData = await devResp.json();
    sensorDevices = devData.devices || [];

    const deviceSelect = document.getElementById('filter-device');
    sensorDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.device_id;
        option.textContent = getSensorDeviceName(device.device_id);
        deviceSelect.appendChild(option);
    });

    const boardSelect = document.getElementById('filter-board');
    const boards = [...new Set(sensorDevices
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

function getSensorDeviceName(deviceId) {
    const shortName = sensorCustomNames[deviceId];
    return typeof shortName === 'string' && shortName.trim() ? shortName.trim() : deviceId;
}

function getSensorDeviceColor(deviceId) {
    const custom = sensorCustomColors[deviceId];
    const normalized = typeof custom === 'string' ? custom.trim().toUpperCase() : null;
    if (normalized && SENSOR_DEVICE_COLORS.includes(normalized)) return normalized;

    const key = String(deviceId || '');
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    return SENSOR_DEVICE_COLORS[hash % SENSOR_DEVICE_COLORS.length];
}

function getFilterParams() {
    const params = new URLSearchParams();
    const filters = {
        devices: document.getElementById('filter-device').value,
        datasource_id: document.getElementById('filter-datasource').value,
        board: document.getElementById('filter-board').value,
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
    };

    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    return params;
}

async function refreshSensorCharts() {
    updateLastUpdateUtc();
    await Promise.all(Object.keys(SENSOR_CHART_DEFS).map(metric => updateChart(metric)));
}

function attachSensorBoundListeners() {
    ['filter-device', 'filter-datasource', 'filter-board', 'filter-from', 'filter-to']
        .forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                refreshSensorBounds();
            });
        });
}

function getSensorScopeParams() {
    const params = new URLSearchParams();
    const mapping = {
        devices: 'filter-device',
        datasource_id: 'filter-datasource',
        board: 'filter-board',
        from: 'filter-from',
        to: 'filter-to',
    };
    Object.entries(mapping).forEach(([key, inputId]) => {
        const element = document.getElementById(inputId);
        const value = element ? element.value : '';
        if (value) params.set(key, value);
    });
    return params;
}

async function refreshSensorBounds() {
    const resp = await fetch('/api/filter_bounds?' + getSensorScopeParams().toString());
    if (!resp.ok) return;
    const bounds = await resp.json();
    applyBoundsToInputs(bounds, SENSOR_BOUND_FIELDS);
    applyDateBounds(bounds.real_timestamp || {});
}

function applyFilters() {
    setQuickRangeActive(null);
    refreshSensorCharts();
}

function clearFilters() {
    [
        'filter-device', 'filter-datasource', 'filter-board', 'filter-from', 'filter-to',
        'filter-battery-min', 'filter-battery-max',
        'filter-battery-voltage-min', 'filter-battery-voltage-max',
        'filter-temperature-min', 'filter-temperature-max',
        'filter-external-temperature-min', 'filter-external-temperature-max',
        'filter-humidity-min', 'filter-humidity-max',
        'filter-light-min', 'filter-light-max',
    ].forEach(id => { document.getElementById(id).value = ''; });
    setQuickRangeActive(null);
    refreshSensorBounds();
    refreshSensorCharts();
}

function setQuickRange(rangeKey, shouldLoad = true) {
    const days = SENSOR_QUICK_RANGE_DAYS[rangeKey];
    if (!days) return;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    document.getElementById('filter-from').value = toUtcDatetimeLocalValue(from);
    document.getElementById('filter-to').value = toUtcDatetimeLocalValue(now);
    setQuickRangeActive(rangeKey);
    refreshSensorBounds();
    if (shouldLoad) refreshSensorCharts();
}

function setQuickRangeActive(rangeKey) {
    sensorActiveQuickRange = rangeKey;
    Object.keys(SENSOR_QUICK_RANGE_DAYS).forEach(key => {
        const el = document.getElementById(`range-${key}`);
        if (el) el.classList.toggle('active', key === sensorActiveQuickRange);
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

function formatMetricValue(metric, value) {
    if (value == null) return '—';
    if (metric === 'battery') return `${formatNumber(value, 1)} %`;
    if (metric === 'battery_voltage') return `${formatNumber(value, 3)} V`;
    if (metric === 'air_temperature' || metric === 'external_temperature') return `${formatNumber(value, 2)} °C`;
    if (metric === 'humidity') return `${formatNumber(value, 1)} %`;
    return value;
}

function formatNumber(value, digits = 1) {
    return Number(value).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
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

async function updateChart(metric) {
    const def = SENSOR_CHART_DEFS[metric];
    if (!def) return;

    const baseParams = getFilterParams();
    const selectedDeviceId = document.getElementById('filter-device').value;
    const devicesToFetch = selectedDeviceId
        ? sensorDevices.filter(device => device.device_id === selectedDeviceId)
        : sensorDevices;
    const datasets = [];

    for (const device of devicesToFetch) {
        const params = new URLSearchParams(baseParams.toString());
        params.set('device_id', device.device_id);
        params.set('metric', metric);
        const resp = await fetch('/api/chart_data?' + params.toString());
        if (!resp.ok) continue;

        const data = await resp.json();
        if (!data.data || !data.data.length) continue;

        const color = getSensorDeviceColor(device.device_id);
        datasets.push({
            label: getSensorDeviceName(device.device_id),
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

    if (sensorCharts[metric]) sensorCharts[metric].destroy();
    const canvas = document.getElementById(`chart-${metric}`);
    if (!canvas) return;

    sensorCharts[metric] = new Chart(canvas.getContext('2d'), {
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
