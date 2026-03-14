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
// Air quality data is now stored in global state above.

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
        tbody.innerHTML = '<tr><td colspan="10" class="loading">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => `
        <tr>
            <td><b>${r.city}</b></td>
            <td>${r.date}</td>
            <td>${r.pm25 ?? '-'}</td>
            <td>${r.pm10 ?? '-'}</td>
            <td>${r.no2 ?? '-'}</td>
            <td>${r.so2 ?? '-'}</td>
            <td>${r.co ?? '-'}</td>
            <td>${r.o3 ?? '-'}</td>
            <td><b>${r.aqi}</b></td>
            <td>${getAqiBadge(r.aqi, r.aqi_bucket)}</td>
        </tr>
    `).join('');
};

// ===== Map Rendering =====
const renderMap = () => {
    // Clear old markers
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    // Group by city to show latest reading per city
    const cities = ['Raipur', 'Bilaspur', 'Bhilai', 'Baloda Bazar'];
    
    // Fixed coordinates
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
                    <div>🌿 <b>AQI:</b> ${air.aqi || '--'} <span style="font-size:0.75rem">(${air.aqi_bucket || 'N/A'})</span></div>
                    <div>🫁 <b>PM2.5:</b> ${air.pm25 || '--'}</div>
                    <div>💧 <b>Water:</b> <span style="font-weight:600">${water.Status || 'N/A'}</span></div>
                    <div>🔊 <b>Noise:</b> <span style="font-weight:600">${noise.Status || 'N/A'}</span></div>
                </div>
            </div>
        `);

        mapMarkers.push(marker);
    });

    // Fit bounds if markers exist
    if (mapMarkers.length > 0) {
        const group = L.featureGroup(mapMarkers);
        map.fitBounds(group.getBounds().pad(0.3));
    }
};

// ===== AQI Trend Line Chart =====
const renderAqiTrendChart = (data) => {
    const ctx = document.getElementById('aqiTrendChart').getContext('2d');
    
    if (aqiTrendChart) aqiTrendChart.destroy();

    // Group data by city
    const cities = [...new Set(data.map(r => r.city))];
    
    const datasets = cities.map(city => {
        const cityData = data
            .filter(r => r.city === city)
            .sort((a, b) => a.date.localeCompare(b.date));
        
        const colors = CITY_COLORS[city] || { line: '#6b7280', bg: 'rgba(107,114,128,0.15)' };

        return {
            label: city,
            data: cityData.map(r => ({ x: r.date, y: r.aqi })),
            borderColor: colors.line,
            backgroundColor: colors.bg,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            borderWidth: 2
        };
    });

    aqiTrendChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    type: 'category',
                    labels: [...new Set(data.map(r => r.date))].sort(),
                    ticks: { maxRotation: 45, font: { size: 10 } },
                    grid: { display: false }
                },
                y: {
                    title: { display: true, text: 'AQI', font: { weight: 'bold' } },
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 15 } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: AQI ${ctx.parsed.y}`
                    }
                }
            }
        }
    });
};

// ===== Pollutant Comparison Bar Chart =====
const renderPollutantChart = (data) => {
    const ctx = document.getElementById('pollutantChart').getContext('2d');
    
    if (pollutantChart) pollutantChart.destroy();

    const cities = [...new Set(data.map(r => r.city))];
    const pollutants = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];
    const pollutantLabels = ['PM2.5', 'PM10', 'NO₂', 'SO₂', 'CO', 'O₃'];
    const barColors = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981'];

    // Compute average per city per pollutant
    const datasets = cities.map((city, i) => {
        const cityData = data.filter(r => r.city === city);
        const avgs = pollutants.map(p => {
            const vals = cityData.map(r => r[p]).filter(v => v !== null && v !== undefined);
            return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
        });

        const colors = CITY_COLORS[city] || { line: '#6b7280' };
        return {
            label: city,
            data: avgs,
            backgroundColor: colors.line + '99',
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: 4
        };
    });

    pollutantChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: pollutantLabels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: {
                    title: { display: true, text: 'Avg Value', font: { weight: 'bold' } },
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 15 } }
            }
        }
    });
};

// ===== Search & Filter Logic =====
const applyFilters = () => {
    const city = document.getElementById('citySelect').value;
    const query = document.getElementById('searchInput').value.toLowerCase();

    // Filter Air Data
    const filteredAir = allData.filter(r => {
        const matchesCity = city === 'all' || r.city === city;
        const matchesQuery = !query || 
                             (r.city?.toLowerCase().includes(query)) || 
                             (r.station?.toLowerCase().includes(query));
        return matchesCity && matchesQuery;
    });
    renderTable(filteredAir);

    // Filter Water Data
    const filteredWater = allWaterData.filter(r => {
        const matchesCity = city === 'all' || r.City === city;
        const matchesQuery = !query || 
                             (r.City?.toLowerCase().includes(query)) || 
                             (r.Station?.toLowerCase().includes(query));
        return matchesCity && matchesQuery;
    });
    renderWaterTable(filteredWater);

    // Filter Noise Data
    const filteredNoise = allNoiseData.filter(r => {
        const matchesCity = city === 'all' || r.City === city;
        const matchesQuery = !query || 
                             (r.City?.toLowerCase().includes(query)) || 
                             (r.Station?.toLowerCase().includes(query));
        return matchesCity && matchesQuery;
    });
    renderNoiseTable(filteredNoise);
};

document.getElementById('citySelect').addEventListener('change', (e) => {
    fetchData(e.target.value);
    fetchWaterData(e.target.value);
    fetchNoiseData(e.target.value);
});

document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        const cities = ['Raipur', 'Bilaspur', 'Bhilai', 'Baloda Bazar'];
        const matchedCity = cities.find(c => c.toLowerCase() === query.toLowerCase());
        
        if (matchedCity) {
            window.location.href = `city-dashboard.html?city=${encodeURIComponent(matchedCity)}`;
        }
    }
});

document.getElementById('searchInput').addEventListener('input', applyFilters);

// waterChart is now declared globally at the top.

const fetchWaterData = async (city = 'all') => {
    try {
        const url = city === 'all' ? '/api/cities/water' : `/api/cities/water?city=${encodeURIComponent(city)}`;
        const res = await fetch(url);
        const data = await res.json();
        allWaterData = data;
        applyFilters();
        renderWaterChart(data);
        renderMap();
    } catch (err) {
        console.error('Water data error:', err);
    }
};

const renderWaterTable = (data) => {
    const tbody = document.getElementById('waterTableBody');
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">No water data</td></tr>';
        return;
    }
    const statusColor = (s) => {
        if (s === 'Good') return '#10b981';
        if (s === 'Acceptable') return '#3b82f6';
        if (s === 'Moderate') return '#f59e0b';
        if (s === 'Poor') return '#ef4444';
        if (s === 'Critical') return '#991b1b';
        return '#64748b';
    };
    tbody.innerHTML = data.map(r => `
        <tr>
            <td><b>${r.City}</b></td>
            <td>${r.Date}</td>
            <td>${r.Station}</td>
            <td>${r.pH}</td>
            <td>${r.Dissolved_Oxygen}</td>
            <td>${r.BOD}</td>
            <td>${r.Turbidity}</td>
            <td>${r.TDS}</td>
            <td><span class="aqi-badge" style="background:${statusColor(r.Status)}20;color:${statusColor(r.Status)}">${r.Status}</span></td>
        </tr>
    `).join('');
};

const renderWaterChart = (data) => {
    const ctx = document.getElementById('waterChart').getContext('2d');
    if (waterChart) waterChart.destroy();

    const cities = [...new Set(data.map(r => r.City))];
    const params = ['pH', 'Dissolved_Oxygen', 'BOD', 'Turbidity'];
    const paramLabels = ['pH', 'DO', 'BOD', 'Turbidity'];

    const datasets = cities.map(city => {
        const rows = data.filter(r => r.City === city);
        const avgs = params.map(p => {
            const vals = rows.map(r => parseFloat(r[p])).filter(v => !isNaN(v));
            return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
        });
        const colors = CITY_COLORS[city] || { line: '#6b7280' };
        return {
            label: city,
            data: avgs,
            backgroundColor: colors.line + '99',
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: 4
        };
    });

    waterChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: paramLabels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, title: { display: true, text: 'Avg Value' } }
            },
            plugins: { legend: { position: 'top', labels: { usePointStyle: true } } }
        }
    });
};

// noiseChart is now declared globally at the top.

const fetchNoiseData = async (city = 'all') => {
    try {
        const url = city === 'all' ? '/api/cities/noise' : `/api/cities/noise?city=${encodeURIComponent(city)}`;
        const res = await fetch(url);
        const data = await res.json();
        allNoiseData = data;
        applyFilters();
        renderNoiseChart(data);
        renderMap();
    } catch (err) {
        console.error('Noise data error:', err);
    }
};

const renderNoiseTable = (data) => {
    const tbody = document.getElementById('noiseTableBody');
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">No noise data</td></tr>';
        return;
    }
    const statusColor = (s) => {
        if (s === 'Within Limits') return '#10b981';
        if (s === 'Marginal') return '#f59e0b';
        if (s === 'Exceeding') return '#ef4444';
        if (s === 'Critical') return '#991b1b';
        return '#64748b';
    };
    tbody.innerHTML = data.map(r => `
        <tr>
            <td><b>${r.City}</b></td>
            <td>${r.Date}</td>
            <td>${r.Station}</td>
            <td>${r.Zone_Type}</td>
            <td>${r.Leq_Day}</td>
            <td>${r.Leq_Night}</td>
            <td>${r.Limit_Day}</td>
            <td>${r.Limit_Night}</td>
            <td><span class="aqi-badge" style="background:${statusColor(r.Status)}20;color:${statusColor(r.Status)}">${r.Status}</span></td>
        </tr>
    `).join('');
};

const renderNoiseChart = (data) => {
    const ctx = document.getElementById('noiseChart').getContext('2d');
    if (noiseChart) noiseChart.destroy();

    const cities = [...new Set(data.map(r => r.City))];

    const datasets = [
        {
            label: 'Day Level (dB)',
            data: cities.map(city => {
                const rows = data.filter(r => r.City === city);
                const vals = rows.map(r => parseFloat(r.Leq_Day)).filter(v => !isNaN(v));
                return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
            }),
            backgroundColor: '#f59e0b99',
            borderColor: '#f59e0b',
            borderWidth: 1, borderRadius: 4
        },
        {
            label: 'Night Level (dB)',
            data: cities.map(city => {
                const rows = data.filter(r => r.City === city);
                const vals = rows.map(r => parseFloat(r.Leq_Night)).filter(v => !isNaN(v));
                return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
            }),
            backgroundColor: '#3b82f699',
            borderColor: '#3b82f6',
            borderWidth: 1, borderRadius: 4
        }
    ];

    noiseChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: cities, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, title: { display: true, text: 'dB Level' } }
            },
            plugins: { legend: { position: 'top', labels: { usePointStyle: true } } }
        }
    });
};

// ===== Auth Check =====
const checkAuth = () => {
    const userStr = localStorage.getItem('envUser');
    const authDiv = document.getElementById('authButtons');
    
    if (!userStr) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const user = JSON.parse(userStr);
        authDiv.innerHTML = `
            <span style="font-size:0.85rem;font-weight:500;color:#1e293b">Welcome, <b>${user.username}</b></span>
            <button onclick="logout()" class="nav-btn-outline" style="cursor:pointer;color:#ef4444;border-color:#ef4444">Logout</button>
        `;
    } catch (e) {
        logout();
    }
};

window.logout = () => {
    localStorage.removeItem('envUser');
    window.location.href = 'index.html';
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('envUser')) {
        window.location.href = 'index.html';
        return;
    }
    checkAuth();
    fetchData();
    fetchWaterData();
    fetchNoiseData();
});

