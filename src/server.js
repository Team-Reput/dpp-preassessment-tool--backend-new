const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./config/db'); // keeps db connection test running

const app = express();

// ── Middleware (runs on every request) ───────────────────────
app.use(cors({
  origin: ['http://localhost:4200', 'https://scan.dppreput.com'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());   // lets Express read JSON from req.body


// ── Health check (load balancer, must not depend on the DB) ──
app.get('/health', (req, res) => res.status(200).send('ok'));

// ── Routes ───────────────────────────────────────────────────
app.get('/api', (req, res) => res.status(200).json({ success: true, message: 'DPP API is running' }));
app.use('/api/contact-details', require('./routes/contact-details'));
app.use('/api/questions',       require('./routes/questions'));
app.use('/api/answered-que',    require('./routes/answered-que'));
app.use('/api/score',           require('./routes/score'));
app.use('/api/email-report',    require('./routes/email-report'));

// ── Start server (always last) ───────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});