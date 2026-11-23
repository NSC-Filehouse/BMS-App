import React from 'react';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import OptionOfferCustomers from './OptionOfferCustomers.jsx';

export default function ProductOfferCustomers({ item, query, readOnly }) {
  const { t } = useI18n();
  const endpoint = `/products/${encodeURIComponent(item.id)}/offer-customers`;
  const [audience, setAudience] = React.useState(null);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    apiRequest(endpoint + query, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setAudience(response.data); })
      .catch(error => {
        if (!controller.signal.aborted) setAudience({ error: error.message || t('loading_error') });
      });
    return () => controller.abort();
  }, [endpoint, query, revision, t]);

  React.useEffect(() => {
    if (!audience?.customers?.some(customer => customer.queued)) return undefined;
    const timer = window.setTimeout(() => setRevision(value => value + 1), 15000);
    return () => window.clearTimeout(timer);
  }, [audience]);

  function offersQueued(ids) {
    const queued = new Set(ids);
    setAudience(previous => ({
      ...previous,
      customers: previous.customers.map(customer => queued.has(customer.id) ? { ...customer, queued: true } : customer),
    }));
  }

  return <OptionOfferCustomers stock endpoint={endpoint} query={query} customers={audience?.customers ?? []}
    salesFilter={audience?.salesFilter} position={{ remainingKg: audience?.remainingKg, pricePerTonne: audience?.pricePerTonne }}
    loadingLocation={item.warehouse} readOnly={readOnly || audience?.readOnly} sendEnabled={audience?.sendEnabled}
    loading={!audience} error={audience?.error} onQueued={offersQueued} />;
}
