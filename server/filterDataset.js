/**
 * filterDataset.js
 * 
 * Reads the Kaggle dataset CSV, filters to only Chhattisgarh cities,
 * cleans the data, and inserts it into the SQLite database.
 * 
 * Usage: node server/filterDataset.js
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

// --- Configuration ---
const TARGET_CITIES = ['raipur', 'bilaspur', 'bhilai', 'baloda bazar'];
const CSV_PATH = path.resolve(__dirname, '../dataset/kaggle_dataset.csv');
const DB_PATH = path.resolve(__dirname, '../database.sqlite');

// --- Connect to SQLite ---
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Cannot open database:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to SQLite database');
});

// --- Create table if missing ---
db.run(`CREATE TABLE IF NOT EXISTS monitoring_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    date TEXT NOT NULL,
    pm25 REAL,
    pm10 REAL,
    no2 REAL,
    so2 REAL,
    co REAL,
    o3 REAL,
    aqi REAL,
    aqi_bucket TEXT,
    latitude REAL,
    longitude REAL
)`);

// --- Helpers ---
const normalize = (str) => (str || '').trim().toLowerCase();

const titleCase = (str) =>
    str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

const isValidNumber = (val) => val !== '' && val !== undefined && val !== null && !isNaN(Number(val));

// --- Main filter & insert ---
function processDataset() {
    console.log(`\n📂 Reading CSV: ${CSV_PATH}\n`);

    if (!fs.existsSync(CSV_PATH)) {
        console.error('❌ CSV file not found at:', CSV_PATH);
        process.exit(1);
    }

    const rows = [];
    let totalRows = 0;
    let skippedRows = 0;

    fs.createReadStream(CSV_PATH)
        .pipe(csv())
        .on('data', (row) => {
            totalRows++;

            // 1. Skip rows with null/missing city names
            if (!row.City || row.City.trim() === '') {
                skippedRows++;
                return;
            }

            // 2. Normalize the city name for comparison
            const cityNormalized = normalize(row.City);

            // 3. Filter: only keep target Chhattisgarh cities
            if (!TARGET_CITIES.includes(cityNormalized)) {
                return;
            }

            // 4. Validate numeric fields (AQI is most critical)
            if (!isValidNumber(row.AQI)) {
                skippedRows++;
                console.log(`  ⚠️  Skipped row (invalid AQI): City=${row.City}, AQI=${row.AQI}`);
                return;
            }

            // 5. Clean and push
            rows.push({
                city: titleCase(cityNormalized),
                date: row.Date || '',
                pm25: isValidNumber(row['PM2.5']) ? parseFloat(row['PM2.5']) : null,
                pm10: isValidNumber(row.PM10) ? parseFloat(row.PM10) : null,
                no2: isValidNumber(row.NO2) ? parseFloat(row.NO2) : null,
                so2: isValidNumber(row.SO2) ? parseFloat(row.SO2) : null,
                co: isValidNumber(row.CO) ? parseFloat(row.CO) : null,
                o3: isValidNumber(row.O3) ? parseFloat(row.O3) : null,
                aqi: parseFloat(row.AQI),
                aqi_bucket: row.AQI_Bucket || '',
                latitude: isValidNumber(row.Latitude) ? parseFloat(row.Latitude) : null,
                longitude: isValidNumber(row.Longitude) ? parseFloat(row.Longitude) : null,
            });
        })
        .on('end', () => {
            console.log(`📊 Total rows in CSV:       ${totalRows}`);
            console.log(`🗑️  Skipped (dirty/invalid): ${skippedRows}`);
            console.log(`✅ Rows after filtering:    ${rows.length}`);
            console.log(`\n🏙️  Cities captured: ${[...new Set(rows.map(r => r.city))].join(', ')}\n`);

            insertIntoDatabase(rows);
        })
        .on('error', (err) => {
            console.error('❌ Error reading CSV:', err.message);
            process.exit(1);
        });
}

function insertIntoDatabase(rows) {
    // Clear existing data first
    db.run('DELETE FROM monitoring_data', (err) => {
        if (err) {
            console.error('❌ Error clearing table:', err.message);
            process.exit(1);
        }

        console.log('🧹 Cleared existing monitoring_data table');

        const stmt = db.prepare(`INSERT INTO monitoring_data 
            (city, date, pm25, pm10, no2, so2, co, o3, aqi, aqi_bucket, latitude, longitude) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        let inserted = 0;

        db.serialize(() => {
            rows.forEach((r) => {
                stmt.run([
                    r.city, r.date, r.pm25, r.pm10, r.no2, r.so2,
                    r.co, r.o3, r.aqi, r.aqi_bucket, r.latitude, r.longitude
                ], (err) => {
                    if (err) {
                        console.error(`  ❌ Insert error for ${r.city}:`, err.message);
                    } else {
                        inserted++;
                    }
                });
            });

            stmt.finalize(() => {
                console.log(`\n✅ Successfully inserted ${inserted} rows into monitoring_data`);
                console.log('🎉 Dataset filtering complete!\n');
                db.close();
            });
        });
    });
}

// Run
processDataset();
