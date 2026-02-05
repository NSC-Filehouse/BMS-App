const config = require('../config');
const { createResourceRouter } = require('./resource.factory');

module.exports = createResourceRouter(config.resources.customers);
