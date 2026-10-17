let boxNames = {};

async function loadBoxes() {
    const body = document.getElementById('boxes-table-body');
    try {
        const [deviceResponse, namesResponse] = await Promise.all([
            fetch('/api/devices?group_by_datasource=1'),
            fetch('/api/device_names'),
        ]);
        if (!deviceResponse.ok) throw new Error('Could not load devices');
        const deviceData = await deviceResponse.json();
        if (namesResponse.ok) {
            const namesData = await namesResponse.json();
            boxNames = namesData.names || {};
        }
        const devices = deviceData.devices || [];
        if (!devices.length) {
            body.innerHTML = '<tr><td colspan="13" class="muted">No board data yet.</td></tr>';
        } else {
            body.innerHTML = devices.map(box => `
                <tr>
                    <td><strong>${boxEscape(boxNames[box.device_id] || box.device_id)}</strong><span class="boxes-device-id">${boxEscape(box.device_id)}</span></td>
                    <td>${boxEscape(box.device_model || '—')}</td>
                    <td>${boxEscape(box.datasource_name || '—')}</td>
                    ${seenCell(box.seconds_ago)}
                    ${boxCell(box.last_battery, '%', 'battery', 0)}
                    ${boxCell(box.last_battery_voltage, ' V', 'voltage', 3)}
                    ${boxCell(box.last_air_temperature, ' °C', 'temperature', 1)}
                    ${boxCell(box.last_humidity, '%', 'humidity', 1)}
                    ${comfortCell(box.last_air_temperature, box.last_humidity)}
                    ${boxCell(box.last_co2_ppm, ' ppm', 'co2', 0)}
                    ${boxCell(box.last_tvoc_ppb, ' ppb', 'tvoc', 0)}
                    <td class="boxes-neutral">${boxEscape(box.last_work_mode || '—')}</td>
                    ${alarmCell(box.last_alarm_status)}
                </tr>`).join('');
        }
        document.getElementById('boxes-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        body.innerHTML = '<tr><td colspan="13" class="muted">Unable to load board readings.</td></tr>';
        document.getElementById('boxes-updated').textContent = '';
    }
}

function boxCell(value, unit, metric, digits) {
    if (value == null || !Number.isFinite(Number(value))) return '<td class="boxes-empty">—</td>';
    const n = Number(value);
    let level = 'good';
    if (metric === 'battery' || metric === 'voltage') level = n < (metric === 'battery' ? 20 : 3.3) ? 'bad' : n < (metric === 'battery' ? 40 : 3.55) ? 'warn' : 'good';
    if (metric === 'temperature') level = n < 10 || n > 35 ? 'bad' : n < 18 || n > 28 ? 'warn' : 'good';
    if (metric === 'humidity') level = n < 20 || n > 80 ? 'bad' : n < 30 || n > 70 ? 'warn' : 'good';
    if (metric === 'co2') level = n < 800 ? 'good' : n < 1200 ? 'warn' : 'bad';
    if (metric === 'tvoc') level = n < 220 ? 'good' : n < 660 ? 'warn' : 'bad';
    return `<td><span class="box-reading box-${level}">${n.toFixed(digits)}${unit}</span></td>`;
}

function alarmCell(value) {
    if (value == null) return '<td class="boxes-empty">—</td>';
    const active = String(value).toLowerCase() === 'true';
    return `<td><span class="box-reading box-${active ? 'bad' : 'good'}">${active ? 'ALARM' : 'Clear'}</span></td>`;
}

function seenCell(seconds) {
    if (seconds == null) return '<td class="boxes-empty">—</td>';
    const level = seconds > 7200 ? 'bad' : seconds > 1800 ? 'warn' : 'good';
    return `<td class="boxes-seen"><span class="box-reading box-${level}">${boxEscape(boxAge(seconds))}</span></td>`;
}

function comfortCell(temperature, humidity) {
    if (temperature == null || humidity == null) return '<td class="boxes-empty">—</td>';
    const temp = Number(temperature);
    const hum = Number(humidity);
    if (!Number.isFinite(temp) || !Number.isFinite(hum)) return '<td class="boxes-empty">—</td>';
    if (temp <= 0) return comfortBadge('bad', '🧊', 'Freezing', temp, hum);
    if (temp <= 10) return comfortBadge('bad', '🥶', 'Cold', temp, hum);
    if (temp >= 35) return comfortBadge('bad', '🥵', 'Extreme heat', temp, hum);
    if (temp >= 30) return comfortBadge('bad', '🔥', 'Hot', temp, hum);
    if (hum <= 20) return comfortBadge('bad', '🏜️', 'Very dry', temp, hum);
    if (hum >= 80) return comfortBadge('bad', '💦', 'Very humid', temp, hum);
    const comfortable = temp >= 18 && temp <= 26 && hum >= 30 && hum <= 60;
    const acceptable = temp >= 16 && temp <= 28 && hum >= 20 && hum <= 70;
    const level = comfortable ? 'good' : acceptable ? 'warn' : 'bad';
    const icon = comfortable ? '🙂' : acceptable ? '😐' : '😟';
    const label = comfortable ? 'Comfortable' : acceptable ? 'Fair' : 'Uncomfortable';
    return comfortBadge(level, icon, label, temp, hum);
}

function comfortBadge(level, icon, label, temperature, humidity) {
    return `<td><span class="box-reading box-${level} box-comfort" title="${label}: ${temperature.toFixed(1)} °C, ${humidity.toFixed(1)}% humidity" aria-label="${label}">${icon} ${label}</span></td>`;
}

function boxAge(seconds) {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function boxEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
}
