const express = require('express');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { loadCustomerDeliveryAddresses } = require('../db/delivery-addresses');
const { loadHolidayRows } = require('../db/holidays');
const {
  checkDeliveryDates,
  getNextWorkingDate,
  resolveHolidayProfile,
} = require('../delivery-calendar');
const logger = require('../logger');

const router = express.Router();

function parseAddressId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const id = Number(text);
  if (!Number.isInteger(id) || id < 0 || id > 2147483647) {
    throw createHttpError(400, 'Invalid delivery address id.', { code: 'INVALID_DELIVERY_ADDRESS_ID' });
  }
  return id;
}

function normalizeDates(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)));
}

router.post('/delivery-calendar/check', requireMandant, asyncHandler(async (req, res) => {
  const dates = normalizeDates(req.body?.dates);
  if (!dates.length || dates.length > 100) {
    throw createHttpError(400, 'Please provide between one and 100 delivery dates.', {
      code: 'INVALID_DELIVERY_CALENDAR_DATES',
    });
  }

  const customerId = String(req.body?.customerId || req.body?.clientReferenceId || '').trim();
  const addressId = parseAddressId(req.body?.deliveryAddressId);
  let address = null;

  if (addressId !== null) {
    if (!customerId) {
      throw createHttpError(400, 'A customer is required for a delivery address lookup.', {
        code: 'DELIVERY_ADDRESS_CUSTOMER_REQUIRED',
      });
    }
    const addresses = await loadCustomerDeliveryAddresses(req.database, customerId);
    address = addresses.find((item) => Number(item?.id) === addressId) || null;
    if (!address) {
      throw createHttpError(400, 'Delivery address does not belong to the selected customer.', {
        code: 'DELIVERY_ADDRESS_NOT_FOUND',
      });
    }
  }

  const profile = address ? resolveHolidayProfile(address.countryCode, address.region) : null;
  let rows = [];
  let calendarAvailable = false;
  if (profile) {
    try {
      rows = await loadHolidayRows();
      calendarAvailable = true;
    } catch (error) {
      // Weekend checks remain useful, but a failed holiday lookup must not
      // create a false holiday warning or block order creation.
      logger.warn(`Delivery holiday lookup unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const effectiveProfile = profile && calendarAvailable ? profile : null;
  const data = checkDeliveryDates(dates, effectiveProfile, rows);

  sendEnvelope(res, {
    status: 200,
    data,
    meta: {
      scopeKnown: Boolean(effectiveProfile),
      calendarAvailable,
      showHint: Boolean(effectiveProfile),
      profile: effectiveProfile?.key || null,
      profileName: effectiveProfile?.name || null,
      suggestedDate: data.length ? getNextWorkingDate(data[0].date, effectiveProfile, rows) : null,
    },
    error: null,
  });
}));

module.exports = router;
