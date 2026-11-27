import React from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import { allocatePurchaseDeliveries, planPurchaseDeliveries, purchaseDeliveryAmounts, purchaseTruckLoadChoices } from '../utils/purchaseDeliveries.js';
import { purchaseFieldErrors } from '../utils/purchaseCart.js';
import { useI18n } from '../utils/i18n.jsx';

export default function PurchaseDeliverySplitDialog({ positions, initialLoadKg, onClose, onApply }) {
  const { t, lang } = useI18n();
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const formatKg = amount => `${amount.toLocaleString(locale, { maximumFractionDigits: 3 })} kg`;
  const [loadKg, setLoadKg] = React.useState(initialLoadKg);
  const [deliveries, setDeliveries] = React.useState(() => {
    const dates = new Set(positions.map(position => String(position.requestedDeliveryDate || '').slice(0, 10)));
    const notes = new Set(positions.map(position => position.availabilityNote || ''));
    return [{ id: 0, date: dates.size === 1 ? [...dates][0] : '', note: notes.size === 1 ? [...notes][0] : '' }];
  });
  const [attempted, setAttempted] = React.useState(false);
  const [tooLarge, setTooLarge] = React.useState(false);
  const nextId = React.useRef(1);
  const amounts = purchaseDeliveryAmounts(positions, deliveries);
  const planned = planPurchaseDeliveries(positions, deliveries, loadKg);
  const dates = purchaseFieldErrors({ positions: deliveries.map(delivery => ({ requestedDeliveryDate: delivery.date })) }).positions;
  const invalidDate = index => amounts[index] > 0 && dates[index].requestedDeliveryDate;
  const change = (id, fields) => {
    setTooLarge(false);
    setDeliveries(current => current.map(delivery => delivery.id === id ? { ...delivery, ...fields } : delivery));
  };
  const apply = () => {
    setAttempted(true);
    if (!planned || dates.some((_error, index) => invalidDate(index))) return;
    const result = allocatePurchaseDeliveries(planned);
    if (result) onApply(result, loadKg);
    else setTooLarge(true);
  };

  return <Dialog open onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t('purchase_delivery_split_title')}</DialogTitle>
    <DialogContent sx={{ display: 'grid', gap: 1.5, pt: '8px !important' }}>
      <TextField select fullWidth size="small" label={t('purchase_truck_load')} value={loadKg} onChange={event => {
        setLoadKg(Number(event.target.value)); setTooLarge(false);
      }}>
        {purchaseTruckLoadChoices.map(capacity => <MenuItem key={capacity} value={capacity}>{formatKg(capacity)}</MenuItem>)}
      </TextField>
      {deliveries.map((delivery, index) => {
        const amount = amounts[index];
        const count = planned?.[index].plan?.count ?? (Number.isFinite(amount) && amount > 0 ? Math.ceil(amount / (loadKg * 1000)) : 0);
        return <Box key={delivery.id} sx={{ display: 'grid', gap: 1, border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2">{t('purchase_delivery_number', { number: index + 1 })}</Typography>
            <FormControlLabel labelPlacement="start" sx={{ ml: 'auto', mr: 0 }}
              label={t('purchase_delivery_skip_truck_split')}
              control={<Checkbox size="small" checked={Boolean(delivery.skipTruckSplit)}
                onChange={event => change(delivery.id, { skipTruckSplit: event.target.checked })} />} />
          </Box>
          <TextField size="small" required={index > 0} label={t('purchase_quantity_kg')} type="number"
            value={index ? delivery.amount : Number.isFinite(amount) ? amount / 1000 : ''}
            error={attempted && (!Number.isFinite(amount) || (index > 0 ? amount <= 0 : amount < 0))}
            InputProps={{ readOnly: index === 0 }} inputProps={{ min: index ? 0.001 : 0, step: 0.001 }}
            onChange={event => change(delivery.id, { amount: event.target.value })} />
          {!delivery.skipTruckSplit && <Typography variant="caption">{t('purchase_truck_count', { count: count.toLocaleString(locale) })}</Typography>}
          <TextField size="small" required={amount > 0} label={t('purchase_delivery_date')} type="date" value={delivery.date}
            error={attempted && invalidDate(index)} InputLabelProps={{ shrink: true }}
            onChange={event => change(delivery.id, { date: event.target.value })} />
          <TextField size="small" label={t('purchase_availability_note')} value={delivery.note} inputProps={{ maxLength: 255 }}
            onChange={event => change(delivery.id, { note: event.target.value })} />
          {index > 0 && <Button color="error" size="small" sx={{ justifySelf: 'end' }} onClick={() => {
            setTooLarge(false); setDeliveries(current => current.filter(entry => entry.id !== delivery.id));
          }}>{t('purchase_remove_delivery')}</Button>}
        </Box>;
      })}
      <Button size="small" sx={{ justifySelf: 'start' }} onClick={() => {
        const id = nextId.current++;
        setDeliveries(current => [...current, { id, amount: '', date: '', note: '' }]);
        setTooLarge(false);
      }}>{t('purchase_add_delivery')}</Button>
      {attempted && !planned && <Alert severity="error">{t('purchase_delivery_split_invalid_amount')}</Alert>}
      {tooLarge && <Alert severity="error">{t('purchase_truck_split_too_large')}</Alert>}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>{t('purchase_cancel')}</Button>
      <Button variant="contained" onClick={apply}>{t('purchase_truck_split')}</Button>
    </DialogActions>
  </Dialog>;
}
