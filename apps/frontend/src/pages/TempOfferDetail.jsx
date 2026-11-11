import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { money, offerStatus } from '../utils/offers.js';
import { navigateToReturn } from '../utils/navigation.js';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
function InfoRow({ label, value }) {
  return (
    <Box
      sx={{
        display: { xs: 'grid', md: 'flex' },
        alignItems: 'start',
        justifyContent: 'space-between',
        gap: 0.5,
        minWidth: 0,
        mb: 0.5,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
          textAlign: { xs: 'left', md: 'right' },
          maxWidth: { xs: '100%', md: '60%' },
        }}
      >
        {value || '-'}
      </Typography>
    </Box>
  );
}
export default function TempOfferDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useI18n();
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
  const state = { returnTo: location.state?.returnTo };
  const editable = offer && [0, 3].includes(offer.status);
  const date = (v) => (v ? new Date(v).toLocaleDateString('de-DE') : '-');
  async function execute() {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest(
        `/temp-offers/${id}${action === 'release' ? '/release' : ''}`,
        {
          method: action === 'release' ? 'POST' : 'DELETE',
          body: JSON.stringify({ version: offer.version }),
        },
      );
      setAction('');
      if (action === 'delete')
        navigateToReturn(navigate, state.returnTo, '/temp-offers');
      else setOffer(result.data);
    } catch (e) {
      setError(e.message);
      setAction('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box
      sx={{
        maxWidth: 900,
        width: '100%',
        minWidth: 0,
        mx: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          minWidth: 0,
        }}
      >
        <DisclosureBackButton
          aria-label="back"
          onClick={() =>
            navigateToReturn(navigate, state.returnTo, '/temp-offers')
          }
        >
          <ArrowBackIcon />
        </DisclosureBackButton>
        <Typography variant="h5">
          {en ? 'Offer' : 'Angebot'} {offer?.bmsOfferNumber || `AN-${id}`}
        </Typography>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {!offer && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {offer && (
        <Card sx={{ width: '100%', minWidth: 0 }}>
          <CardContent>
            <InfoRow label={t('order_customer')} value={offer.customerName} />
            <InfoRow
              label={en ? 'Customer reference' : 'Kundenreferenz'}
              value={offer.customerReference}
            />
            <InfoRow label={t('address_label')} value={offer.customerAddress} />
            <InfoRow label={t('contact_label')} value={offer.contact} />
            <InfoRow
              label={en ? 'Created' : 'Erstellt am'}
              value={date(offer.createdAt)}
            />
            <InfoRow
              label={t('temp_order_status')}
              value={offerStatus(offer.status, en)}
            />
            {offer.returnComment && (
              <InfoRow
                label={t('temp_order_return_comment')}
                value={offer.returnComment}
              />
            )}
            <Divider sx={{ my: 1 }} />
            <InfoRow label={t('incoterm_label')} value={offer.deliveryTerms} />
            <InfoRow
              label={t('packaging_type_label')}
              value={offer.packaging}
            />
            <InfoRow
              label={t(
                /^FCA\b/i.test(offer.deliveryTerms)
                  ? 'pickup_address_label'
                  : 'delivery_address_label',
              )}
              value={offer.deliveryAddress}
            />
            <InfoRow
              label={t('special_payment_condition')}
              value={t(
                offer.specialPaymentCondition ? 'yes_label' : 'no_label',
              )}
            />
            <InfoRow
              label={t('special_payment_text_label')}
              value={offer.paymentText}
            />
            <InfoRow
              label={en ? 'Internal note' : 'Interne Bemerkungen'}
              value={offer.internalNote}
            />
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
              {t('order_positions_count')}: {offer.positions.length}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {offer.positions.map((p, i) => (
                <Box
                  key={p.id || i}
                  sx={{
                    border: '1px solid rgba(0,0,0,.12)',
                    borderRadius: 1.5,
                    p: 1.25,
                    display: 'grid',
                    gap: 0.35,
                    minWidth: 0,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      minWidth: 0,
                      fontWeight: 700,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {p.article}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('product_article_index')}: {p.articleIndex}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('delivery_date')}: {date(p.deliveryDate)}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('valuta_date')}: {date(p.valutaDate || p.deliveryDate)}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('product_amount')}: {p.quantity} {p.unit} |{' '}
                    {t('order_sale_price')}: {money(p.price)} |{' '}
                    {t('product_price')}: {money(p.costPrice)}
                  </Typography>
                  {p.reserve && (
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>
                      {t('order_reserve_amount')}: {p.reserveQuantity} kg |{' '}
                      {t('order_reserved_until')}: {date(p.reserveUntil)} |{' '}
                      {p.beNumber} · {p.warehouseId}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('wpz_comment_label')}: {p.wpzComment || '-'}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2,minmax(0,1fr))',
                  md: 'repeat(4,max-content)',
                },
                gap: 1,
                mt: 2,
                minWidth: 0,
              }}
            >
              {editable && (
                <Button
                  variant="contained"
                  disabled={busy}
                  onClick={() => setAction('release')}
                >
                  {en ? 'Release for BMS' : 'Für BMS freigeben'}
                </Button>
              )}
              {editable && (
                <Button
                  variant="outlined"
                  onClick={() => navigate(`/temp-offers/${id}/edit`, { state })}
                >
                  {t('edit_label')}
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
                {t('copy_label')}
              </Button>
              {editable && (
                <Button
                  variant="outlined"
                  color="error"
                  disabled={busy}
                  onClick={() => setAction('delete')}
                >
                  {t('delete_label')}
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
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
              ? 'The offer becomes read-only. The external BMS process imports it. No message is sent.'
              : 'Das Angebot wird schreibgeschützt. Die Übernahme erfolgt durch den externen BMS-Prozess. Es wird keine Nachricht versendet.'
            : en
              ? 'The draft and its own reservations will be deleted.'
              : 'Der Entwurf und seine eigenen Reservierungen werden gelöscht.'}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setAction('')}>
            {t('back_label')}
          </Button>
          <Button disabled={busy} variant="contained" onClick={execute}>
            {en ? 'Confirm' : 'Bestätigen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
