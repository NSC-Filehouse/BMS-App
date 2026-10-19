// Commodity option prices above this threshold need source/unit clarification.
// This is a review threshold, never a reason to guess a different unit or value.
const MAX_UNREVIEWED_EUR_PER_TONNE = 10000;

function optionPriceNeedsReview(pricePerTonne) {
  return pricePerTonne != null && (!Number.isFinite(Number(pricePerTonne))
    || Number(pricePerTonne) < 0 || Number(pricePerTonne) > MAX_UNREVIEWED_EUR_PER_TONNE);
}

function optionPriceWarning() {
  return 'Preisprüfung: Preis und Preiseinheit ergeben einen unplausiblen Tonnenpreis. '
    + 'Rohpreis und Originaleinheit sind erhalten; Preisbezug muss bestätigt werden. Keine automatische Umdeutung in EUR/t.';
}

module.exports = { MAX_UNREVIEWED_EUR_PER_TONNE, optionPriceNeedsReview, optionPriceWarning };
