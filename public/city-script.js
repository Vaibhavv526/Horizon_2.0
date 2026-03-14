// ===== Setup =====
const urlParams = new URLSearchParams(window.location.search);
const cityName = urlParams.get('city') || 'Raipur';

document.getElementById('cityNameDisplay').innerText = cityName;
document.getElementById('citySubtitle').innerText = `${cityName} Environmental Monitoring & Analysis`;

// ===== Leaflet Map Setup =====
const COORDS = {
    'Raipur': [21.2514, 81.6296],
    'Bilaspur': [22.0797, 82.1391],
    'Bhilai': [21.1938, 81.3509],
    'Baloda Bazar': [21.6567, 82.1604]
};

const map = L.map('cityMap').setView(COORDS[cityName] || [21.5, 81.8], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ===== Charts =====
let airChart, waterChart, noiseChart;

const fetchCityData = async () => {
    try {
        const [airRes, waterRes, noiseRes] = await Promise.all([
            fetch(`/api/cities/${cityName}`),
            fetch(`/api/cities/water?city=${cityName}`),
            fetch(`/api/cities/noise?city=${cityName}`)
        ]);

        const airData = await airRes.json();
        const waterData = await waterRes.json();
        const noiseData = await noiseRes.json();

        renderCharts(airData, waterData, noiseData);
        renderTable(airData, waterData, noiseData);
        addMarkers(airData, waterData, noiseData);

    } catch (err) {
        console.error('Fetch error:', err);
    }
};

const renderCharts = (air, water, noise) => {
    // Air Chart
    const airCtx = document.getElementById('cityAirChart').getContext('2d');
    airChart = new Chart(airCtx, {
        type: 'line',
        data: {
            labels: air.map(r => r.date),
            datasets: [{
                label: 'AQI Status',
                data: air.map(r => r.aqi),
                borderColor: '#ef4444',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(239, 68, 68, 0.1)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Water Chart (Latest)
    const waterCtx = document.getElementById('cityWaterChart').getContext('2d');
    const latestWater = water[0] || {};
    waterChart = new Chart(waterCtx, {
        type: 'radar',
        data: {
            labels: ['pH', 'DO', 'BOD', 'Turbidity', 'TDS'],
            datasets: [{
                label: 'Water Parameters',
                data: [latestWater.pH, latestWater.Dissolved_Oxygen, latestWater.BOD, latestWater.Turbidity, latestWater.TDS / 100],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Noise Chart
    const noiseCtx = document.getElementById('cityNoiseChart').getContext('2d');
    noiseChart = new Chart(noiseCtx, {
        type: 'bar',
        data: {
            labels: noise.map(r => r.Zone_Type),
            datasets: [
                { label: 'Day (dB)', data: noise.map(r => r.Leq_Day), backgroundColor: '#f59e0b99' },
                { label: 'Night (dB)', data: noise.map(r => r.Leq_Night), backgroundColor: '#3b82f699' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
};

const renderTable = (air, water, noise) => {
    const tbody = document.getElementById('cityTableBody');
    let rows = [];

    air.slice(0, 5).forEach(r => rows.push({ type: 'Air', station: r.station, date: r.date, metric: `AQI: ${r.aqi}`, status: r.aqi_bucket }));
    water.slice(0, 5).forEach(r => rows.push({ type: 'Water', station: r.Station, date: r.Date, metric: `pH: ${r.pH}`, status: r.Status }));
    noise.slice(0, 5).forEach(r => rows.push({ type: 'Noise', station: r.Station, date: r.Date, metric: `${r.Leq_Day} dB`, status: r.Status }));

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td><span class="aqi-badge" style="background: #f1f5f9; color: #475569">${r.type}</span></td>
            <td>${r.station || 'N/A'}</td>
            <td>${r.date}</td>
            <td><b>${r.metric}</b></td>
            <td>${r.status}</td>
        </tr>
    `).join('');
};

const addMarkers = (air, water, noise) => {
    const stations = {};
    [...air, ...water, ...noise].forEach(r => {
        const name = r.station || r.Station;
        if (!stations[name]) {
            stations[name] = { lat: COORDS[cityName][0] + (Math.random()-0.5)*0.02, lng: COORDS[cityName][1] + (Math.random()-0.5)*0.02 };
        }
    });

    Object.entries(stations).forEach(([name, pos]) => {
        L.marker([pos.lat, pos.lng]).addTo(map).bindPopup(`<b>${name}</b><br>Monitoring Station`);
    });
};

fetchCityData();
