import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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
  updateOrderCartQuantity,
  updateOrderCartDeliveryDate,
  updateOrderCartSalePrice,
  updateOrderCartArticle,
  updateOrderCartItem,
} from '../utils/orderCart.js';
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
  const activeMandant = getMandant();

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
    setEditingArticleId(String(row?.id || ''));
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
    setItems(updateOrderCartArticle(row.id, nextArticle));
    setError('');
    setEditingArticleId('');
    setEditingArticleValue('');
  }, [editingArticleValue, t]);

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
        pushFieldError(x.id, 'quantityKg');
        continue;
      }
      const available = Number(x.availableAmount);
      if (Number.isFinite(available) && qty > available) {
        messages.push(t('validation_cart_quantity_not_above_available'));
        pushFieldError(x.id, 'quantityKg');
      }
      const salePrice = Number(x.salePrice);
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        messages.push(t('validation_sale_price_positive'));
        pushFieldError(x.id, 'salePrice');
      }
      if (!String(x.deliveryDate || '').trim()) {
        messages.push(t('validation_delivery_date_required'));
        pushFieldError(x.id, 'deliveryDate');
      }
      const wpz = normalizeWpzFields(x);
      if (!String(wpz.wpzComment || '').trim()) {
        messages.push(t('validation_wpz_individual_required'));
        pushFieldError(x.id, 'wpzComment');
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
            const isEditingArticle = String(editingArticleId) === String(row.id);
            return (
            <Card key={row.id} sx={{ width: '100%', minWidth: 0 }}>
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
                  <IconButton
                    aria-label={t('cart_remove')}
                    color="error"
                    onClick={() => setItems(removeOrderCartItem(row.id))}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Box>
                <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {t('product_be_number')}: {row.beNumber || '-'} | {t('product_warehouse')}: {row.warehouse || row.warehouseId || '-'}
                </Typography>
                <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {t('product_available_now')}: {row.availableAmount ?? '-'} {row.unit || 'kg'} | {t('product_price')}: {formatPrice(row.acquisitionPrice)}
                </Typography>
            {(() => {
              const rowErr = fieldErrors[String(row.id || '')] || {};
              return (
                <>
                <TextField
                  type="number"
                  label={t('cart_quantity')}
                  value={row.quantityKg}
                  onChange={(e) => onQtyChange(row.id, e.target.value)}
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
                  onChange={(e) => onSalePriceChange(row.id, e.target.value)}
                  inputProps={{ min: 0.01, step: 'any' }}
                  size="small"
                  required
                  error={Boolean(rowErr.salePrice)}
                  helperText={rowErr.salePrice ? t('validation_sale_price_positive') : ''}
                />
                <SaleMarginHint salePrice={row.salePrice} costPrice={row.acquisitionPrice} />
                <Box sx={{ display: 'grid', gap: 0.25, minWidth: 0 }}>
                  <TextField
                    type="date"
                    label={t('delivery_date')}
                    value={row.deliveryDate || ''}
                    onChange={(e) => onDeliveryDateChange(row.id, e.target.value)}
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
                  onChange={(patch) => setItems(updateOrderCartItem(row.id, patch))}
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
                    id: x.id,
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
    </Box>
  );
}
