const { createHash } = require('node:crypto');
const { asyncHandler, createHttpError, sendEnvelope } = require('../utils');
const { requireMandant } = require('../middlewares/mandant.middleware');
const { resolveVlDatabase } = require('../vl-source');
const { loadCustomerOfferAudience, loadOfferContacts } = require('../options/customer-offers');
const { buildCustomerOfferSubmissions } = require('../options/offer-submission');
const { stockOfferMailEnabled, queueOptionOffers } = require('../db/option-offer-outbox');

module.exports = function registerProductOffers(router, loadProductDetail) {
  const path = '/products/:id/offer-customers';
  async function context(req, res, action = false) {
    const database = await resolveVlDatabase(req, req.query.vlMandantId);
    const readOnly = Number(database.firmaId) !== Number(req.database.firmaId);
    if (action && readOnly) throw createHttpError(403, 'Fremde VL-Mandanten sind nur lesbar.', { code: 'FOREIGN_VL_READ_ONLY' });
    if (action && typeof req.query.stockStorageId !== 'string') {
      throw createHttpError(400, 'Bitte die Lagerposition der VL angeben.');
    }
    const item = await loadProductDetail(req, database, { includeStockOfferCost: !readOnly });
    const stockPositionKey = item.beNumber
      ? createHash('sha256').update(JSON.stringify([item.beNumber.toUpperCase(), item.storageId.toUpperCase()])).digest('hex')
      : undefined;
    const loadAudience = () => loadCustomerOfferAudience(database, req.userIdentity, item, stockPositionKey, { group: !action });
    res.set('Cache-Control', 'private, no-store');
    return { item, readOnly: readOnly || !stockPositionKey, stockPositionKey, loadAudience };
  }

  router.get(path, requireMandant, asyncHandler(async (req, res) => {
    const { item, readOnly, loadAudience } = await context(req, res);
    const remainingKg = item.unit.trim().toLowerCase() === 'kg' ? item.availableAmount : 0;
    sendEnvelope(res, { data: {
      ...await loadAudience(), readOnly, remainingKg, pricePerTonne: item.stockCostPerTonne,
      sendEnabled: !readOnly && remainingKg > 0 && await stockOfferMailEnabled(),
    } });
  }));

  router.get(`${path}/contacts/:customerId`, requireMandant, asyncHandler(async (req, res) => {
    const { loadAudience } = await context(req, res, true);
    const { customers } = await loadAudience();
    const customer = customers.find(row => row.id === req.params.customerId);
    if (!customer) throw createHttpError(404, 'Kunde nicht gefunden.', { code: 'OPTION_OFFER_CUSTOMER_UNAVAILABLE' });
    const contacts = await loadOfferContacts(req.database, [customer.id]);
    sendEnvelope(res, { data: contacts.map(({ id, name, position, ranking, email }) => ({
      id, name, position, ranking, hasEmail: Boolean(email),
    })) });
  }));

  router.get(`${path}/pickup-locations`, requireMandant, asyncHandler(async (req, res) => {
    const { item } = await context(req, res, true);
    sendEnvelope(res, { data: item.warehouse ? [item.warehouse] : [] });
  }));

  router.post(`${path}/send`, requireMandant, asyncHandler(async (req, res) => {
    if (!await stockOfferMailEnabled()) {
      throw createHttpError(503, 'Der Versand von Artikelangeboten ist noch nicht freigegeben.', { code: 'OPTION_OFFER_SEND_DISABLED' });
    }
    const { item, stockPositionKey, readOnly, loadAudience } = await context(req, res, true);
    const remainingKg = item.unit.trim().toLowerCase() === 'kg' ? item.availableAmount : 0;
    if (readOnly || !(remainingKg > 0)) throw createHttpError(422, 'Für diese VL-Position steht keine Angebotsmenge zur Verfügung.');
    const submissions = await buildCustomerOfferSubmissions(req, {
      stockPositionKey, remainingKg, stockOrderPosition: item.beNumber, stockStorageId: item.storageId,
      pricePerTonne: item.stockCostPerTonne,
    }, loadAudience);
    await queueOptionOffers(req.database, submissions);
    sendEnvelope(res, { status: 202, data: { customers: submissions.map(item => item.customerId) } });
  }));
};
