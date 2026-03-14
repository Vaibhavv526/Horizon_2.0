const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const monitoringRoutes = require('./routes/monitoringRoutes');
const userRoutes = require('./routes/userRoutes');

// Load env vars
dotenv.config();

// Initialize SQLite (auto-connects on require)
require('./config/db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static folder for frontend
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/cities', monitoringRoutes);
app.use('/api/users', userRoutes);

// Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
