import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { money, offerStatus } from '../utils/offers.js';
import { navigateToReturn } from '../utils/navigation.js';
export default function TempOfferDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useI18n();
  const en = lang === 'en';
  const [offer, setOffer] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState('');
  React.useEffect(() => {
    let active = true;
    apiRequest(`/temp-offers/${id}`)
      .then((r) => {
        if (active) setOffer(r.data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const editable = offer && [0, 3].includes(offer.status);
  const state = { returnTo: location.state?.returnTo };
  async function execute() {
    setBusy(true);
    setError('');
    try {
      const res = await apiRequest(
        `/temp-offers/${id}${action === 'release' ? '/release' : ''}`,
        {
          method: action === 'release' ? 'POST' : 'DELETE',
          body: JSON.stringify({ version: offer.version }),
        },
      );
      setAction('');
      if (action === 'delete')
        navigateToReturn(navigate, state.returnTo, '/temp-offers');
      else setOffer(res.data);
    } catch (e) {
      setError(e.message);
      setAction('');
    } finally {
      setBusy(false);
    }
  }
  if (!offer)
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : (
      <CircularProgress />
    );
  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', display: 'grid', gap: 2 }}>
      <style>
        {
          '@media print {body * {visibility:hidden} .offer-print,.offer-print * {visibility:visible} .offer-print {position:absolute;left:0;top:0;width:100%} .no-offer-print,.no-offer-print * {display:none!important} }'
        }
      </style>
      <Box
        className="no-offer-print"
        sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
      >
        <Button
          onClick={() =>
            navigateToReturn(navigate, state.returnTo, '/temp-offers')
          }
        >
          {en ? 'Back' : 'Zurück'}
        </Button>
        {editable && (
          <Button
            onClick={() => navigate(`/temp-offers/${id}/edit`, { state })}
          >
            {en ? 'Edit' : 'Bearbeiten'}
          </Button>
        )}
        <Button
          variant="outlined"
          onClick={() =>
            navigate('/temp-offers/new', {
              state: { ...state, copyFrom: offer.id },
            })
          }
        >
          {en ? 'Copy for customer' : 'Für Kunden kopieren'}
        </Button>
        <Button onClick={() => window.print()}>
          {en ? 'Print' : 'Drucken'}
        </Button>
        {editable && (
          <>
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => setAction('release')}
            >
              {en ? 'Release for BMS' : 'Für BMS freigeben'}
            </Button>
            <Button
              color="error"
              disabled={busy}
              onClick={() => setAction('delete')}
            >
              {en ? 'Delete' : 'Löschen'}
            </Button>
          </>
        )}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Box className="offer-print" sx={{ display: 'grid', gap: 2 }}>
        <Typography variant="h5">
          {en ? 'Offer' : 'Angebot'} {offer.bmsOfferNumber || `AN-${offer.id}`}
        </Typography>
        <Box className="no-offer-print">
          <Chip label={offerStatus(offer.status, en)} />
        </Box>
        {offer.returnComment && (
          <Alert className="no-offer-print" severity="warning">
            {offer.returnComment}
          </Alert>
        )}
        <Card>
          <CardContent>
            <Typography fontWeight={700}>{offer.customerName}</Typography>
            <Typography sx={{ whiteSpace: 'pre-line' }}>
              {offer.customerAddress}
            </Typography>
            <Typography>
              {offer.contact} {offer.department}
            </Typography>
            <Typography variant="body2">
              {String(offer.offerDate).slice(0, 10)} · {offer.customerReference}
            </Typography>
            <Typography variant="h6">{offer.title}</Typography>
            {offer.validUntil && (
              <Typography>
                {en ? 'Valid until' : 'Gültig bis'}:{' '}
                {String(offer.validUntil).slice(0, 10)}
              </Typography>
            )}
            <Typography sx={{ whiteSpace: 'pre-line' }}>
              {offer.intro}
            </Typography>
          </CardContent>
        </Card>
        {offer.positions.map((p, i) => (
          <Card key={p.id} variant="outlined" sx={{ breakInside: 'avoid' }}>
            <CardContent>
              <Typography fontWeight={700}>
                {i + 1}. {p.article}
              </Typography>
              <Typography>
                {p.quantity} {p.unit} × {p.price} {offer.currency}/
                {p.priceBasis} {p.unit}
              </Typography>
              <Typography align="right">
                {money(p.total, offer.currency)}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-line' }}>
                {p.description}
              </Typography>
              <Typography>{p.alternativeText}</Typography>
              <Typography>
                {p.deliveryDate ? String(p.deliveryDate).slice(0, 10) : ''}{' '}
                {p.deliveryText}
              </Typography>
              {(p.sample || p.rejected) && (
                <Typography>
                  {p.sample ? (en ? 'Sample' : 'Muster') : ''}{' '}
                  {p.rejected ? (en ? 'Rejected' : 'Abgelehnt') : ''}
                </Typography>
              )}
              {p.reserve && (
                <Typography className="no-offer-print" color="text.secondary">
                  {en ? 'Reserved' : 'Reserviert'}: {p.reserveQuantity} kg ·{' '}
                  {p.beNumber} · {p.warehouseId} ·{' '}
                  {String(p.reserveUntil).slice(0, 10)}
                </Typography>
              )}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent>
            <Typography sx={{ whiteSpace: 'pre-line' }}>
              {offer.paymentText}
            </Typography>
            <Typography>{offer.deliveryTerms}</Typography>
            <Typography>{offer.packaging}</Typography>
            <Typography sx={{ whiteSpace: 'pre-line' }}>
              {offer.closingText}
            </Typography>
          </CardContent>
        </Card>
        <Card className={!offer.printTotals ? 'no-offer-print' : ''}>
          <CardContent>
            {[
              ['netAmount', en ? 'Net' : 'Nettosumme'],
              [
                'discountAmount',
                `${en ? 'Discount' : 'Rabatt'} (${offer.discountPercent} %)`,
              ],
              ['subtotal', en ? 'Subtotal' : 'Zwischensumme'],
              ['vatAmount', `${en ? 'VAT' : 'MwSt.'} (${offer.vatPercent} %)`],
              ['totalAmount', en ? 'Total' : 'Gesamtsumme'],
            ].map(([key, label]) => (
              <Box
                key={key}
                sx={{ display: 'flex', justifyContent: 'space-between' }}
              >
                <Typography>{label}</Typography>
                <Typography fontWeight={key === 'totalAmount' ? 700 : 400}>
                  {money(offer[key], offer.currency)}
                </Typography>
              </Box>
            ))}
          </CardContent>
        </Card>
      </Box>
      <Card className="no-offer-print">
        <CardContent>
          <Typography fontWeight={700}>
            {en ? 'Internal note' : 'Interne Bemerkung'}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-line' }}>
            {offer.internalNote || '—'}
          </Typography>
          <Typography variant="caption">
            {offer.createdBy} ·{' '}
            {new Date(offer.createdAt).toLocaleString('de-DE')}
          </Typography>
        </CardContent>
      </Card>
      <Dialog open={Boolean(action)} onClose={() => !busy && setAction('')}>
        <DialogTitle>
          {action === 'release'
            ? en
              ? 'Release offer for BMS import?'
              : 'Angebot zur BMS-Übernahme freigeben?'
            : en
              ? 'Delete offer?'
              : 'Angebot löschen?'}
        </DialogTitle>
        <DialogContent>
          {action === 'release'
            ? en
              ? 'The offer becomes read-only. No message is sent. BMS import is performed by the external ERP process.'
              : 'Das Angebot wird schreibgeschützt. Es wird keine Nachricht versendet. Die Übernahme erfolgt durch den externen BMS-Prozess.'
            : en
              ? 'The draft and its linked reservations will be deleted.'
              : 'Der Entwurf und seine zugeordneten Reservierungen werden gelöscht.'}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setAction('')}>
            {en ? 'Cancel' : 'Abbrechen'}
          </Button>
          <Button disabled={busy} onClick={execute}>
            {en ? 'Confirm' : 'Bestätigen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
