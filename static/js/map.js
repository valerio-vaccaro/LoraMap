/* LoraMap — Map page JS */

const DEVICE_COLORS = [
    '#E53935', // red
    '#1E88E5', // blue
    '#43A047', // green
    '#F4511E', // deep orange
    '#8E24AA', // purple
    '#00ACC1', // cyan
    '#FB8C00', // orange
    '#D81B60', // pink
    '#6D4C41', // brown
    '#546E7A', // blue-grey
];

let map;
let markers = {};       // device_id -> [google.maps.Marker]
let polylines = {};     // device_id -> google.maps.Polyline
let deviceColors = {};
let colorIndex = 0;
let allPositions = [];
let viewMode = 'all';
let enabledDevices = new Set();

// Called by Google Maps script callback
async function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 10,
        center: { lat: 45.5, lng: 9.38 },
        mapTypeId: 'roadmap',
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
    });

    const rangeResp = await fetch('/api/messages/range');
    if (rangeResp.ok) {
        const range = await rangeResp.json();
        if (range.min) document.getElementById('from-time').value = range.min.slice(0, 16);
        if (range.max) document.getElementById('to-time').value   = range.max.slice(0, 16);
    }

    loadPositions();
}

function getDeviceColor(deviceId) {
    if (!deviceColors[deviceId]) {
        deviceColors[deviceId] = DEVICE_COLORS[colorIndex % DEVICE_COLORS.length];
        colorIndex++;
    }
    return deviceColors[deviceId];
}

function getMarkerIcon(color) {
    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="32" viewBox="0 0 22 32">',
        '<path d="M11 0C4.925 0 0 4.925 0 11c0 8.25 11 21 11 21s11-12.75 11-21C22 4.925 17.075 0 11 0z"',
        ' fill="', color, '" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>',
        '<circle cx="11" cy="11" r="4" fill="white" opacity="0.9"/>',
        '</svg>',
    ].join('');
    return {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(22, 32),
        anchor: new google.maps.Point(11, 32),
    };
}

async function loadPositions() {
    const params = new URLSearchParams();
    const fromVal = document.getElementById('from-time').value;
    const toVal = document.getElementById('to-time').value;

    if (enabledDevices.size > 0) {
        params.set('devices', Array.from(enabledDevices).join(','));
    }
    if (fromVal) params.set('from', fromVal.replace('T', ' '));
    if (toVal)   params.set('to',   toVal.replace('T', ' '));
    params.set('last_only', viewMode === 'last' ? 'true' : 'false');

    try {
        const resp = await fetch('/api/positions?' + params);
        if (!resp.ok) throw new Error('Request failed');
        const data = await resp.json();
        allPositions = data.positions || [];
        updateDeviceList(data.device_ids || []);
        renderPositions();
    } catch (e) {
        showToast('Failed to load positions: ' + e.message, 'error');
    }
}

function clearMapObjects() {
    Object.values(markers).flat().forEach(m => m.setMap(null));
    Object.values(polylines).forEach(p => p.setMap(null));
    markers = {};
    polylines = {};
}

function renderPositions() {
    if (!map) return;
    clearMapObjects();

    const byDevice = {};
    allPositions.forEach(p => {
        if (p.latitude == null || p.longitude == null) return;
        (byDevice[p.device_id] = byDevice[p.device_id] || []).push(p);
    });

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    Object.entries(byDevice).forEach(([deviceId, positions]) => {
        if (!enabledDevices.has(deviceId)) return;
        const color = getDeviceColor(deviceId);
        markers[deviceId] = [];

        // Sort chronologically
        positions.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));

        const toShow = viewMode === 'last'
            ? [positions[positions.length - 1]]
            : positions;

        toShow.forEach(pos => {
            const latLng = { lat: pos.latitude, lng: pos.longitude };
            const marker = new google.maps.Marker({
                position: latLng,
                map,
                icon: getMarkerIcon(color),
                title: deviceId + ' — ' + formatDateTime(pos.received_at),
            });
            marker.addListener('click', () => showDetailPanel(pos, deviceId));
            markers[deviceId].push(marker);
            bounds.extend(latLng);
            hasPoints = true;
        });

        // Draw trajectory
        if (viewMode === 'all' && positions.length > 1) {
            polylines[deviceId] = new google.maps.Polyline({
                path: positions.map(p => ({ lat: p.latitude, lng: p.longitude })),
                geodesic: true,
                strokeColor: color,
                strokeOpacity: 0.75,
                strokeWeight: 2,
                map,
            });
        }
    });

    if (hasPoints) {
        map.fitBounds(bounds, { padding: 60 });
    }
}

function updateDeviceList(serverDeviceIds) {
    const isFirstLoad = enabledDevices.size === 0 && Object.keys(deviceColors).length === 0;

    serverDeviceIds.forEach(id => {
        getDeviceColor(id); // ensure color assigned
        if (isFirstLoad) {
            enabledDevices.add(id); // on first load, enable all devices
        }
    });

    const allIds = Array.from(new Set([...Object.keys(deviceColors), ...serverDeviceIds]));
    const container = document.getElementById('device-list');

    if (allIds.length === 0) {
        container.innerHTML = '<p class="muted">No devices found.</p>';
        return;
    }

    container.innerHTML = allIds.map(deviceId => {
        const color = getDeviceColor(deviceId);
        const checked = enabledDevices.has(deviceId);
        return `<label class="device-item">
            <input type="checkbox" value="${deviceId}" ${checked ? 'checked' : ''}
                   onchange="toggleDevice('${deviceId}', this.checked)">
            <span class="device-color" style="background:${color}"></span>
            <span>${deviceId}</span>
        </label>`;
    }).join('');
}

function toggleDevice(deviceId, checked) {
    if (checked) {
        enabledDevices.add(deviceId);
    } else {
        enabledDevices.delete(deviceId);
    }
    renderPositions();
}

function setMode(mode) {
    viewMode = mode;
    renderPositions();
}

function applyFilters() {
    loadPositions();
}

function clearFilters() {
    document.getElementById('from-time').value = '';
    document.getElementById('to-time').value = '';
    loadPositions();
}

async function fetchNewData() {
    const btn = document.getElementById('fetch-btn');
    const status = document.getElementById('fetch-status');
    btn.disabled = true;
    btn.textContent = '…Fetching';
    status.textContent = '';

    try {
        const resp = await fetch('/api/fetch_all', { method: 'POST' });
        const data = await resp.json();
        if (data.error && !data.inserted) {
            showToast(data.error, 'error');
            status.textContent = data.error;
        } else {
            showToast(`Inserted ${data.inserted} new record(s)`);
            status.textContent = `+${data.inserted} new`;
            await loadPositions();
        }
    } catch (e) {
        showToast('Fetch failed: ' + e.message, 'error');
        status.textContent = 'Failed.';
    } finally {
        btn.disabled = false;
        btn.textContent = '↻ Fetch New Data';
    }
}

function showDetailPanel(pos, deviceId) {
    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('detail-content');
    const color = getDeviceColor(deviceId);

    const row = (label, value) =>
        value != null ? `<div class="detail-row"><span>${label}</span><span>${value}</span></div>` : '';

    content.innerHTML = `
        <div class="detail-header">
            <span class="device-badge" style="background:${color}">${deviceId}</span>
            <button class="close-btn" onclick="document.getElementById('detail-panel').style.display='none'">✕</button>
        </div>
        <div class="detail-content">
            <div class="detail-section-label">Position</div>
            ${row('Time', formatDateTime(pos.received_at))}
            ${row('Latitude',  pos.latitude  != null ? pos.latitude.toFixed(6)  : null)}
            ${row('Longitude', pos.longitude != null ? pos.longitude.toFixed(6) : null)}
            ${row('Pos. Status', pos.positioning_status)}

            <div class="detail-section-label">Radio</div>
            ${row('Battery',      pos.battery      != null ? pos.battery + ' %'       : null)}
            ${row('RSSI',         pos.rssi         != null ? pos.rssi + ' dBm'        : null)}
            ${row('Channel RSSI', pos.channel_rssi != null ? pos.channel_rssi + ' dBm': null)}
            ${row('SNR',          pos.snr          != null ? pos.snr + ' dB'          : null)}
            ${row('Channel',      pos.channel_index)}
            ${row('Gateways',     pos.gateway_count)}

            <div class="detail-section-label">LoRa</div>
            ${row('Spread. Factor', pos.spreading_factor != null ? 'SF' + pos.spreading_factor : null)}
            ${row('Bandwidth',      pos.bandwidth        != null ? pos.bandwidth / 1000 + ' kHz' : null)}
            ${row('Coding Rate',    pos.coding_rate)}
            ${row('Airtime',        pos.consumed_airtime)}
            ${row('Frame #',        pos.f_cnt)}
        </div>`;

    panel.style.display = 'block';
}

function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function showToast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}
