// ===== Leaflet Map Setup =====
const map = L.map('map').setView([21.5, 81.8], 8); // Centered on Chhattisgarh

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let mapMarkers = [];

// ===== Global Data State =====
let allData = []; // Air Quality
let allWaterData = [];
let allNoiseData = [];

// ===== Chart.js Instances =====
let aqiTrendChart = null;
let pollutantChart = null;
let waterChart = null;
let noiseChart = null;

// ===== Color Palette =====
const CITY_COLORS = {
    'Raipur':       { line: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
    'Bilaspur':     { line: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
    'Bhilai':       { line: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    'Baloda Bazar': { line: '#10b981', bg: 'rgba(16,185,129,0.15)' }
};

// ===== AQI Helpers =====
const getAqiBadge = (aqi, bucket) => {
    let cls = 'aqi-good';
    if (aqi > 300) cls = 'aqi-hazardous';
    else if (aqi > 200) cls = 'aqi-very-unhealthy';
    else if (aqi > 150) cls = 'aqi-unhealthy';
    else if (aqi > 100) cls = 'aqi-usg';
    else if (aqi > 50) cls = 'aqi-moderate';
    return `<span class="aqi-badge ${cls}">${bucket || aqi}</span>`;
};

const getMarkerColor = (aqi) => {
    if (aqi > 200) return '#991b1b';
    if (aqi > 150) return '#ef4444';
    if (aqi > 100) return '#f59e0b';
    if (aqi > 50) return '#eab308';
    return '#10b981';
};

// ===== Status Message =====
const statusEl = document.getElementById('statusMessage');
const setStatus = (text, type = '') => {
    statusEl.textContent = text;
    statusEl.className = 'status-pill' + (type ? ` ${type}` : '');
};

// ===== Data Fetching =====
const fetchData = async (city = 'all') => {
    try {
        setStatus('Fetching data...');
        const url = city === 'all' ? '/api/cities' : `/api/cities/${encodeURIComponent(city)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) throw new Error(data.message || 'Failed to fetch');

        allData = data;
        applyFilters(); 
        renderAqiTrendChart(data);
        renderPollutantChart(data);
        setStatus(`Showing ${data.length} records`, 'success');
    } catch (err) {
        console.error('Fetch error:', err);
        setStatus('Failed to load data', 'error');
    }
};

// ===== Table Rendering =====
const renderTable = (data) => {
    const tbody = document.getElementById('tableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => `
        <tr>
            <td><b>${r.city}</b></td>
            <td>${r.date}</td>
            <td>${r.pm25 ?? '-'}</td>
            <td>${r.pm10 ?? '-'}</td>
            <td>${r.no2 ?? '-'}</td>
            <td><b>${r.aqi}</b></td>
            <td>${getAqiBadge(r.aqi, r.aqi_bucket)}</td>
        </tr>
    `).join('');
};

// ===== Map Rendering =====
const renderMap = () => {
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    const cities = ['Raipur', 'Bilaspur', 'Bhilai', 'Baloda Bazar'];
    const COORDS = {
        'Raipur': [21.2514, 81.6296],
        'Bilaspur': [22.0797, 82.1391],
        'Bhilai': [21.1938, 81.3509],
        'Baloda Bazar': [21.6567, 82.1604]
    };

    cities.forEach(cityName => {
        const air = allData.find(d => d.city === cityName) || {};
        const water = (allWaterData || []).find(d => d.City === cityName) || {};
        const noise = (allNoiseData || []).find(d => d.City === cityName) || {};

        if (!COORDS[cityName]) return;

        const aqi = air.aqi || 0;
        const color = getMarkerColor(aqi);

        const marker = L.circleMarker(COORDS[cityName], {
            radius: 12, fillColor: color, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.85
        }).addTo(map);

        marker.bindPopup(`
            <div style="font-family:Inter,sans-serif;min-width:180px;padding:4px">
                <h3 style="margin:0 0 8px;font-size:1rem;color:#1e293b">${cityName}</h3>
                <div style="display:grid;gap:6px;font-size:0.85rem;color:#475569">
                    <div>🌿 <b>AQI:</b> ${air.aqi || '--'}</div>
                    <div>💧 <b>Water:</b> ${water.Status || 'N/A'}</div>
                    <div>🔊 <b>Noise:</b> ${noise.Status || 'N/A'}</div>
                </div>
            </div>
        `);
        mapMarkers.push(marker);
    });
};

// ===== Charts =====
const renderAqiTrendChart = (data) => {
    const ctx = document.getElementById('aqiTrendChart').getContext('2d');
    if (aqiTrendChart) aqiTrendChart.destroy();
    const cities = [...new Set(data.map(r => r.city))];
    const datasets = cities.map(city => {
        const cityData = data.filter(r => r.city === city).sort((a, b) => a.date.localeCompare(b.date));
        const colors = CITY_COLORS[city] || { line: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
        return {
            label: city,
            data: cityData.map(r => ({ x: r.date, y: r.aqi })),
            borderColor: colors.line,
            backgroundColor: colors.bg,
            fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2
        };
    });
    aqiTrendChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: { responsive: true, maintainAspectRatio: false }
    });
};

const renderPollutantChart = (data) => {
    const ctx = document.getElementById('pollutantChart').getContext('2d');
    if (pollutantChart) pollutantChart.destroy();
    const cities = [...new Set(data.map(r => r.city))];
    const pollutants = ['pm25', 'pm10', 'no2'];
    const pollutantLabels = ['PM2.5', 'PM10', 'NO₂'];

    const datasets = cities.map(city => {
        const cityData = data.filter(r => r.city === city);
        const avgs = pollutants.map(p => {
            const vals = cityData.map(r => r[p]).filter(v => v !== null);
            return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
        });
        const colors = CITY_COLORS[city] || { line: '#6b7280' };
        return { label: city, data: avgs, backgroundColor: colors.line + '99', borderColor: colors.line, borderWidth: 1 };
    });

    pollutantChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: pollutantLabels, datasets },
        options: { responsive: true, maintainAspectRatio: false }
    });
};

// ===== Search & Filter Logic =====
const applyFilters = () => {
    const city = document.getElementById('citySelect').value;

    const filterFunc = (item, cityProp) => {
        return city === 'all' || item[cityProp] === city;
    };

    renderTable(allData.filter(r => filterFunc(r, 'city')));
};

document.getElementById('citySelect').addEventListener('change', (e) => {
    fetchData(e.target.value);
    fetchWaterData(e.target.value);
    fetchNoiseData(e.target.value);
});

// ===== Water Data =====
const fetchWaterData = async (city = 'all') => {
    try {
        const url = city === 'all' ? '/api/cities/water' : `/api/cities/water?city=${encodeURIComponent(city)}`;
        const res = await fetch(url);
        const data = await res.json();
        allWaterData = data;
        applyFilters(); renderWaterChart(data); renderMap();
    } catch (err) { console.error(err); }
};

// Water data rendering logic for tables removed for privacy reasons.

const renderWaterChart = (data) => {
    const ctx = document.getElementById('waterChart').getContext('2d');
    if (waterChart) waterChart.destroy();
    const cities = [...new Set(data.map(r => r.City))];
    const datasets = cities.map(city => {
        const rows = data.filter(r => r.City === city);
        const avgPh = rows.reduce((a, b) => a + parseFloat(b.pH), 0) / rows.length;
        const colors = CITY_COLORS[city] || { line: '#6b7280' };
        return { label: city, data: [avgPh], backgroundColor: colors.line + '99' };
    });
    waterChart = new Chart(ctx, { type: 'bar', data: { labels: ['Avg pH'], datasets }, options: { responsive: true, maintainAspectRatio: false } });
};

// ===== Noise Data =====
const fetchNoiseData = async (city = 'all') => {
    try {
        const url = city === 'all' ? '/api/cities/noise' : `/api/cities/noise?city=${encodeURIComponent(city)}`;
        const res = await fetch(url);
        const data = await res.json();
        allNoiseData = data;
        applyFilters(); renderNoiseChart(data); renderMap();
    } catch (err) { console.error(err); }
};

// Noise data rendering logic for tables removed for privacy reasons.

const renderNoiseChart = (data) => {
    const ctx = document.getElementById('noiseChart').getContext('2d');
    if (noiseChart) noiseChart.destroy();
    const cities = [...new Set(data.map(r => r.City))];
    const datasets = [
        { label: 'Day (dB)', data: cities.map(c => data.filter(r => r.City === c).reduce((a, b) => a + parseFloat(b.Leq_Day), 0) / data.filter(r => r.City === c).length), backgroundColor: '#f59e0b99' },
        { label: 'Night (dB)', data: cities.map(c => data.filter(r => r.City === c).reduce((a, b) => a + parseFloat(b.Leq_Night), 0) / data.filter(r => r.City === c).length), backgroundColor: '#3b82f699' }
    ];
    noiseChart = new Chart(ctx, { type: 'bar', data: { labels: cities, datasets }, options: { responsive: true, maintainAspectRatio: false } });
};

// ===== Citizen Auth =====
const checkCitizenAuth = () => {
    const userStr = localStorage.getItem('envCitizen');
    const authDiv = document.getElementById('citizenAuth');
    if (!userStr) { window.location.href = 'index.html'; return; }
    try {
        const user = JSON.parse(userStr);
        authDiv.innerHTML = `
            <span style="font-size:0.85rem;font-weight:500;color:#1e293b">Hi, <b>${user.username}</b></span>
            <button onclick="citizenLogout()" class="nav-btn-outline" style="cursor:pointer;color:#ef4444;border-color:#ef4444;margin-left:1rem">Logout</button>
        `;
    } catch (e) { citizenLogout(); }
};

window.citizenLogout = () => { localStorage.removeItem('envCitizen'); window.location.href = 'index.html'; };

document.addEventListener('DOMContentLoaded', () => {
    checkCitizenAuth(); fetchData(); fetchWaterData(); fetchNoiseData();
});
