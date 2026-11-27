import React from 'react';
import { Alert, Autocomplete, Box, Button, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import CompactAddressOption from './CompactAddressOption.jsx';
import LoadingLocationDialog from './LoadingLocationDialog.jsx';
import { loadingLocationParts } from '../utils/loadingLocationDisplay.js';
import { isManualPurchaseLocation } from '../utils/purchaseCart.js';

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
  const [locationDialogOpen, setLocationDialogOpen] = React.useState(false);
  const { supplierId, deliveryTermId, warehouseId } = order;
  const deliveryCustomerId = !pickup && customerMode ? customer?.id || '' : '';
  const manual = pickup && isManualPurchaseLocation(order);
  const sourceLocation = order.optionLoadingLocationText || '';
  const pickupSuggestion = pickup && !manual ? order.loadingLocationText || sourceLocation : '';
  const directWarehouses = warehouses.filter(item => item.isDirect);
  const pickupWarehouse = savedWarehouse || (directWarehouses.length === 1 ? directWarehouses[0] : null)
    || (warehouses.length === 1 ? warehouses[0] : null);

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
        if (pickup && isManualPurchaseLocation(previous)) {
          const warehouse = warehouses.find(item => item.id === previous.warehouseId);
          return { ...previous, warehouseId: warehouse?.id || meta?.pickupWarehouseId || (warehouses.length === 1 ? warehouses[0].id : '') };
        }
        const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const suggested = pickup && !previous.addressId
          ? normalize(previous.optionLoadingLocationText || previous.loadingLocationText) : '';
        const matches = suggested ? entries.filter(item => normalize(item.text) === suggested) : [];
        const selected = entries.find(item => choiceKey(item) === choiceKey(previous))
          || (matches.length === 1 ? matches[0] : null)
          || (!suggested && entries.length === 1 && !previous.addressId ? entries[0] : null);
        if (!selected) return previous;
        return { ...previous, warehouseId: selected.warehouseId,
          addressCustomerId: selected.addressCustomerId, addressId: selected.addressId,
          addressCustomerName: selected.name1 || '', loadingLocationText: selected.text,
          loadingLocationCountryCode: selected.countryCode || '',
          loadingLocationSource: 'master', loadingLocationChanged: false };
      });
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setError(cause.message);
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
    update({ warehouseId: '', addressId: '', addressCustomerId: '', loadingLocationText: '', loadingLocationSource: '', loadingLocationChanged: false, loadingLocationCity: '', loadingLocationCountryCode: '' });
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
        update({ warehouseId: '', addressId: '', addressCustomerId: '', loadingLocationText: '', loadingLocationCountryCode: '' });
      }}
      renderInput={params => <TextField {...params} size="small" required label={en ? 'Delivery customer' : 'Lieferkunde'} />} />}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
    <TextField select required size="small" label={t('purchase_loading_location')} value={manual ? 'manual' : selected ? selectedKey : pickupSuggestion ? 'suggested' : ''}
      disabled={disabled || !deliveryTermId || loading || (!pickup && customerMode && !customer)}
      error={attempted && !manual && (!selected || !order.addressId)}
      SelectProps={{ renderValue: () => manual ? <CompactAddressOption {...loadingLocationParts(order.loadingLocationText)} />
        : selected ? <CompactAddressOption {...parts(selected)} />
          : pickupSuggestion && <CompactAddressOption {...loadingLocationParts(pickupSuggestion)} />,
        classes: { select: 'address-select' }, MenuProps: { MenuListProps: { className: 'address-select-list' },
          PaperProps: { sx: { maxHeight: 320 } } } }}
      sx={{ flex: 1, minWidth: 0, '& .MuiSelect-select': { minWidth: 0, overflow: 'hidden' } }}
      onChange={event => {
        if (event.target.value === 'manual' || event.target.value === 'suggested') return;
        const choice = choices.find(item => choiceKey(item) === event.target.value);
        update({ warehouseId: choice?.warehouseId || '', addressCustomerId: choice?.addressCustomerId || '',
          addressId: choice?.addressId || '', addressCustomerName: choice?.name1 || '', loadingLocationText: choice?.text || '',
          loadingLocationSource: 'master', loadingLocationChanged: false, loadingLocationCity: '',
          loadingLocationCountryCode: choice?.countryCode || '' });
      }}>
      <MenuItem value="" disabled>{en ? 'Select address' : 'Adresse auswählen'}</MenuItem>
      {manual && <MenuItem value="manual"><CompactAddressOption {...loadingLocationParts(order.loadingLocationText)} /></MenuItem>}
      {!selected && pickupSuggestion && <MenuItem value="suggested" disabled><CompactAddressOption {...loadingLocationParts(pickupSuggestion)} /></MenuItem>}
      {choices.map(choice => <MenuItem key={choiceKey(choice)} value={choiceKey(choice)} divider sx={{ py: 1, minWidth: 0 }}>
        <CompactAddressOption {...parts(choice)} />
      </MenuItem>)}
    </TextField>
    {pickup && <IconButton color="primary" size="small" disabled={disabled || !deliveryTermId}
      aria-label={t('purchase_new_loading_location')} onClick={() => setLocationDialogOpen(true)}><AddCircleOutlineIcon fontSize="small" /></IconButton>}
    </Box>
    {manual && warehouses.length > 1 && directWarehouses.length !== 1 && <TextField select required size="small" label={t('product_warehouse')}
      disabled={disabled || loading} error={attempted && !warehouseId} value={savedWarehouse?.id || ''}
      onChange={event => update({ warehouseId: event.target.value })}>
      {warehouses.map(warehouse => <MenuItem key={warehouse.id} value={warehouse.id}>{warehouse.label}</MenuItem>)}
    </TextField>}
    {locationDialogOpen && pickup && <LoadingLocationDialog onClose={() => setLocationDialogOpen(false)} onConfirm={(text, city, countryCode) => {
      update({ warehouseId: pickupWarehouse?.id || '', addressCustomerId: '', addressId: '', addressCustomerName: '',
        loadingLocationSource: 'manual', loadingLocationChanged: true, loadingLocationText: text, loadingLocationCity: city,
        loadingLocationCountryCode: countryCode });
      setLocationDialogOpen(false);
    }} />}
    {!pickup && canDeliverToCustomer && <Button size="small" disabled={disabled || loading}
      sx={{ justifySelf: 'start', textTransform: 'none' }} onClick={changeCustomerMode}>
      {customerMode ? (en ? 'Choose warehouse address' : 'Lageradresse wählen')
        : (en ? 'Deliver directly to customer' : 'Direkt an Kunden liefern')}
    </Button>}
    {error && <Alert severity="error">{error}</Alert>}
    {!pickup && !loading && !error && deliveryTermId && !choices.length && (!customerMode || customer)
      && <Alert severity="info">{en ? 'Create the address in the master data first.' : 'Bitte die Adresse zuerst im Stamm anlegen.'}</Alert>}
    {!pickup && sourceLocation && <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
      {t('purchase_option_loading_location')}: {sourceLocation}
    </Typography>}
  </Box>;
}
