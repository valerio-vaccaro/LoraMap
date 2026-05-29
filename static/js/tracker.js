/* LoraMap — Tracker page JS (last-position-only, mobile-friendly) */

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

let map;
let markers = {};
let deviceColors = {};
let customDeviceColors = {};
let allPositions = [];
let enabledDevices = new Set();
let knownDevices = new Set();
const REFRESH_MS = 60_000;

// ── Google Maps callback ──────────────────────────────────────────────────────

async function initTrackerMap() {
    map = new google.maps.Map(document.getElementById('tracker-map'), {
        zoom: 10,
        center: { lat: 45.5, lng: 9.38 },
        mapTypeId: 'roadmap',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: 'greedy',  // single-finger pan on mobile
    });

    await loadCustomColors();
    await loadPositions();
    setInterval(loadPositions, REFRESH_MS);
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadPositions() {
    try {
        const resp = await fetch('/api/positions?last_only=true');
        if (!resp.ok) throw new Error(resp.statusText);
        const data = await resp.json();
        allPositions = data.positions || [];
        updateDeviceFilters(allPositions);
        const visiblePositions = allPositions.filter(p => enabledDevices.has(p.device_id));
        renderMarkers(visiblePositions);
        updateDeviceChips(visiblePositions);
    } catch (e) {
        console.error('Failed to load positions:', e);
    }
}

// ── Map rendering ─────────────────────────────────────────────────────────────

function getColor(deviceId) {
    const custom = customDeviceColors[deviceId];
    const normalized = typeof custom === 'string' ? custom.trim().toUpperCase() : null;
    if (normalized && DEVICE_COLORS.includes(normalized)) {
        deviceColors[deviceId] = normalized;
        return normalized;
    }

    if (!deviceColors[deviceId]) {
        const key = String(deviceId || '');
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
        }
        deviceColors[deviceId] = DEVICE_COLORS[hash % DEVICE_COLORS.length];
    }
    return deviceColors[deviceId];
}

function makeIcon(color) {
    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34">',
        '<path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 22 12 22S24 21 24 12C24 5.373 18.627 0 12 0z"',
        ' fill="', color, '" stroke="rgba(0,0,0,0.25)" stroke-width="1.2"/>',
        '<circle cx="12" cy="12" r="4.5" fill="white" opacity="0.9"/>',
        '</svg>',
    ].join('');
    return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(24, 34),
        anchor: new google.maps.Point(12, 34),
    };
}

function renderMarkers(positions) {
    // Remove stale markers
    const incoming = new Set(positions.map(p => p.device_id));
    Object.keys(markers).forEach(id => {
        if (!incoming.has(id)) {
            markers[id].setMap(null);
            delete markers[id];
        }
    });

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    positions.forEach(pos => {
        if (pos.latitude == null || pos.longitude == null) return;

        const color  = getColor(pos.device_id);
        const latLng = { lat: pos.latitude, lng: pos.longitude };

        if (markers[pos.device_id]) {
            markers[pos.device_id].setPosition(latLng);
        } else {
            const m = new google.maps.Marker({
                position: latLng,
                map,
                icon: makeIcon(color),
                title: pos.device_id,
            });
            m.addListener('click', () => showDetail(pos));
            markers[pos.device_id] = m;
        }

        bounds.extend(latLng);
        hasPoints = true;
    });

    if (hasPoints && Object.keys(markers).length <= positions.length) {
        map.fitBounds(bounds, { padding: 60 });
    }
}

function updateDeviceFilters(positions) {
    const container = document.getElementById('tracker-device-filters');
    const deviceIds = Array.from(new Set(positions.map(p => p.device_id))).sort();

    const available = new Set(deviceIds);

    // Remove disappeared devices from current selection/state.
    enabledDevices = new Set(Array.from(enabledDevices).filter(id => available.has(id)));
    knownDevices = new Set(Array.from(knownDevices).filter(id => available.has(id)));

    // New devices are enabled by default, while existing manual choices are preserved.
    deviceIds.forEach(id => {
        if (!knownDevices.has(id)) {
            knownDevices.add(id);
            enabledDevices.add(id);
        }
    });

    if (!deviceIds.length) {
        container.innerHTML = '<span class="muted">No devices</span>';
        return;
    }

    container.innerHTML = deviceIds.map(id => {
        const color = getColor(id);
        const checked = enabledDevices.has(id) ? 'checked' : '';
        const pos = positions.find(p => p.device_id === id);
        const delay = pos ? ` · ${delayFromRealTimestamp(pos.real_timestamp)}` : '';
        return `<label class="tracker-filter-item">
            <input type="checkbox" ${checked} onchange="toggleTrackerDevice('${encodeURIComponent(id)}', this.checked)">
            <span class="dev-chip-dot" style="background:${color}"></span>
            <span>${id}${delay}</span>
        </label>`;
    }).join('');
}

function toggleTrackerDevice(encodedDeviceId, checked) {
    const deviceId = decodeURIComponent(encodedDeviceId);
    if (checked) enabledDevices.add(deviceId);
    else enabledDevices.delete(deviceId);
    const visiblePositions = allPositions.filter(p => enabledDevices.has(p.device_id));
    renderMarkers(visiblePositions);
    updateDeviceChips(visiblePositions);
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function showDetail(pos) {
    const color = getColor(pos.device_id);

    const row = (icon, label, value, unit = '') =>
        value != null
            ? `<div class="ti-row">
                 <span class="ti-label"><span class="ti-icon">${icon}</span>${label}</span>
                 <span class="ti-value">${value}${unit ? '<span class="ti-unit"> ' + unit + '</span>' : ''}</span>
               </div>`
            : '';

    document.getElementById('tracker-info').innerHTML = `
        <div class="ti-header">
            <span class="ti-badge" style="background:${color}">${pos.device_id}</span>
            <span class="ti-time">🕐 ${fmt(pos.real_timestamp)}</span>
        </div>

        <div class="ti-grid">
            <div class="ti-card">
                <div class="ti-card-title">📍 Position</div>
                ${row('', 'Real Time', fmt(pos.real_timestamp))}
                ${row('', 'Received',  fmt(pos.received_at))}
                ${row('', 'Delay',     delayFromRealTimestamp(pos.real_timestamp))}
                ${row('', 'Latitude',  pos.latitude  != null ? pos.latitude.toFixed(6)  : null)}
                ${row('', 'Longitude', pos.longitude != null ? pos.longitude.toFixed(6) : null)}
                ${row('', 'Status',    pos.positioning_status)}
            </div>

            <div class="ti-card">
                <div class="ti-card-title">🔋 Device</div>
                ${row('', 'Battery',   pos.battery != null ? pos.battery : null, '%')}
                ${row('', 'Frame #',   pos.f_cnt)}
            </div>

            <div class="ti-card">
                <div class="ti-card-title">📶 Radio</div>
                ${row('', 'RSSI',         pos.rssi         != null ? pos.rssi         : null, 'dBm')}
                ${row('', 'Channel RSSI', pos.channel_rssi != null ? pos.channel_rssi : null, 'dBm')}
                ${row('', 'SNR',          pos.snr          != null ? pos.snr          : null, 'dB')}
                ${row('', 'Gateways',     pos.gateway_count)}
                ${row('', 'Channel',      pos.channel_index)}
            </div>

            <div class="ti-card">
                <div class="ti-card-title">📡 LoRa</div>
                ${row('', 'Spread. Factor', pos.spreading_factor != null ? 'SF' + pos.spreading_factor : null)}
                ${row('', 'Bandwidth',      pos.bandwidth        != null ? pos.bandwidth / 1000         : null, 'kHz')}
                ${row('', 'Coding Rate',    pos.coding_rate)}
                ${row('', 'Airtime',        pos.consumed_airtime)}
            </div>
        </div>`;

    // On mobile scroll info panel into view
    document.getElementById('tracker-info').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Device chips ──────────────────────────────────────────────────────────────

function updateDeviceChips(positions) {
    const bar = document.getElementById('device-bar');
    if (!positions.length) { bar.innerHTML = ''; return; }

    bar.innerHTML = positions.map(pos => {
        const color = getColor(pos.device_id);
        const bat   = pos.battery != null ? ` · 🔋${pos.battery}%` : '';
        const delay = pos.real_timestamp ? ' · ' + delayFromRealTimestamp(pos.real_timestamp) : '';
        return `<span class="dev-chip" style="border-color:${color};color:${color}"
                      onclick="focusDevice('${pos.device_id}')">
                    <span class="dev-chip-dot" style="background:${color}"></span>
                    ${pos.device_id}${bat}${delay}
                </span>`;
    }).join('');
}

function focusDevice(deviceId) {
    const m = markers[deviceId];
    if (!m) return;
    map.panTo(m.getPosition());
    map.setZoom(14);
    google.maps.event.trigger(m, 'click');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso) {
    if (!iso) return '—';
    const date = parseUtcDate(iso);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s} UTC`;
}

function parseUtcDate(iso) {
    if (!iso) return null;
    return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z');
}

function delayFromRealTimestamp(iso) {
    if (!iso) return null;
    const minutes = Math.max(0, (Date.now() - parseUtcDate(iso).getTime()) / 60000);
    if (minutes < 60) {
        const value = Math.max(1, Math.floor(minutes));
        return value + 'm delay';
    }
    const hours = minutes / 60;
    if (hours < 48) {
        const value = Math.max(1, Math.floor(hours));
        return value + 'h delay';
    }
    return Math.floor(hours / 24) + 'd delay';
}
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
