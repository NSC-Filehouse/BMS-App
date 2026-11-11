import React from 'react';
import {
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { BackAwareAccordion as Accordion } from './DisclosureBack.jsx';
import ExpandCollapseIndicator from './ExpandCollapseIndicator.jsx';
import WpzCommentField from './WpzCommentField.jsx';
import SaleMarginHint from './SaleMarginHint.jsx';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

export function OfferPositionFields({ position: p, onChange }) {
  const { t, lang } = useI18n();
  const field = (key, label, extra = {}) => (
    <TextField
      size="small"
      label={label}
      value={p[key] ?? ''}
      onChange={(e) => onChange({ [key]: e.target.value })}
      {...extra}
    />
  );
  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1,
        }}
      >
        <Box sx={{ display: 'grid', gap: 0.25, minWidth: 0 }}>
          <TextField
            type="date"
            size="small"
            label={t('delivery_date')}
            value={p.deliveryDate || ''}
            onChange={(e) =>
              onChange({
                deliveryDate: e.target.value,
                ...(p.valutaDateManual ? {} : { valutaDate: e.target.value }),
              })
            }
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            size="small"
            label={t('valuta_date')}
            value={p.valutaDate || p.deliveryDate || ''}
            onChange={(e) =>
              onChange({ valutaDate: e.target.value, valutaDateManual: true })
            }
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        {field(
          'quantity',
          /^kg$/i.test(p.unit)
            ? t('product_amount')
            : `${t('product_amount')} (${p.unit})`,
          {
            type: 'number',
            inputProps: { min: 0.001, step: 'any' },
          },
        )}
        <Box sx={{ display: 'grid', gap: 0.25 }}>
          {field(
            'price',
            /^kg$/i.test(p.unit)
              ? t('order_sale_price')
              : `${lang === 'en' ? 'Sales price' : 'Verkaufspreis'} / ${p.priceBasis} ${p.unit}`,
            { type: 'number', inputProps: { min: 0, step: 'any' } },
          )}
          <SaleMarginHint
            amountInKg={
              (Number(p.quantity) * 1000) /
              Math.max(1, Number(p.priceBasis) || 1)
            }
            salePrice={p.price}
            costPrice={p.costPrice}
          />
        </Box>
        {field('costPrice', t('product_price'), {
          type: 'number',
          inputProps: { min: 0, step: 'any' },
        })}
      </Box>
      <WpzCommentField
        wpzId={null}
        wpzOriginal={p.wpzOriginal}
        wpzComment={p.wpzComment}
        onChange={onChange}
        helperText={t('validation_wpz_individual_required')}
      />
    </>
  );
}
export default function OfferPositionEditor({
  position: p,
  onChange,
  onRemove,
}) {
  const { t, lang } = useI18n();
  const en = lang === 'en';
  const [editing, setEditing] = React.useState(false);
  const [article, setArticle] = React.useState(p.article);
  const [stocks, setStocks] = React.useState([]);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!p.reserve) return;
    let active = true;
    setError('');
    apiRequest(
      `/temp-offers/articles/${encodeURIComponent(p.articleIndex)}/stock`,
    )
      .then((r) => {
        if (active) setStocks(r.data || []);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [p.reserve, p.articleIndex]);
  const saveName = (e) => {
    e?.stopPropagation();
    if (article.trim()) onChange({ article: article.trim() });
    setEditing(false);
  };
  const stockKey = `${p.beNumber || ''}|${p.warehouseId || ''}`;
  const stockOptions =
    stocks.some((s) => `${s.beNumber}|${s.warehouseId}` === stockKey) ||
    !p.beNumber
      ? stocks
      : [
          {
            beNumber: p.beNumber,
            warehouseId: p.warehouseId,
            warehouse: p.warehouseId,
            available: null,
          },
          ...stocks,
        ];
  return (
    <Accordion disableGutters>
      <AccordionSummary
        expandIcon={<ExpandCollapseIndicator accordion />}
        sx={{ minWidth: 0, '& .MuiAccordionSummary-content': { minWidth: 0 } }}
      >
        <Box sx={{ display: 'grid', width: '100%', minWidth: 0, gap: 0.35 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              minWidth: 0,
            }}
          >
            {editing ? (
              <Box
                sx={{ display: 'flex', gap: 0.5, flex: 1 }}
                onClick={(e) => e.stopPropagation()}
              >
                <TextField
                  autoFocus
                  size="small"
                  value={article}
                  onChange={(e) => setArticle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveName(e);
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditing(false);
                    }
                  }}
                  onBlur={saveName}
                  inputProps={{
                    'aria-label': t('article_name_edit'),
                    maxLength: 75,
                  }}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    '& .MuiInputBase-input': {
                      fontSize: '.875rem',
                      fontWeight: 700,
                    },
                  }}
                />
                <IconButton
                  size="small"
                  color="primary"
                  aria-label={t('article_name_save')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={saveName}
                >
                  <CheckIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t('article_name_cancel')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(false);
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <>
                <Typography
                  variant="body2"
                  sx={{
                    minWidth: 0,
                    flex: 1,
                    fontWeight: 700,
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {p.article || '-'}
                </Typography>
                <IconButton
                  size="small"
                  color="primary"
                  aria-label={t('article_name_edit')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setArticle(p.article);
                    setEditing(true);
                  }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </>
            )}
          </Box>
          <Typography
            variant="caption"
            sx={{ opacity: 0.75, overflowWrap: 'anywhere' }}
          >
            {t('product_article_index')}: {p.articleIndex}
          </Typography>
          {p.reserve && p.beNumber && (
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {t('product_be_number')}: {p.beNumber} | {t('product_storage_id')}
              : {p.warehouseId || '-'}
            </Typography>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'grid', gap: 1.1, minWidth: 0 }}>
        <OfferPositionFields position={p} onChange={onChange} />
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Checkbox
              checked={Boolean(p.reserve)}
              disabled={!/^kg$/i.test(p.unit)}
              onChange={(e) =>
                onChange({
                  reserve: e.target.checked,
                  reserveQuantity: p.reserveQuantity || p.quantity,
                })
              }
            />
          }
          label={
            en
              ? 'Reserve quantity for this offer'
              : 'Menge für dieses Angebot reservieren'
          }
        />
        {p.reserve && (
          <>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              select
              size="small"
              label={
                en ? 'Stock position / warehouse' : 'Bestandsposition / Lager'
              }
              value={p.beNumber ? stockKey : ''}
              onChange={(e) => {
                const s = stockOptions.find(
                  (s) => `${s.beNumber}|${s.warehouseId}` === e.target.value,
                );
                onChange({ beNumber: s.beNumber, warehouseId: s.warehouseId });
              }}
            >
              <MenuItem value="" disabled>
                {en ? 'Please select' : 'Bitte wählen'}
              </MenuItem>
              {stockOptions.map((s) => (
                <MenuItem
                  key={`${s.beNumber}|${s.warehouseId}`}
                  value={`${s.beNumber}|${s.warehouseId}`}
                >
                  {s.beNumber} · {s.warehouse || s.warehouseId} ·{' '}
                  {s.available ?? '-'} kg
                </MenuItem>
              ))}
            </TextField>
            {!stocks.length && (
              <Typography variant="caption" color="text.secondary">
                {en
                  ? 'No available stock source.'
                  : 'Keine verfügbare Bestandsquelle.'}
              </Typography>
            )}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1,
              }}
            >
              <TextField
                size="small"
                type="number"
                label={t('order_reserve_amount')}
                value={p.reserveQuantity ?? ''}
                onChange={(e) => onChange({ reserveQuantity: e.target.value })}
                inputProps={{ min: 0.001, max: p.quantity, step: 'any' }}
              />
              <TextField
                size="small"
                type="date"
                label={t('order_reserved_until')}
                value={p.reserveUntil || ''}
                onChange={(e) => onChange({ reserveUntil: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          </>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <IconButton
            size="small"
            color="error"
            aria-label={t('delete_label')}
            onClick={onRemove}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
