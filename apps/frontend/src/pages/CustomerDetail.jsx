import React from 'react';
import {
  Alert,
  Box,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Typography,
} from '@mui/material';
import MapIcon from '@mui/icons-material/Map';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';

function getCustomerName(row) {
  const name1 = row?.kd_Name1 ? String(row.kd_Name1).trim() : '';
  const name2 = row?.kd_Name2 ? String(row.kd_Name2).trim() : '';
  return name1 || name2 || '';
}

function buildAddress(row) {
  const street = row?.kd_Strasse ? String(row.kd_Strasse).trim() : '';
  const plz = row?.kd_PLZ ? String(row.kd_PLZ).trim() : '';
  const ort = row?.kd_Ort ? String(row.kd_Ort).trim() : '';
  const lk = row?.kd_LK ? String(row.kd_LK).trim() : '';

  const line1 = street;
  const line2 = [plz, ort].filter(Boolean).join(' ');
  const line3 = lk;

  return [line1, line2, line3].filter(Boolean).join('\n');
}

function InfoRow({ icon, label, value, link }) {
  const content = link ? (
    <Box
      component="a"
      href={link}
      sx={{ color: 'primary.main', textDecoration: 'underline' }}
    >
      {value}
    </Box>
  ) : (
    <Box>{value}</Box>
  );

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        {icon}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Box sx={{ width: '45%', textAlign: 'right', whiteSpace: 'pre-line' }}>
        {content}
      </Box>
    </Box>
  );
}

export default function CustomerDetail() {
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
        const res = await apiRequest(`/customers/${encodeURIComponent(id)}`);
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

  const name = getCustomerName(item);
  const description = item?.kd_Notiz ? String(item.kd_Notiz) : '';
  const address = buildAddress(item);
  const repName = item?.kd_Aussendienst ? String(item.kd_Aussendienst).trim() : '';
  const phone = item?.kd_Telefon ? String(item.kd_Telefon).trim() : '';
  const email = item?.kd_eMail ? String(item.kd_eMail).trim() : '';
  const hasRepBlock = repName || phone || email;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="zurueck" onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          {name || String(id)}
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
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              Beschreibung
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>
              {description || '-'}
            </Typography>

            <Divider sx={{ my: 3 }} />

            <InfoRow
              icon={<MapIcon fontSize="small" />}
              label="Adresse"
              value={address || '-'}
            />

            {hasRepBlock && (
              <>
                <Divider sx={{ my: 3 }} />
                {repName && (
                  <InfoRow
                    icon={<PersonIcon fontSize="small" />}
                    label="Ansprechpartner"
                    value={repName}
                  />
                )}
                {phone && (
                  <InfoRow
                    icon={<PhoneIcon fontSize="small" />}
                    label="Telefon"
                    value={phone}
                    link={`tel:${phone}`}
                  />
                )}
                {email && (
                  <InfoRow
                    icon={<EmailIcon fontSize="small" />}
                    label="E-Mail"
                    value={email}
                    link={`mailto:${email}`}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
