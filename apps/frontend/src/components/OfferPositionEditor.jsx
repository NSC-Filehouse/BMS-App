import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { apiRequest } from '../api/client.js';
import { money } from '../utils/offers.js';

export default function OfferPositionEditor({
  position: p,
  index,
  onChange,
  onRemove,
  onDuplicate,
  en,
  currency,
}) {
  const [stocks, setStocks] = React.useState([]);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!p.reserve) return;
    let active = true;
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
  const field = (key, label, extra = {}) => (
    <TextField
      size="small"
      label={label}
      value={p[key] ?? ''}
      onChange={(e) => onChange({ [key]: e.target.value })}
      {...extra}
    />
  );
  const stockKey = `${p.beNumber || ''}|${p.warehouseId || ''}`;
  const options =
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
    <Card variant="outlined">
      <CardContent sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            fontWeight={700}
            sx={{ flex: 1, overflowWrap: 'anywhere' }}
          >
            {index + 1}. {p.articleIndex}
          </Typography>
          <IconButton
            aria-label={en ? 'Duplicate position' : 'Position duplizieren'}
            onClick={onDuplicate}
          >
            <ContentCopyIcon />
          </IconButton>
          <IconButton
            aria-label={en ? 'Remove position' : 'Position entfernen'}
            onClick={onRemove}
          >
            <DeleteOutlineIcon />
          </IconButton>
        </Box>
        {field('article', en ? 'Article name' : 'Artikelbezeichnung', {
          required: true,
          inputProps: { maxLength: 75 },
        })}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr 1fr',
              md: 'repeat(4,minmax(0,1fr))',
            },
            gap: 1,
          }}
        >
          {field('quantity', en ? 'Quantity' : 'Menge', {
            type: 'number',
            required: true,
            inputProps: { min: 0.001, step: 0.001 },
          })}
          {field('unit', en ? 'Unit' : 'Einheit', {
            required: true,
            inputProps: { maxLength: 50 },
          })}
          {field('price', en ? 'Price' : 'Preis', {
            type: 'number',
            required: true,
            inputProps: { min: 0, step: 0.0001 },
          })}
          {field('priceBasis', en ? 'Price per units' : 'Preis je Einheiten', {
            type: 'number',
            required: true,
            inputProps: { min: 1, step: 1 },
          })}
        </Box>
        <Typography align="right">
          {money(
            ((Number(p.quantity) || 0) * (Number(p.price) || 0)) /
              (Number(p.priceBasis) || 1),
            currency,
          )}
        </Typography>
        {field(
          'description',
          en ? 'Description / additional text' : 'Beschreibung / Zusatztext',
          { multiline: true, minRows: 2 },
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' },
            gap: 1,
          }}
        >
          {field('deliveryDate', en ? 'Delivery date' : 'Lieferdatum', {
            type: 'date',
            InputLabelProps: { shrink: true },
          })}
          {field(
            'deliveryText',
            en ? 'Delivery time' : 'Lieferzeit / Lieferhinweis',
          )}
        </Box>
        {field(
          'alternativeText',
          en ? 'Alternative text' : 'Alternative Texteingabe',
          { inputProps: { maxLength: 50 } },
        )}
        <Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(p.sample)}
                onChange={(e) => onChange({ sample: e.target.checked })}
              />
            }
            label={en ? 'Sample' : 'Muster'}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(p.rejected)}
                onChange={(e) => onChange({ rejected: e.target.checked })}
              />
            }
            label={en ? 'Rejected' : 'Abgelehnt'}
          />
        </Box>
        <FormControlLabel
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
              ? 'Reserve stock for this offer'
              : 'Menge für dieses Angebot reservieren'
          }
        />
        {p.reserve && (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              select
              label={
                en ? 'Stock position / warehouse' : 'Bestandsposition / Lager'
              }
              size="small"
              value={p.beNumber ? stockKey : ''}
              onChange={(e) => {
                const s = options.find(
                  (s) => `${s.beNumber}|${s.warehouseId}` === e.target.value,
                );
                onChange({ beNumber: s.beNumber, warehouseId: s.warehouseId });
              }}
              required
            >
              {options.map((s) => (
                <MenuItem
                  key={`${s.beNumber}|${s.warehouseId}`}
                  value={`${s.beNumber}|${s.warehouseId}`}
                >
                  {s.beNumber} · {s.warehouse || s.warehouseId} ·{' '}
                  {s.available ?? '-'} kg{' '}
                  {s.reservedBy
                    ? `(${en ? 'reserved by' : 'reserviert von'} ${s.reservedBy})`
                    : ''}
                </MenuItem>
              ))}
            </TextField>
            {!stocks.length && (
              <Alert severity="info">
                {en
                  ? 'No available stock source. You can save the offer without a reservation.'
                  : 'Keine verfügbare Bestandsquelle. Das Angebot kann ohne Reservierung gespeichert werden.'}
              </Alert>
            )}
            <Box
              sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}
            >
              {field('reserveQuantity', en ? 'Reserve kg' : 'Reservieren kg', {
                type: 'number',
                required: true,
                inputProps: { min: 0.001, step: 0.001, max: p.quantity },
              })}
              {field('reserveUntil', en ? 'Reserved until' : 'Reserviert bis', {
                type: 'date',
                required: true,
                InputLabelProps: { shrink: true },
              })}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
