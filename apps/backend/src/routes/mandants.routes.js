const express = require('express');
const { asyncHandler, sendEnvelope } = require('../utils');
const { listMandants } = require('../db/databases');

const router = express.Router();

router.get('/mandants', asyncHandler(async (req, res) => {
  const mandants = await listMandants();
  sendEnvelope(res, {
    status: 200,
    data: mandants,
    meta: { count: mandants.length },
    error: null,
  });
}));

module.exports = router;
