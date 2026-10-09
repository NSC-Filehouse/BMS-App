// zaS_ID values checked against the customer's payment-term translations.
// Includes full/partial advance payment and payment on presentation; net terms
// with an early-payment discount and sight L/C with a document-presentation
// period are deliberately excluded.
const ADVANCE_OR_IMMEDIATE_PAYMENT_TEXT_IDS = new Set([
  40,
  57, 58, 59, 60, 61, 62, 63, 64, 65,
  77,
  89,
  95,
  98,
  103,
  107,
  120,
  127,
  129,
  151,
  154,
  162,
  166,
  172,
]);

function isAdvanceOrImmediatePaymentTextId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && ADVANCE_OR_IMMEDIATE_PAYMENT_TEXT_IDS.has(id);
}

module.exports = {
  ADVANCE_OR_IMMEDIATE_PAYMENT_TEXT_IDS,
  isAdvanceOrImmediatePaymentTextId,
};
