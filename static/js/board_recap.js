const BOARD_RECAP_METRICS = {
    battery: { label: 'Battery', unit: '%' },
    battery_voltage: { label: 'Battery voltage', unit: 'V' },
    air_temperature: { label: 'Temperature', unit: '°C' },
    external_temperature: { label: 'External temperature', unit: '°C' },
    humidity: { label: 'Humidity', unit: '%' },
    light: { label: 'Luminosity', unit: '' },
    co2_ppm: { label: 'CO₂', unit: 'ppm' },
    tvoc_ppb: { label: 'TVOC', unit: 'ppb' },
};

let boardRecapDeviceId = '';
let boardRecapDatasourceId = '';
let boardRecapPoints = [];
let boardRecapTimeRange = null;
let boardRecapMap = null;
let boardRecapMarkers = [];
let boardRecapPath = null;
const boardRecapCharts = [];

async function loadBoardRecap() {
    const params = new URLSearchParams(window.location.search);
    boardRecapDeviceId = params.get('device_id') || '';
    boardRecapDatasourceId = params.get('datasource_id') || '';
    if (!boardRecapDeviceId || !boardRecapDatasourceId) {
        document.getElementById('board-recap-title').textContent = 'Board not specified';
        document.getElementById('board-recap-subtitle').textContent = 'Return to Recap and select a board.';
        return;
    }

    document.getElementById('board-recap-title').textContent = boardRecapDeviceId;
    const scope = new URLSearchParams({
        devices: boardRecapDeviceId,
        datasource_id: boardRecapDatasourceId,
        group_by_datasource: '1',
    });

    try {
        const [deviceResponse, positionsResponse] = await Promise.all([
            fetch(`/api/devices?${scope}`),
            fetch(`/api/positions?${new URLSearchParams({
                devices: boardRecapDeviceId,
                datasource_id: boardRecapDatasourceId,
            })}`),
        ]);
        if (!deviceResponse.ok || !positionsResponse.ok) throw new Error('Could not load board details');
        const deviceData = await deviceResponse.json();
        const positionsData = await positionsResponse.json();
        const board = (deviceData.devices || []).find(device => device.device_id === boardRecapDeviceId);
        document.getElementById('board-recap-subtitle').textContent = board
            ? `${board.device_model || 'Board'} · ${board.datasource_name || 'Source'} · ${board.message_count} messages`
            : 'No board data found for this source.';
        boardRecapPoints = positionsData.positions || [];
        renderBoardRecapMap();
        await renderBoardRecapCharts();
    } catch (error) {
        document.getElementById('board-recap-subtitle').textContent = 'Unable to load board details.';
        document.getElementById('board-map-message').textContent = 'Board data could not be loaded.';
    }
}

function initBoardRecapMap() {
    renderBoardRecapMap();
}

function renderBoardRecapMap() {
    const container = document.getElementById('board-recap-map');
    if (!container) return;
    const points = boardRecapPoints.filter(point => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)));
    const mapCard = document.querySelector('.board-map-card');
    mapCard.hidden = points.length === 0;
    boardRecapMarkers.forEach(marker => marker.setMap(null));
    boardRecapMarkers = [];
    if (boardRecapPath) boardRecapPath.setMap(null);
    boardRecapPath = null;
    if (!points.length) return;
    if (!window.google || !google.maps) {
        document.getElementById('board-map-message').textContent = 'Map unavailable: configure a Google Maps API key.';
        return;
    }
    document.getElementById('board-map-message').textContent = '';
    document.getElementById('board-map-count').textContent = `${points.length} positions`;

    const path = points.map(point => ({ lat: Number(point.latitude), lng: Number(point.longitude) }));
    if (!boardRecapMap) {
        boardRecapMap = new google.maps.Map(container, {
            center: path[path.length - 1],
            zoom: points.length === 1 ? 15 : 12,
            mapTypeControl: true,
            streetViewControl: false,
        });
    }
    const map = boardRecapMap;
    const bounds = new google.maps.LatLngBounds();
    const info = new google.maps.InfoWindow();
    path.forEach((position, index) => {
        bounds.extend(position);
        const marker = new google.maps.Marker({
            map,
            position,
            title: `${index + 1} · ${new Date(points[index].real_timestamp).toLocaleString()}`,
            label: points.length <= 50 ? String(index + 1) : undefined,
        });
        boardRecapMarkers.push(marker);
        marker.addListener('click', () => {
            info.setContent(`<strong>Position ${index + 1}</strong><br>${new Date(points[index].real_timestamp).toLocaleString()}<br>${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`);
            info.open({ map, anchor: marker });
        });
    });
    if (path.length > 1) {
        boardRecapPath = new google.maps.Polyline({ path, geodesic: true, strokeColor: '#1976D2', strokeOpacity: 0.8, strokeWeight: 3, map });
        map.fitBounds(bounds);
    } else {
        map.setCenter(path[0]);
        map.setZoom(15);
    }
}

async function updateBoardMapRange() {
    const params = new URLSearchParams({
        devices: boardRecapDeviceId,
        datasource_id: boardRecapDatasourceId,
    });
    if (boardRecapTimeRange) {
        params.set('from', new Date(boardRecapTimeRange.min).toISOString());
        params.set('to', new Date(boardRecapTimeRange.max).toISOString());
    }
    const response = await fetch(`/api/positions?${params}`);
    if (!response.ok) return;
    const payload = await response.json();
    boardRecapPoints = payload.positions || [];
    renderBoardRecapMap();
}

function syncBoardTimeRange(sourceChart) {
    const min = Number(sourceChart.scales.x.min);
    const max = Number(sourceChart.scales.x.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return;
    boardRecapTimeRange = { min, max };
    document.getElementById('reset-board-range').hidden = false;
    boardRecapCharts.forEach(chart => {
        if (chart === sourceChart) return;
        chart.options.scales.x.min = min;
        chart.options.scales.x.max = max;
        chart.update('none');
    });
    updateBoardMapRange();
}

function resetBoardTimeRange() {
    boardRecapTimeRange = null;
    document.getElementById('reset-board-range').hidden = true;
    boardRecapCharts.forEach(chart => chart.destroy());
    boardRecapCharts.length = 0;
    renderBoardRecapCharts();
    updateBoardMapRange();
}

async function renderBoardRecapCharts() {
    const container = document.getElementById('board-recap-charts');
    boardRecapCharts.forEach(chart => chart.destroy());
    boardRecapCharts.length = 0;
    container.innerHTML = '<section class="card"><p class="muted">Loading sensor history…</p></section>';
    const results = await Promise.all(Object.entries(BOARD_RECAP_METRICS).map(async ([metric, definition]) => {
        const params = new URLSearchParams({
            device_id: boardRecapDeviceId,
            datasource_id: boardRecapDatasourceId,
            metric,
        });
        try {
            const response = await fetch(`/api/chart_data?${params}`);
            if (!response.ok) return null;
            const payload = await response.json();
            return payload.data?.length ? { metric, definition, points: payload.data } : null;
        } catch {
            return null;
        }
    }));

    const charts = results.filter(Boolean);
    container.innerHTML = '';
    if (!charts.length) {
        container.innerHTML = '<section class="card"><p class="muted">No sensor history is available for this board.</p></section>';
        return;
    }
    charts.forEach(({ metric, definition, points }) => {
        const card = document.createElement('section');
        card.className = 'card';
        const canvasId = `board-chart-${metric}`;
        card.innerHTML = `<div class="card-header"><h3 class="card-title">${definition.label}${definition.unit ? ` (${definition.unit})` : ''}</h3></div><div class="chart-wrapper"><canvas id="${canvasId}"></canvas></div>`;
        container.appendChild(card);
        const color = '#1976D2';
        boardRecapCharts.push(new Chart(document.getElementById(canvasId).getContext('2d'), {
            type: 'line',
            data: { datasets: [{
                label: definition.label,
                data: points.map(point => ({ x: new Date(point.real_timestamp), y: point[metric] })),
                borderColor: color,
                backgroundColor: `${color}20`,
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.25,
                fill: false,
            }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        type: 'time',
                        time: { tooltipFormat: 'd MMM, HH:mm' },
                        ...(boardRecapTimeRange ? { min: boardRecapTimeRange.min, max: boardRecapTimeRange.max } : {}),
                        ticks: { color: boardThemeColor('--text-muted') },
                        grid: { color: boardThemeColor('--border') },
                    },
                    y: {
                        title: { display: true, text: definition.unit || definition.label, color: boardThemeColor('--text-muted') },
                        ticks: { color: boardThemeColor('--text-muted') },
                        grid: { color: boardThemeColor('--border') },
                    },
                },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: `${definition.label} over time`, color: boardThemeColor('--text') },
                    zoom: {
                        limits: { x: { min: 'original', max: 'original' } },
                        zoom: {
                            mode: 'x',
                            drag: { enabled: true, backgroundColor: 'rgba(25, 118, 210, 0.15)', borderColor: '#1976D2', borderWidth: 1 },
                            onZoomComplete({ chart }) { syncBoardTimeRange(chart); },
                        },
                    },
                },
            },
        }));
    });
}

function boardThemeColor(variable) {
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

window.addEventListener('loramap-theme-change', () => {
    if (boardRecapDeviceId) {
        renderBoardRecapCharts();
    }
});
