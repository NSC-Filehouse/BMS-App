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
const tempOrdersRouter = require('./routes/temp-orders.routes');
const { getUserContextFromRequest } = require('./user-context');
const { runSQLQuerySqlServer } = require('./db/access');

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

// Current user info (from reverse proxy headers)
app.get(`${config.apiBasePath}/me`, (req, res) => {
  res.json(getUserContextFromRequest(req));
});

// SQL diagnostics (temporary endpoint for rollout debugging)
app.get(`${config.apiBasePath}/sql-diagnostics`, async (req, res, next) => {
  try {
    const contextRows = await runSQLQuerySqlServer(
      config.sql.database,
      "SELECT DB_NAME() AS dbName, @@SERVERNAME AS serverName, SUSER_SNAME() AS loginName",
      []
    );
    const tablesRows = await runSQLQuerySqlServer(
      config.sql.database,
      `SELECT TABLE_SCHEMA AS [schema], TABLE_NAME AS [name]
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME LIKE '%Mandant%'
       ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      []
    );
    const objectRows = await runSQLQuerySqlServer(
      config.sql.database,
      `SELECT
         OBJECT_ID(N'dbo.tblMandant') AS dbo_tblMandant,
         OBJECT_ID(N'dbo.tblMandanten') AS dbo_tblMandanten`,
      []
    );

    res.json({
      configured: {
        instance: config.sql.instance,
        database: config.sql.database,
        user: config.sql.user,
      },
      context: Array.isArray(contextRows) ? (contextRows[0] || null) : contextRows,
      objects: Array.isArray(objectRows) ? (objectRows[0] || null) : objectRows,
      mandantTables: tablesRows || [],
    });
  } catch (error) {
    next(error);
  }
});

// Routes
app.use(config.apiBasePath, mandantsRouter);
app.use(config.apiBasePath, customersRouter);
app.use(config.apiBasePath, productsRouter);
app.use(config.apiBasePath, ordersRouter);
app.use(config.apiBasePath, tempOrdersRouter);

// 404 + error
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  logger.info(`BMS backend listening on http://${config.host}:${config.port}${config.apiBasePath}`);
});
