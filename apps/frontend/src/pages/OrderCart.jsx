import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CallSplitOutlinedIcon from '@mui/icons-material/CallSplitOutlined';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { getMandant } from '../utils/mandant.js';
import { findForeignMandantName } from '../utils/mandantPrefix.js';
import {
  getOrderCartItems,
  removeOrderCartItem,
  splitOrderCartItem,
  updateOrderCartQuantity,
  updateOrderCartDeliveryDate,
  updateOrderCartSalePrice,
  updateOrderCartArticle,
  updateOrderCartItem,
} from '../utils/orderCart.js';
import { calculatePositionSplit } from '../utils/positionSplit.js';
import { getSelectedCustomer } from '../utils/customerSelection.js';
import CustomerRequiredDialog from '../components/CustomerRequiredDialog.jsx';
import WpzCommentField from '../components/WpzCommentField.jsx';
import SaleMarginHint from '../components/SaleMarginHint.jsx';
import DeliveryDateHint from '../components/DeliveryDateHint.jsx';
import { normalizeWpzFields } from '../utils/wpz.js';
import { getWeekendStatus } from '../utils/deliveryDate.js';

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function getCartLineId(item) {
  return String(item?.lineId || item?.id || '');
}

export default function OrderCart() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [items, setItems] = React.useState(() => getOrderCartItems());
  const [error, setError] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState({});
  const [customerRequiredOpen, setCustomerRequiredOpen] = React.useState(false);
  const [pendingSourceItems, setPendingSourceItems] = React.useState(null);
  const [mandants, setMandants] = React.useState([]);
  const [editingArticleId, setEditingArticleId] = React.useState('');
  const [editingArticleValue, setEditingArticleValue] = React.useState('');
  const [splitLineId, setSplitLineId] = React.useState('');
  const [splitKeptQuantity, setSplitKeptQuantity] = React.useState('');
  const [splitError, setSplitError] = React.useState('');
  const activeMandant = getMandant();
  const splitItem = items.find((item) => getCartLineId(item) === splitLineId) || null;
  const splitPreview = calculatePositionSplit(splitItem?.quantityKg, splitKeptQuantity);

  React.useEffect(() => {
    let alive = true;
    apiRequest('/mandants')
      .then((response) => {
        if (alive) setMandants(Array.isArray(response?.data) ? response.data : []);
      })
      .catch(() => {
        if (alive) setMandants([]);
      });
    return () => { alive = false; };
  }, []);

  const chooseCustomer = React.useCallback(() => {
    setCustomerRequiredOpen(false);
    if (Array.isArray(pendingSourceItems) && pendingSourceItems.length > 0) {
      navigate('/customers', {
        state: {
          afterSelect: {
            to: '/temp-orders/new',
            state: { sourceItems: pendingSourceItems },
          },
        },
      });
      return;
    }
    navigate('/customers', {
      state: {
        afterSelect: {
          to: '/order-cart',
          state: location.state || null,
        },
      },
    });
  }, [location.state, navigate, pendingSourceItems]);

  const onQtyChange = (id, value) => {
    setItems(updateOrderCartQuantity(id, value));
  };

  const onSalePriceChange = (id, value) => {
    setItems(updateOrderCartSalePrice(id, value));
  };

  const onDeliveryDateChange = (id, value) => {
    setItems(updateOrderCartDeliveryDate(id, value));
  };

  const beginArticleEdit = React.useCallback((row, event) => {
    event?.stopPropagation();
    setEditingArticleId(getCartLineId(row));
    setEditingArticleValue(String(row?.article || '').trim());
  }, []);

  const cancelArticleEdit = React.useCallback((event) => {
    event?.stopPropagation();
    setEditingArticleId('');
    setEditingArticleValue('');
  }, []);

  const saveArticleEdit = React.useCallback((row, event) => {
    event?.stopPropagation();
    const nextArticle = String(editingArticleValue || '').trim();
    if (!nextArticle) {
      setError(t('validation_article_name_required'));
      return;
    }
    setItems(updateOrderCartArticle(getCartLineId(row), nextArticle));
    setError('');
    setEditingArticleId('');
    setEditingArticleValue('');
  }, [editingArticleValue, t]);

  const openSplitDialog = React.useCallback((row) => {
    setSplitLineId(getCartLineId(row));
    setSplitKeptQuantity('');
    setSplitError('');
  }, []);

  const closeSplitDialog = React.useCallback(() => {
    setSplitLineId('');
    setSplitKeptQuantity('');
    setSplitError('');
  }, []);

  const confirmSplit = React.useCallback(() => {
    const split = calculatePositionSplit(splitItem?.quantityKg, splitKeptQuantity);
    if (!split.ok) {
      setSplitError(t('position_split_minimum'));
      return;
    }
    setItems(splitOrderCartItem(splitLineId, split.kept));
    closeSplitDialog();
  }, [closeSplitDialog, splitItem, splitKeptQuantity, splitLineId, t]);

  const validate = () => {
    const messages = [];
    const nextFieldErrors = {};
    const pushFieldError = (rowId, field) => {
      const key = String(rowId || '');
      if (!nextFieldErrors[key]) nextFieldErrors[key] = {};
      nextFieldErrors[key][field] = true;
    };
    for (const x of items) {
      const foreignMandant = findForeignMandantName(x.beNumber, mandants, activeMandant);
      if (foreignMandant) {
        messages.push(t('article_from_mandant_readonly', { name: foreignMandant }));
      }
      const qty = Number(x.quantityKg);
      if (!Number.isFinite(qty) || qty <= 0) {
        messages.push(t('validation_cart_quantity_positive'));
        pushFieldError(getCartLineId(x), 'quantityKg');
        continue;
      }
      const hasAvailable = x.availableAmount !== null && x.availableAmount !== undefined && x.availableAmount !== '';
      const available = hasAvailable ? Number(x.availableAmount) : Number.NaN;
      if (Number.isFinite(available) && qty > available) {
        messages.push(t('validation_cart_quantity_not_above_available'));
        pushFieldError(getCartLineId(x), 'quantityKg');
      }
      const salePrice = Number(x.salePrice);
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        messages.push(t('validation_sale_price_positive'));
        pushFieldError(getCartLineId(x), 'salePrice');
      }
      if (!String(x.deliveryDate || '').trim()) {
        messages.push(t('validation_delivery_date_required'));
        pushFieldError(getCartLineId(x), 'deliveryDate');
      }
      const wpz = normalizeWpzFields(x);
      if (!String(wpz.wpzComment || '').trim()) {
        messages.push(t('validation_wpz_individual_required'));
        pushFieldError(getCartLineId(x), 'wpzComment');
      }
    }

    const totalsBySource = new Map();
    for (const x of items) {
      const sourceKey = `${String(x.beNumber || x.productId || x.id || '')}\u001f${String(x.warehouseId || '')}`;
      const current = totalsBySource.get(sourceKey) || { items: [], total: 0, available: null };
      const quantity = Number(x.quantityKg);
      const hasAvailable = x.availableAmount !== null && x.availableAmount !== undefined && x.availableAmount !== '';
      const available = hasAvailable ? Number(x.availableAmount) : Number.NaN;
      current.items.push(x);
      if (Number.isFinite(quantity)) current.total += quantity;
      if (Number.isFinite(available)) {
        current.available = current.available === null ? available : Math.min(current.available, available);
      }
      totalsBySource.set(sourceKey, current);
    }
    for (const group of totalsBySource.values()) {
      if (group.available !== null && group.total > group.available) {
        messages.push(t('validation_cart_quantity_not_above_available'));
        group.items.forEach((item) => pushFieldError(getCartLineId(item), 'quantityKg'));
      }
    }
    return { messages, nextFieldErrors };
  };

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', overflowX: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, minWidth: 0 }}>
        <IconButton
          aria-label="back"
          onClick={() => {
            if (location.state?.fromVl) {
              navigate('/vl');
              return;
            }
            if (window.history.length > 1) {
              navigate(-1);
              return;
            }
            navigate('/products');
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{t('cart_title')}</Typography>
      </Box>

      {items.length === 0 && <Typography sx={{ opacity: 0.7 }}>{t('cart_empty')}</Typography>}

      {items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
          {items.map((row) => {
            const foreignMandant = findForeignMandantName(row.beNumber, mandants, activeMandant);
            const lineId = getCartLineId(row);
            const isEditingArticle = String(editingArticleId) === lineId;
            return (
            <Card key={lineId} sx={{ width: '100%', minWidth: 0 }}>
              <CardContent sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {isEditingArticle ? (
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <TextField
                          autoFocus
                          size="small"
                          value={editingArticleValue}
                          onChange={(event) => setEditingArticleValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              saveArticleEdit(row, event);
                            }
                            if (event.key === 'Escape') cancelArticleEdit(event);
                          }}
                          onBlur={(event) => saveArticleEdit(row, event)}
                          inputProps={{ 'aria-label': t('article_name_edit') }}
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            '& .MuiInputBase-input': {
                              fontSize: '1rem',
                            },
                          }}
                        />
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label={t('article_name_save')}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => saveArticleEdit(row, event)}
                        >
                          <CheckIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={t('article_name_cancel')}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={cancelArticleEdit}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                          {row.article || row.beNumber}
                        </Typography>
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label={t('article_name_edit')}
                          title={t('article_name_edit')}
                          disabled={Boolean(foreignMandant)}
                          onClick={(event) => beginArticleEdit(row, event)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )}
                    {foreignMandant && (
                      <Typography variant="caption" sx={{ display: 'block', color: '#C56A00', overflowWrap: 'anywhere' }}>
                        {t('article_from_mandant_readonly', { name: foreignMandant })}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    <IconButton
                      aria-label={t('position_split_title')}
                      title={t('position_split_title')}
                      disabled={Boolean(foreignMandant) || !calculatePositionSplit(row.quantityKg, 1).ok}
                      onClick={() => openSplitDialog(row)}
                    >
                      <CallSplitOutlinedIcon />
                    </IconButton>
                    <IconButton
                      aria-label={t('cart_remove')}
                      color="error"
                      onClick={() => setItems(removeOrderCartItem(lineId))}
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {t('product_be_number')}: {row.beNumber || '-'} | {t('product_warehouse')}: {row.warehouse || row.warehouseId || '-'}
                </Typography>
                <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {t('product_available_now')}: {row.availableAmount ?? '-'} {row.unit || 'kg'} | {t('product_price')}: {formatPrice(row.acquisitionPrice)}
                </Typography>
            {(() => {
              const rowErr = fieldErrors[lineId] || {};
              return (
                <>
                <TextField
                  type="number"
                  label={t('cart_quantity')}
                  value={row.quantityKg}
                  onChange={(e) => onQtyChange(lineId, e.target.value)}
                  inputProps={{ min: 1, max: Number.isFinite(Number(row.availableAmount)) ? Number(row.availableAmount) : undefined, step: 'any' }}
                  size="small"
                  required
                  error={Boolean(rowErr.quantityKg)}
                  helperText={rowErr.quantityKg ? t('validation_cart_quantity_positive') : ''}
                />
                <TextField
                  type="number"
                  label={t('order_sale_price')}
                  value={row.salePrice ?? ''}
                  onChange={(e) => onSalePriceChange(lineId, e.target.value)}
                  inputProps={{ min: 0.01, step: 'any' }}
                  size="small"
                  required
                  error={Boolean(rowErr.salePrice)}
                  helperText={rowErr.salePrice ? t('validation_sale_price_positive') : ''}
                />
                <SaleMarginHint amountInKg={row.quantityKg} salePrice={row.salePrice} costPrice={row.acquisitionPrice} />
                <Box sx={{ display: 'grid', gap: 0.25, minWidth: 0 }}>
                  <TextField
                    type="date"
                    label={t('delivery_date')}
                    value={row.deliveryDate || ''}
                    onChange={(e) => onDeliveryDateChange(lineId, e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                    required
                    error={Boolean(rowErr.deliveryDate)}
                    helperText={rowErr.deliveryDate ? t('validation_delivery_date_required') : ''}
                  />
                  <DeliveryDateHint status={getWeekendStatus(row.deliveryDate)} t={t} />
                </Box>
                <WpzCommentField
                  wpzId={row.wpzId}
                  wpzOriginal={row.wpzOriginal}
                  wpzComment={row.wpzComment}
                  onChange={(patch) => setItems(updateOrderCartItem(lineId, patch))}
                  error={Boolean(rowErr.wpzComment)}
                  helperText={t('validation_wpz_individual_required')}
                />
                </>
              );
            })()}
              </CardContent>
            </Card>
            );
          })}

          {error && <Alert severity="error" sx={{ mb: 0.5 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={() => {
                const { messages, nextFieldErrors } = validate();
                if (messages.length) {
                  setFieldErrors(nextFieldErrors);
                  setError(t('validation_fill_required_fields'));
                  return;
                }
                setFieldErrors({});
                setError('');
                const sourceItems = items.map((x) => {
                  const wpz = normalizeWpzFields(x);
                  return {
                    productId: x.productId || x.id,
                    clientKey: x.lineId,
                    article: x.article,
                    beNumber: x.beNumber,
                    warehouseId: x.warehouseId,
                    amountInKg: Number(x.quantityKg),
                    salePrice: Number(x.salePrice),
                    costPrice: Number(x.acquisitionPrice),
                    deliveryDate: x.deliveryDate || null,
                    deliveryDateAuto: x.deliveryDateAuto === true,
                    originalPackagingType: x.originalPackagingType || '',
                    wpzId: x.wpzId ?? null,
                    wpzOriginal: x.wpzId ? wpz.wpzOriginal : null,
                    wpzComment: wpz.wpzComment,
                  };
                });
                if (!getSelectedCustomer()?.id) {
                  setPendingSourceItems(sourceItems);
                  setCustomerRequiredOpen(true);
                  return;
                }
                navigate('/temp-orders/new', {
                  state: {
                    sourceItems,
                  },
                });
              }}
            >
              {t('cart_create_order')}
            </Button>
          </Box>
        </Box>
      )}

      <CustomerRequiredDialog
        open={customerRequiredOpen}
        onClose={() => setCustomerRequiredOpen(false)}
        onChoose={chooseCustomer}
      />
      <Dialog open={Boolean(splitItem)} onClose={closeSplitDialog} fullWidth maxWidth="xs">
        <DialogTitle>{t('position_split_title')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            type="number"
            label={t('position_split_keep_amount')}
            value={splitKeptQuantity}
            onChange={(event) => {
              setSplitKeptQuantity(event.target.value);
              setSplitError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirmSplit();
              }
            }}
            inputProps={{ min: 1, max: Math.max(Number(splitItem?.quantityKg || 0) - 1, 1), step: 'any' }}
            error={Boolean(splitError)}
            helperText={splitError || t('position_split_minimum')}
          />
          {splitPreview.ok && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t('position_split_new_amount', { amount: splitPreview.remainder })}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSplitDialog}>{t('back_label')}</Button>
          <Button variant="contained" onClick={confirmSplit}>{t('position_split_action')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
