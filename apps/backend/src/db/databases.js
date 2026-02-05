const fs = require('fs');
const config = require('../config');
const logger = require('../logger');

let cached = null;

function loadFromDisk() {
  const filePath = config.dbConfigPath;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.databases)) {
      throw new Error('Invalid databases.json format. Expected: { "databases": [ ... ] }');
    }

    cached = parsed.databases;
    return cached;
  } catch (error) {
    logger.critical(`Failed to read DB config: ${filePath}`, error);
    throw error;
  }
}

function ensureLoaded() {
  if (!cached) return loadFromDisk();
  return cached;
}

async function listMandants() {
  const databases = ensureLoaded();
  return databases.map(d => d.name).filter(Boolean);
}

async function getDatabaseConnection(mandant) {
  const databases = ensureLoaded();
  const database = databases.find(db => db.name === mandant);
  if (!database) {
    throw new Error(`No database found for mandant: ${mandant}`);
  }
  return database;
}

module.exports = {
  listMandants,
  getDatabaseConnection,
};
