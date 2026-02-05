const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const config = require('./config');
const logger = require('./logger');

const mandantsRouter = require('./routes/mandants.routes');
const customersRouter = require('./routes/customers.routes');
const productsRouter = require('./routes/products.routes');
const ordersRouter = require('./routes/orders.routes');

const { notFound } = require('./middlewares/notFound.middleware');
const { errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Basic hardening
app.use(helmet());

// JSON parsing (for future POST/PUT)
app.use(express.json({ limit: '1mb' }));

// Optional CORS (only needed if browser calls backend directly)
if (config.cors.enabled) {
  app.use(cors({ origin: config.cors.origin }));
  logger.info('CORS enabled for origin:', config.cors.origin);
}

// Request logging (minimal)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Health
app.get('/health', (req, res) => res.json({ ok: true, service: 'bms-backend' }));

// Routes
app.use(config.apiBasePath, mandantsRouter);
app.use(config.apiBasePath, customersRouter);
app.use(config.apiBasePath, productsRouter);
app.use(config.apiBasePath, ordersRouter);

// 404 + error
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  logger.info(`BMS backend listening on http://${config.host}:${config.port}${config.apiBasePath}`);
});
