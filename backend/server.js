// Load .env first: route modules read env vars (ADMIN_USERNAME, MODERATOR_USERNAMES) when required.
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const chatRoutes = require('./routes/chat');
const stockRoutes = require('./routes/stocks');
const { initMarket } = require('./lib/stockMarket');

const app = express();
const PORT = process.env.PORT || 3005;

// Gzip all responses (JS: 181KB → ~54KB, CSS: 32KB → ~7KB)
app.use(compression());

// CORS: restrict to ALLOWED_ORIGIN in production, open in dev
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
app.use(cors(ALLOWED_ORIGIN
  ? { origin: ALLOWED_ORIGIN, credentials: true }
  : { origin: true }
));

// 2 MB body cap — game saves are ~30–80 KB, 2 MB is generous headroom
app.use(express.json({ limit: '2mb' }));

// Route Handlers
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/stocks', stockRoutes);

// Start shared stock market (initializes from DB, schedules price ticks)
initMarket();

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Dev Tycoon API is running.' });
});

// Serve static files — hashed assets (JS/CSS) cached 1 year, index.html never cached
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.(js|css|woff2?|ttf|svg|png|ico)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Fallback for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

// Start Server
const server = app.listen(PORT, () => {
    console.log('Dev Tycoon is live on port ' + PORT);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the existing process or set a different PORT.`);
        process.exit(1);
    }
    console.error('Server startup error:', err);
    process.exit(1);
});
