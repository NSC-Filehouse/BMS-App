import React from 'react';
import { Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { createPurchaseLineId } from '../utils/purchaseCart.js';
import OptionPurchaseDialog from './OptionPurchaseDialog.jsx';
import PurchaseOrderEditor from './PurchaseOrderEditor.jsx';

const supplierName = (row) => String(row?.kd_Name1 || row?.kd_Name2 || row?.kd_KdNR || '').trim();

export default function ProcurementDialog({ line, onClose, onConfirm }) {
  const { t, lang } = useI18n();
  const [stock, setStock] = React.useState(null);
  const [article, setArticle] = React.useState(null);
  const [supplier, setSupplier] = React.useState(null);
  const [supplierQuery, setSupplierQuery] = React.useState('');
  const [suppliers, setSuppliers] = React.useState([]);
  const [stockKey, setStockKey] = React.useState(line.procurement?.stock?.key || '');
  const [error, setError] = React.useState('');
  const [draft, setDraft] = React.useState(line.procurement
    ? { ...line.procurement.header, positions: [line.procurement.position] }
    : null);
  const updatePurchaseAmount = React.useCallback((order) => setPurchaseAmount(Number(order.positions[0]?.amount)), []);
  const [purchaseAmount, setPurchaseAmount] = React.useState(Number(line.procurement?.position?.amount ?? line.amountInKg));
  const total = Number(line.amountInKg);
  const option = Boolean(line.optionId && line.optionPositionId);

  React.useEffect(() => {
    const controller = new AbortController();
    const get = (path) => apiRequest(path, { signal: controller.signal });
    const requests = [get('/temp-orders/procurement/stock?articleIndex=' + encodeURIComponent(line.articleIndex))];
    if (option && !line.procurement) {
      requests.push(get('/options/' + line.optionId + '/positions/' + line.optionPositionId
        + '/purchase/articles?q=' + encodeURIComponent(line.articleIndex)));
    }
    Promise.all(requests).then(([stockResponse, articles]) => {
      if (controller.signal.aborted) return;
      setStock(stockResponse.data || []);
      if (articles) {
        const match = (articles.data || []).find((row) => row.articleIndex === line.articleIndex);
        if (!match) setError(t('procurement_option_article_unavailable'));
        else setArticle(match);
      }
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [line.articleIndex, line.optionId, line.optionPositionId, line.procurement, option, t]);

  React.useEffect(() => {
    if (option || draft || supplierQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ supplierOnly: '1', includeInactive: '1', q: supplierQuery.trim(), pageSize: '15' });
      apiRequest('/customers?' + qs, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setSuppliers(result.data || []); })
        .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [draft, option, supplierQuery]);

  const format = (value) => Number(value).toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE');
  const lots = (stock || []).filter((lot) => lot.available >= total - purchaseAmount);
  const chosen = lots.find((lot) => lot.key === stockKey) || (lots.length === 1 ? lots[0] : null);
  const hintLot = (purchaseAmount < total ? chosen : null)
    || stock?.reduce((largest, lot) => !largest || lot.available > largest.available ? lot : largest, null);
  const hint = hintLot ? t('procurement_vl_hint', { amount: format(hintLot.available), be: hintLot.beNumber }) : '';

  const prepare = ({ header = {}, position }) => {
    setError('');
    setPurchaseAmount(Number(position.amount));
    setDraft({
      ...header, supplierId: position.supplierId, supplierName: position.supplierName,
      positions: [{
        ...position, requestedDeliveryDate: position.requestedDeliveryDate || line.deliveryDate,
        lineId: createPurchaseLineId(), amountTouched: true,
      }],
    });
  };
  const submit = ({ positions, ...header }) => {
    const [position] = positions;
    const amount = Number(position.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > total
      || (amount < total && (!chosen || chosen.available < total - amount))
      || (option && position.remainingKg != null && amount > position.remainingKg)) {
      setError(t('procurement_quantity_invalid'));
      return;
    }
    onConfirm({ header, position, stock: amount < total ? chosen : null });
  };

  if (option && article && stock && !draft && !error) {
    return <OptionPurchaseDialog
      offer={{ id: line.optionId }} position={{ id: line.optionPositionId, articleName: line.article }}
      supplier={line.optionSupplier} supplierEditable={!line.optionSupplier}
      article={article} onClose={onClose} onPrepared={prepare} defaultAmount={total} stockHint={hint}
    />;
  }

  return <Dialog open onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t('procurement_title')}</DialogTitle>
    <DialogContent sx={{ display: 'grid', gap: 1, pt: '8px !important' }}>
      {error && <Alert severity="error">{error}</Alert>}
      {!stock && !error && <CircularProgress size={20} />}
      {stock && !option && !draft && <Autocomplete
        options={suppliers} value={supplier} onChange={(_event, value) => setSupplier(value)}
        onInputChange={(_event, value, reason) => { if (reason === 'input') setSupplierQuery(value); }}
        filterOptions={(options) => options} getOptionLabel={supplierName}
        isOptionEqualToValue={(a, b) => a.kd_KdNR === b.kd_KdNR}
        renderInput={(params) => <TextField {...params} size="small" label={t('procurement_supplier')} />}
      />}
      {stock && draft && <>
        {purchaseAmount < total && lots.length > 1 && <TextField
          select size="small" label={t('offer_order_select_stock')}
          value={chosen?.key || ''} onChange={(event) => setStockKey(event.target.value)}
        >
          {lots.map((lot) => <MenuItem key={lot.key} value={lot.key}>
            {lot.beNumber} · {lot.warehouse || lot.warehouseId} · {format(lot.available)} kg
          </MenuItem>)}
        </TextField>}
        <Box><PurchaseOrderEditor
          initialOrder={draft} isNew linkedSetup stockHint={hint}
          onChange={updatePurchaseAmount}
          onContinue={onClose} onSave={submit}
        /></Box>
      </>}
    </DialogContent>
    {!draft && <DialogActions>
      <Button onClick={onClose}>{t('back_label')}</Button>
      {!option && <Button variant="contained" disabled={!supplier} onClick={() => prepare({ position: {
        supplierId: supplier.kd_KdNR, supplierName: supplierName(supplier),
        articleIndex: line.articleIndex, article: line.article, amount: total, unit: 'kg',
        purchasePrice: '', requestedDeliveryDate: line.deliveryDate,
      } })}>{t('procurement_continue')}</Button>}
    </DialogActions>}
  </Dialog>;
}
