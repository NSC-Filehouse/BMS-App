import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { getMandant } from '../utils/mandant.js';

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }
  return `${value} €`;
}

function InfoRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ width: '40%', textAlign: 'right' }}>
        {value || ''}
      </Typography>
    </Box>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await apiRequest(`/orders/${encodeURIComponent(id)}`);
        if (!alive) return;
        setItem(res?.data || null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || 'Fehler beim Laden.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [id]);

  const mandant = getMandant();
  const isReserved = Boolean(item?.isReserved);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="zurueck" onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          {item?.orderNumber || id}
        </Typography>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && item && (
        <Card>
          <CardContent sx={{ pt: 2 }}>
            {!isReserved && <InfoRow label="Kunde" value={item.clientName} />}
            <InfoRow label="Mandant" value={mandant} />
            <InfoRow label="Artikel" value={item.article} />
            <InfoRow label="Gesamtpreis" value={formatPrice(item.price)} />
            <InfoRow label="Bestellschluss" value={item.closingDate} />
            <InfoRow label="Reserviert bis" value={item.reservationDate} />
            {!isReserved && <InfoRow label="Datum der Auftragserstellung" value={item.createdAt} />}
            <InfoRow label="Verantwortlicher Aussendienstmitarbeiter" value={item.receivedFrom} />
            <InfoRow label="Weitergereicht an" value={item.passedTo} />
            <Divider sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
