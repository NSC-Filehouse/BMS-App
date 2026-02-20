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
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

function getCustomerName(row) {
  const name1 = row?.kd_Name1 ? String(row.kd_Name1).trim() : '';
  const name2 = row?.kd_Name2 ? String(row.kd_Name2).trim() : '';
  return name1 || name2 || '';
}

function buildAddress(row) {
  const street = row?.kd_Strasse ? String(row.kd_Strasse).trim() : '';
  const plz = row?.kd_PLZ ? String(row.kd_PLZ).trim() : '';
  const ort = row?.kd_Ort ? String(row.kd_Ort).trim() : '';
  const region = row?.kd_Region ? String(row.kd_Region).trim() : '';
  const lk = row?.kd_LK ? String(row.kd_LK).trim() : '';

  const line1 = street;
  const line2 = [plz, ort].filter(Boolean).join(' ');
  const line3 = region;
  const line4 = lk;

  return [line1, line2, line3, line4].filter(Boolean).join('\n');
}

function normalizeRepresentatives(item) {
  const fromApi = Array.isArray(item?.representatives) ? item.representatives : [];
  const normalizedApi = fromApi
    .map((rep, idx) => {
      const name = rep?.name ? String(rep.name).trim() : '';
      const phone = rep?.phone ? String(rep.phone).trim() : '';
      const email = rep?.email ? String(rep.email).trim() : '';
      const key = rep?.id ?? `${name}-${idx}`;
      return { key, name, phone, email };
    })
    .filter((rep) => rep.name || rep.phone || rep.email);

  if (normalizedApi.length) return normalizedApi;

  const legacyName = item?.kd_Aussendienst ? String(item.kd_Aussendienst).trim() : '';
  const legacyPhone = item?.kd_Telefon ? String(item.kd_Telefon).trim() : '';
  const legacyEmail = item?.kd_eMail ? String(item.kd_eMail).trim() : '';
  if (legacyName || legacyPhone || legacyEmail) {
    return [{ key: 'legacy', name: legacyName, phone: legacyPhone, email: legacyEmail }];
  }

  return [];
}

function InfoRow({ icon, label, value, link }) {
  const content = link ? (
    <Box
      component="a"
      href={link}
      sx={{
        color: 'primary.main',
        textDecoration: 'underline',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
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
      <Box
        sx={{
          width: '45%',
          textAlign: 'right',
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </Box>
    </Box>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

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
        setError(e?.message || t('loading_error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [id, t]);

  const name = getCustomerName(item);
  const description = item?.kd_Notiz ? String(item.kd_Notiz) : '';
  const address = buildAddress(item);
  const homepageRaw = item?.kd_HomePage ? String(item.kd_HomePage).trim() : '';
  const homepageLink = homepageRaw
    ? (/^https?:\/\//i.test(homepageRaw) ? homepageRaw : `https://${homepageRaw}`)
    : '';
  const salesRep = item?.kd_Aussendienst ? String(item.kd_Aussendienst).trim() : '';
  const representatives = normalizeRepresentatives(item);
  const handleBack = React.useCallback(() => {
    const fromCustomers = location.state?.fromCustomers;
    if (fromCustomers) {
      navigate('/customers', { state: { listState: fromCustomers } });
      return;
    }
    navigate(-1);
  }, [location.state, navigate]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={handleBack}>
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
              {t('desc_label')}
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }}>
              {description || '-'}
            </Typography>

            <Divider sx={{ my: 3 }} />

            <InfoRow
              icon={<MapIcon fontSize="small" />}
              label={t('address_label')}
              value={address || '-'}
            />
            <InfoRow
              icon={<MapIcon fontSize="small" />}
              label={t('homepage_label')}
              value={homepageRaw || '-'}
              link={homepageLink || undefined}
            />

            <Divider sx={{ my: 3 }} />
            <InfoRow
              icon={<PersonIcon fontSize="small" />}
              label={t('sales_rep_label')}
              value={salesRep || '-'}
            />

            {representatives.length > 0 && (
              <>
                {representatives.map((rep, index) => (
                  <React.Fragment key={rep.key}>
                    <Divider sx={{ my: 3 }} />
                    {rep.name && (
                      <InfoRow
                        icon={<PersonIcon fontSize="small" />}
                        label={t('contact_label')}
                        value={rep.name}
                      />
                    )}
                    {rep.phone && (
                      <InfoRow
                        icon={<PhoneIcon fontSize="small" />}
                        label={t('phone_label')}
                        value={rep.phone}
                        link={`tel:${rep.phone}`}
                      />
                    )}
                    {rep.email && (
                      <InfoRow
                        icon={<EmailIcon fontSize="small" />}
                        label={t('email_label')}
                        value={rep.email}
                        link={`mailto:${rep.email}`}
                      />
                    )}
                    {index < representatives.length - 1 && <Divider sx={{ my: 1 }} />}
                  </React.Fragment>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
