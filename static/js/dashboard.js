/* LoraMap — Dashboard JS */

const CHART_COLORS = [
    '#E53935', '#1E88E5', '#43A047', '#F4511E',
    '#8E24AA', '#00ACC1', '#FB8C00', '#D81B60',
];

// metric -> { chart instance, label, unit }
const CHART_DEFS = {
    battery:       { label: 'Battery Over Time',        unit: '%'   },
    rssi:          { label: 'RSSI Over Time',            unit: 'dBm' },
    channel_rssi:  { label: 'Channel RSSI Over Time',   unit: 'dBm' },
    snr:           { label: 'SNR Over Time',             unit: 'dB'  },
    gateway_count: { label: 'Gateway Count Over Time',  unit: ''    },
    channel_index: { label: 'Channel Index Over Time',  unit: ''    },
};

const charts = {};   // metric -> Chart instance
let deviceList = [];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function loadDashboard() {
    const resp = await fetch('/api/devices');
    if (!resp.ok) return;
    const data = await resp.json();
    deviceList = data.devices || [];

    renderDeviceTable(deviceList);
    populateDeviceSelects(deviceList);
    for (const metric of Object.keys(CHART_DEFS)) {
        await updateChart(metric);
    }
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

function renderDeviceTable(devices) {
    const tbody = document.getElementById('device-table-body');
    if (!devices.length) {
        tbody.innerHTML = '<tr><td colspan="16" class="muted">No data yet. Add a data source and fetch.</td></tr>';
        return;
    }

    tbody.innerHTML = devices.map(d => {
        const pos = (d.last_latitude != null && d.last_longitude != null)
            ? `${d.last_latitude.toFixed(5)}, ${d.last_longitude.toFixed(5)}`
            : '—';

        const lastSeen = d.last_received_at
            ? new Date(d.last_received_at).toLocaleString()
            : '—';

        const lastGps = d.last_gps_at
            ? new Date(d.last_gps_at).toLocaleString()
            : '—';

        const agoClass = d.seconds_ago != null && d.seconds_ago > 7200 ? 'ago-old' :
                         d.seconds_ago != null && d.seconds_ago > 1800 ? 'ago-warn' : 'ago-ok';

        return `<tr>
            <td><strong>${d.device_id}</strong></td>
            <td class="mono">${pos}</td>
            <td class="mono small">${lastGps}</td>
            <td>${batteryBadge(d.last_battery)}</td>
            <td>${v(d.last_rssi, ' dBm')}</td>
            <td>${v(d.last_channel_rssi, ' dBm')}</td>
            <td>${v(d.last_snr, ' dB')}</td>
            <td>${v(d.last_channel_index)}</td>
            <td>${v(d.last_gateway_count)}</td>
            <td>${d.last_spreading_factor != null ? 'SF' + d.last_spreading_factor : '—'}</td>
            <td>${d.last_bandwidth != null ? d.last_bandwidth / 1000 + ' kHz' : '—'}</td>
            <td>${v(d.last_coding_rate)}</td>
            <td>${v(d.last_consumed_airtime)}</td>
            <td class="mono">${lastSeen}</td>
            <td><span class="ago-badge ${agoClass}">${formatTimeAgo(d.seconds_ago)}</span></td>
            <td>${d.message_count}</td>
        </tr>`;
    }).join('');
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
        const params = new URLSearchParams({ device_id: id, metric });
        const resp = await fetch('/api/chart_data?' + params);
        if (!resp.ok) continue;
        const data = await resp.json();

        if (data.data && data.data.length > 0) {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            datasets.push({
                label: id,
                data: data.data.map(d => ({ x: new Date(d.received_at), y: d[metric] })),
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
