const express = require('express');
const router = express.Router();
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// @route   GET /api/cities
// @desc    Return all monitoring data for the 4 Chhattisgarh cities
router.get('/', (req, res) => {
    db.all("SELECT * FROM monitoring_data ORDER BY city, date DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        res.status(200).json(rows);
    });
});

// Helper: parse a CSV and return filtered rows
const parseCSV = (filename, cityFilter) => {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(path.join(__dirname, '../../dataset', filename))
            .pipe(csv())
            .on('data', (row) => {
                if (!cityFilter || cityFilter === 'all' || row.City.toLowerCase() === cityFilter.toLowerCase()) {
                    results.push(row);
                }
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
};

// @route   GET /api/cities/water?city=Raipur
router.get('/water', async (req, res) => {
    try {
        const city = req.query.city || 'all';
        const data = await parseCSV('water_quality.csv', city);
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: 'Error reading water data', error: err.message });
    }
});

// @route   GET /api/cities/noise?city=Raipur
router.get('/noise', async (req, res) => {
    try {
        const city = req.query.city || 'all';
        const data = await parseCSV('noise_pollution.csv', city);
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: 'Error reading noise data', error: err.message });
    }
});

// @route   GET /api/cities/:city
// @desc    Return monitoring data for a specific city (case-insensitive)
router.get('/:city', (req, res) => {
    const cityName = req.params.city.trim();
    const titleCased = cityName.replace(/\w\S*/g, (txt) =>
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
    db.all(
        "SELECT * FROM monitoring_data WHERE city = ? ORDER BY date DESC",
        [titleCased],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            if (rows.length === 0) {
                return res.status(404).json({ message: `No data found for city: ${cityName}` });
            }
            res.status(200).json(rows);
        }
    );
});

module.exports = router;
