import React from 'react';
import { Alert, Box, Button, CircularProgress } from '@mui/material';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { getMandant } from '../utils/mandant.js';
import { navigateToReturn } from '../utils/navigation.js';
import { createPurchaseLineId } from '../utils/purchaseCart.js';
import { useI18n } from '../utils/i18n.jsx';
import { useFeatureAccess } from '../components/FeatureAccess.jsx';
import { PurchaseForOrder } from './OptionOrderPurchase.jsx';
import TempOrderForm from './TempOrderForm.jsx';

function progressKey(userId, mandant, offerId) {
  return `bms.offerPurchase.${userId}.${mandant}.${offerId}`;
}

function loadProgress(key, version) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (draft?.version === version) return draft;
  } catch {
    // The current route carries progress when browser storage is unavailable.
  }
  return { version, requestIds: {}, saved: {} };
}

function saveProgress(key, progress) {
  try { sessionStorage.setItem(key, JSON.stringify(progress)); } catch {
    // Keep the same request IDs in route state.
  }
}

export function OfferOrderStart() {
  const { offerSourceId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { userId } = useFeatureAccess();
  const mandant = getMandant();
  const [orderDraft, setOrderDraft] = React.useState(null);
  const [error, setError] = React.useState('');
  const offerPath = `/temp-offers/${encodeURIComponent(offerSourceId)}`;
  const returnTo = state?.returnTo;
  const completed = state?.offerPurchaseProgress;
  const key = progressKey(userId, mandant, offerSourceId);

  React.useEffect(() => {
    const controller = new AbortController();
    setOrderDraft(null);
    setError('');
    apiRequest(`${offerPath}/order-draft?preparePurchases=1`, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      const returned = completed?.scope === key ? completed : null;
      if (returned && returned.version !== data.version) {
        setError({ key: 'procurement_offer_changed' });
        return;
      }
      const progress = returned || loadProgress(key, data.version);
      const outstanding = data.positions.filter((line) => line.requiresPurchase && !progress.saved[line.offerPositionId]);
      if (outstanding.length) {
        const requestIds = { ...progress.requestIds };
        for (const line of outstanding) requestIds[line.offerPositionId] ||= createPurchaseLineId();
        const next = { ...progress, scope: key, requestIds };
        saveProgress(key, next);
        navigate(`${offerPath}/order-purchase`, { replace: true, state: {
          offerId: offerSourceId, mandant, returnTo, positions: outstanding, progress: next,
        } });
        return;
      }
      setOrderDraft({
        ...data,
        positions: data.positions.map((line) => ({
          ...line, savedPurchase: progress.saved[line.offerPositionId] || null,
        })),
      });
    }).catch((cause) => {
      if (!controller.signal.aborted) setError({ message: cause.message });
    });
    return () => controller.abort();
  }, [offerPath, offerSourceId, mandant, completed, key, returnTo, navigate]);

  if (orderDraft) return <TempOrderForm preparedOfferOrder={orderDraft} />;
  if (!error) return <CircularProgress size={24} />;
  return <Box sx={{ display: 'grid', gap: 1 }}>
    <Alert severity="error">{error.message || t(error.key || 'loading_error')}</Alert>
    <Button onClick={() => navigateToReturn(navigate, returnTo, offerPath)}>{t('back_label')}</Button>
  </Box>;
}

export function OfferOrderPurchase() {
  const { offerSourceId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { userId } = useFeatureAccess();
  const offerPath = `/temp-offers/${encodeURIComponent(offerSourceId)}`;
  const mandant = getMandant();
  const key = progressKey(userId, mandant, offerSourceId);
  if (state?.offerId !== offerSourceId || state.mandant !== mandant || !state.positions?.length || state.progress?.scope !== key) {
    return <Navigate to={offerPath} replace />;
  }
  const { positions, progress, returnTo } = state;
  const line = positions.find((position) => !progress.saved[position.offerPositionId]);
  if (!line) return <Navigate to={`${offerPath}/order/new`} replace state={{ returnTo, offerPurchaseProgress: progress }} />;
  const clientRequestId = progress.requestIds[line.offerPositionId];

  const onPurchaseSaved = (saved) => {
    const next = { ...progress, saved: { ...progress.saved, [line.offerPositionId]: saved } };
    saveProgress(key, next);
    navigate(`${offerPath}/order-purchase`, { replace: true, state: { ...state, progress: next } });
  };

  return <PurchaseForOrder key={clientRequestId} offerPosition={line}
    state={{ procurementOption: line, clientRequestId, returnTo }}
    onBack={() => navigateToReturn(navigate, returnTo, offerPath)} onPurchaseSaved={onPurchaseSaved} />;
}
