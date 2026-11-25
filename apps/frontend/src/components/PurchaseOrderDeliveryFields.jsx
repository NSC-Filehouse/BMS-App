import React from 'react';
import { Alert, Autocomplete, MenuItem, TextField } from '@mui/material';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

export default function PurchaseOrderDeliveryFields({ order, warehouses, update, disabled, attempted }) {
  const { lang } = useI18n();
  const en = lang === 'en';
  const warehouse = warehouses.find(item => item.id === order.warehouseId);
  const pickup = /^(FCA|EXW)\b/i.test(order.deliveryTermText || '');
  const direct = warehouse?.isDirect && !pickup;
  const customerId = pickup ? order.supplierId : order.addressCustomerId || warehouse?.defaultOwnerId || '';
  const { supplierId, warehouseId, deliveryTermId } = order;
  const [addresses, setAddresses] = React.useState([]);
  const [addressError, setAddressError] = React.useState('');
  const [addressLoading, setAddressLoading] = React.useState(false);
  const [customerQuery, setCustomerQuery] = React.useState('');
  const [customers, setCustomers] = React.useState([]);
  const [customerError, setCustomerError] = React.useState('');

  React.useEffect(() => {
    if (!direct || customerQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ q: customerQuery.trim(), includeInactive: '1', pageSize: '15' });
      apiRequest('/customers?' + query, { signal: controller.signal }).then(({ data }) => {
        if (!controller.signal.aborted) setCustomers((data || []).map(row => ({
          id: String(row.kd_KdNR), name: [row.kd_Name1, row.kd_Name2, row.kd_Ort].filter(Boolean).join(' · '),
        })));
      }).catch(error => { if (!controller.signal.aborted) setCustomerError(error.message); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [direct, customerQuery]);

  React.useEffect(() => {
    if (!warehouseId || !deliveryTermId || !customerId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ supplierId, warehouseId, deliveryTermId, addressCustomerId: customerId });
    setAddressLoading(true);
    setAddressError('');
    setAddresses([]);
    apiRequest('/purchase-order-addresses?' + query, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      const entries = (data || []).filter(item => item.text);
      setAddresses(entries);
      update(previous => {
        const saved = previous.addressCustomerId === customerId && entries.find(item => item.id === String(previous.addressId));
        const selected = saved || (entries.length === 1 ? entries[0] : null);
        return { ...previous, addressCustomerId: customerId, addressId: selected?.id || '',
          addressCustomerName: previous.addressCustomerName || selected?.name1 || '',
          loadingLocationText: selected?.text || previous.loadingLocationText || '' };
      });
    }).catch(error => {
      if (!controller.signal.aborted) {
        setAddressError(error.message);
        update(previous => ({ ...previous, addressId: '' }));
      }
    }).finally(() => { if (!controller.signal.aborted) setAddressLoading(false); });
    return () => controller.abort();
  }, [supplierId, warehouseId, deliveryTermId, customerId, update]);

  const chooseOwner = owner => update({ addressCustomerId: owner?.id || '', addressCustomerName: owner?.name || '', addressId: '', loadingLocationText: '' });
  const chosenCustomer = customerId ? (customers.find(item => item.id === customerId)
    || { id: customerId, name: order.addressCustomerName || '' }) : null;
  const ownerLabel = en ? 'Address belongs to' : 'Adressinhaber';
  const addressLabel = pickup ? (en ? 'Pickup address' : 'Abholadresse') : (en ? 'Delivery address' : 'Lieferadresse');
  const addressContext = Boolean(warehouse && deliveryTermId && customerId);

  return <>
    <TextField select required size="small" label={en ? 'Warehouse' : 'Lager'} value={warehouse?.id || ''}
      disabled={disabled} error={attempted && !warehouse} onChange={event => {
        const next = warehouses.find(item => item.id === event.target.value);
        setAddresses([]);
        update({ warehouseId: next?.id || '', addressCustomerId: pickup ? supplierId : next?.defaultOwnerId || '',
          addressCustomerName: '', addressId: '', loadingLocationText: '' });
      }}>
      <MenuItem value="" disabled>{en ? 'Select warehouse' : 'Lager auswählen'}</MenuItem>
      {warehouses.map(item => <MenuItem key={item.id} value={item.id}>{item.label || (item.isDirect ? (en ? 'Direct shipment' : 'Strecke') : (en ? 'Warehouse' : 'Lager'))}</MenuItem>)}
    </TextField>
    {warehouse && !pickup && !direct && <TextField select required size="small" label={ownerLabel}
      disabled={disabled || !deliveryTermId} value={customerId} error={attempted && !customerId}
      onChange={event => chooseOwner(warehouse.owners.find(item => item.id === event.target.value))}>
      <MenuItem value="" disabled>{en ? 'Select address owner' : 'Adressinhaber auswählen'}</MenuItem>
      {warehouse.owners.map(owner => <MenuItem key={owner.id} value={owner.id}>{owner.name}</MenuItem>)}
    </TextField>}
    {direct && <Autocomplete options={customers} value={chosenCustomer} disabled={disabled || !deliveryTermId}
      getOptionLabel={item => item.name}
      filterOptions={items => items} isOptionEqualToValue={(a, b) => a.id === b.id}
      onInputChange={(_event, value, reason) => {
        if (reason !== 'input') return;
        setCustomerError('');
        if (value.trim().length < 2) setCustomers([]);
        setCustomerQuery(value);
      }}
      onChange={(_event, owner) => chooseOwner(owner)}
      renderInput={params => <TextField {...params} required size="small" label={ownerLabel} error={Boolean(customerError) || attempted && !customerId}
        helperText={customerError || (en ? 'Search for the delivery customer' : 'Lieferkunden suchen')} />} />}
    <TextField select required size="small" label={addressLabel} value={addresses.some(item => item.id === String(order.addressId)) ? String(order.addressId) : ''}
      disabled={disabled || !addressContext || addressLoading} error={attempted && !order.addressId}
      onChange={event => {
        const selected = addresses.find(item => item.id === event.target.value);
        update({ addressCustomerId: customerId, addressId: selected?.id || '', loadingLocationText: selected?.text || '' });
      }}>
      <MenuItem value="" disabled>{en ? 'Select address' : 'Adresse auswählen'}</MenuItem>
      {addresses.map(item => <MenuItem key={item.id} value={item.id} sx={{ whiteSpace: 'normal' }}>{item.text}</MenuItem>)}
    </TextField>
    {addressContext && (addressError || (!addressLoading && !addresses.length)) && <Alert severity="warning">
      {addressError || (en ? 'Create a delivery address in the master data first.' : 'Bitte zuerst eine Lieferadresse im Stamm anlegen.')}
    </Alert>}
    {!order.addressId && order.loadingLocationText && <Alert severity="info">
      {en ? 'Previous loading location' : 'Bisheriger Ladeort'} · {order.loadingLocationText}
    </Alert>}
  </>;
}
