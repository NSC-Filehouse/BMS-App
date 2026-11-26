import React from 'react';
import { Alert, Autocomplete, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import CompactAddressOption from './CompactAddressOption.jsx';
import { loadingLocationParts } from '../utils/loadingLocationDisplay.js';

const choiceKey = choice => JSON.stringify([choice.warehouseId, String(choice.addressCustomerId), String(choice.addressId)]);

export default function PurchaseOrderDeliveryFields({ order, warehouses, update, disabled, attempted }) {
  const { lang, t } = useI18n();
  const en = lang === 'en';
  const pickup = /^(FCA|EXW)\b/i.test(order.deliveryTermText || '');
  const savedWarehouse = warehouses.find(item => item.id === order.warehouseId);
  const [requestedCustomerMode, setCustomerMode] = React.useState(null);
  const customerMode = requestedCustomerMode ?? (!pickup && Boolean(order.addressId && savedWarehouse?.isDirect));
  const [customerQuery, setCustomerQuery] = React.useState('');
  const [customers, setCustomers] = React.useState([]);
  const [customer, setCustomer] = React.useState(order.addressCustomerId ? {
    id: order.addressCustomerId, name: order.addressCustomerName || loadingLocationParts(order.loadingLocationText).primary,
  } : null);
  const [choices, setChoices] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [canDeliverToCustomer, setCanDeliverToCustomer] = React.useState(false);
  const { supplierId, deliveryTermId, warehouseId } = order;
  const deliveryCustomerId = !pickup && customerMode ? customer?.id || '' : '';

  React.useEffect(() => {
    if (!customerMode || customerQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ q: customerQuery.trim(), includeInactive: '1', pageSize: '15' });
      apiRequest('/customers?' + query, { signal: controller.signal }).then(({ data }) => {
        if (!controller.signal.aborted) setCustomers((data || []).map(row => ({
          id: String(row.kd_KdNR), name: [row.kd_Name1, row.kd_Name2, row.kd_Ort].filter(Boolean).join(' · '),
        })));
      }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [customerMode, customerQuery]);

  React.useEffect(() => {
    setChoices([]);
    setError('');
    setLoading(false);
    if (!supplierId || !deliveryTermId || !warehouses.length || (!pickup && customerMode && !deliveryCustomerId)) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ supplierId, deliveryTermId, combined: '1' });
    if (pickup && warehouseId) query.set('selectedWarehouseId', warehouseId);
    if (deliveryCustomerId) query.set('addressCustomerId', deliveryCustomerId);
    setLoading(true);
    apiRequest('/purchase-order-addresses?' + query, { signal: controller.signal }).then(({ data, meta }) => {
      if (controller.signal.aborted) return;
      const entries = data || [];
      setChoices(entries);
      setCanDeliverToCustomer(Boolean(meta?.canDeliverToCustomer));
      update(previous => {
        const selected = entries.find(item => choiceKey(item) === choiceKey(previous))
          || (entries.length === 1 ? entries[0] : null);
        return { ...previous, warehouseId: selected?.warehouseId || '',
          addressCustomerId: selected?.addressCustomerId || '', addressId: selected?.addressId || '',
          addressCustomerName: selected?.name1 || '',
          loadingLocationText: selected?.text || previous.loadingLocationText || '' };
      });
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setError(cause.message);
        update(previous => ({ ...previous, addressId: '' }));
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [supplierId, deliveryTermId, pickup, warehouseId, deliveryCustomerId, customerMode, warehouses, update]);

  const selectedKey = order.addressId ? choiceKey(order) : '';
  const selected = choices.find(item => choiceKey(item) === selectedKey);
  const parts = choice => {
    const address = loadingLocationParts(choice.text);
    return { primary: choice.warehouseName ? choice.warehouseName + ' · ' + address.primary : address.primary,
      secondary: address.secondary };
  };
  const changeCustomerMode = () => {
    setCustomerMode(!customerMode);
    setCustomer(null);
    setChoices([]);
    update({ warehouseId: '', addressId: '', addressCustomerId: '', loadingLocationText: '' });
  };

  return <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
    {!pickup && customerMode && <Autocomplete options={customers} value={customer}
      disabled={disabled} getOptionLabel={item => item.name} filterOptions={items => items}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onInputChange={(_event, value, reason) => {
        if (reason === 'input') { setCustomerQuery(value); setCustomers([]); }
      }}
      onChange={(_event, value) => {
        setCustomer(value);
        update({ warehouseId: '', addressId: '', addressCustomerId: '', loadingLocationText: '' });
      }}
      renderInput={params => <TextField {...params} size="small" required label={en ? 'Delivery customer' : 'Lieferkunde'} />} />}
    <TextField select required size="small" label={t('purchase_loading_location')} value={selected ? selectedKey : ''}
      disabled={disabled || !deliveryTermId || loading || (!pickup && customerMode && !customer)}
      error={attempted && (!selected || !order.addressId)}
      SelectProps={{ renderValue: () => selected && <CompactAddressOption {...parts(selected)} />,
        classes: { select: 'address-select' }, MenuProps: { MenuListProps: { className: 'address-select-list' },
          PaperProps: { sx: { maxHeight: 320 } } } }}
      sx={{ minWidth: 0, '& .MuiSelect-select': { minWidth: 0, overflow: 'hidden' } }}
      onChange={event => {
        const choice = choices.find(item => choiceKey(item) === event.target.value);
        update({ warehouseId: choice?.warehouseId || '', addressCustomerId: choice?.addressCustomerId || '',
          addressId: choice?.addressId || '', addressCustomerName: choice?.name1 || '', loadingLocationText: choice?.text || '' });
      }}>
      <MenuItem value="" disabled>{en ? 'Select address' : 'Adresse auswählen'}</MenuItem>
      {choices.map(choice => <MenuItem key={choiceKey(choice)} value={choiceKey(choice)} divider sx={{ py: 1, minWidth: 0 }}>
        <CompactAddressOption {...parts(choice)} />
      </MenuItem>)}
    </TextField>
    {!pickup && canDeliverToCustomer && <Button size="small" disabled={disabled || loading}
      sx={{ justifySelf: 'start', textTransform: 'none' }} onClick={changeCustomerMode}>
      {customerMode ? (en ? 'Choose warehouse address' : 'Lageradresse wählen')
        : (en ? 'Deliver directly to customer' : 'Direkt an Kunden liefern')}
    </Button>}
    {error && <Alert severity="error">{error}</Alert>}
    {!loading && !error && deliveryTermId && !choices.length && (!customerMode || customer)
      && <Alert severity="info">{en ? 'Create the address in the master data first.' : 'Bitte die Adresse zuerst im Stamm anlegen.'}</Alert>}
    {!selected && order.loadingLocationText && <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
      {order.loadingLocationText}
    </Typography>}
  </Box>;
}
