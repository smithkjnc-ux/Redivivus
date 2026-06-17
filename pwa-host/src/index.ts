import express from 'express';
import cors from 'cors';
import { handlePublish } from './publish';
import { handleServe } from './serve';

const app = express();

// Increase JSON payload limit to accommodate the 10MB base64 PWA bundles
app.use(express.json({ limit: '15mb' }));

// Apply CORS allowing any origin for both POST and GET
app.use(cors({
  origin: '*',
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-redivivus-app'],
  maxAge: 86400
}));

app.post('/publish', handlePublish);
app.get('/p/:token/*', handleServe);
app.get('/p/:token', handleServe); // Handle case without trailing slash

app.get('/', (req, res) => {
  res.status(200).type('text/plain').send('Redivivus PWA host: OK');
});

app.get('/health', (req, res) => {
  res.status(200).type('text/plain').send('Redivivus PWA host: OK');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`PWA host listening on port ${PORT}`);
});
