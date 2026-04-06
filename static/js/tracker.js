/* LoraMap — Tracker page JS (last-position-only, mobile-friendly) */

const DEVICE_COLORS = [
    '#E53935', '#1E88E5', '#43A047', '#F4511E',
    '#8E24AA', '#00ACC1', '#FB8C00', '#D81B60',
    '#6D4C41', '#546E7A',
];

let map;
let markers = {};
let deviceColors = {};
let colorIndex = 0;
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

    await loadPositions();
    setInterval(loadPositions, REFRESH_MS);
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadPositions() {
    try {
        const resp = await fetch('/api/positions?last_only=true');
        if (!resp.ok) throw new Error(resp.statusText);
        const data = await resp.json();
        renderMarkers(data.positions || []);
        updateDeviceChips(data.positions || []);
    } catch (e) {
        console.error('Failed to load positions:', e);
    }
}

// ── Map rendering ─────────────────────────────────────────────────────────────

function getColor(deviceId) {
    if (!deviceColors[deviceId]) {
        deviceColors[deviceId] = DEVICE_COLORS[colorIndex % DEVICE_COLORS.length];
        colorIndex++;
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
            <span class="ti-time">🕐 ${fmt(pos.received_at)}</span>
        </div>

        <div class="ti-grid">
            <div class="ti-card">
                <div class="ti-card-title">📍 Position</div>
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
        const ago   = pos.received_at ? ' · ' + timeAgo(pos.received_at) : '';
        return `<span class="dev-chip" style="border-color:${color};color:${color}"
                      onclick="focusDevice('${pos.device_id}')">
                    <span class="dev-chip-dot" style="background:${color}"></span>
                    ${pos.device_id}${bat}${ago}
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
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function timeAgo(iso) {
    const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (secs < 60)   return secs + 's ago';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    return Math.floor(secs / 86400) + 'd ago';
}
