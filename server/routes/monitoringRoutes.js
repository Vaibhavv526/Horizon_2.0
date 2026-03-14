const express = require('express');
const router = express.Router();
const db = require('../config/db');

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

// @route   GET /api/cities/:city
// @desc    Return monitoring data for a specific city (case-insensitive)
router.get('/:city', (req, res) => {
    const cityName = req.params.city.trim();

    // Title-case the city name for matching
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
