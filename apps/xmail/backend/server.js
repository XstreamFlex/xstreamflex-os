const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./config/database');
const apiRoutes = require('./routes/api');
const trackingRoutes = require('./routes/tracking');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for webhooks & embed snippet from Xsites / EZsites
app.use(cors());

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (Admin UI & JS SDK snippet)
app.use(express.static(path.join(__dirname, 'public')));

// Mount API & Tracking routes
app.use('/api/v1', apiRoutes);
app.use('/', trackingRoutes);

// Root route serves dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Boot Server & Initialize Database Schema
async function startServer() {
  try {
    console.log('⚡ Initializing XMail Autoresponder database...');
    await db.initSchema();

    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 XStreamFlex Autoresponder running at: http://localhost:${PORT}`);
      console.log(`📁 Admin Dashboard: http://localhost:${PORT}`);
      console.log(`🔌 Xsites/EZsites SDK: http://localhost:${PORT}/sdk/xmail.js`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('❌ Failed to start XMail server:', error);
    process.exit(1);
  }
}

startServer();
