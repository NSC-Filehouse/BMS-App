import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmailIcon from '@mui/icons-material/Email';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function DetailRow({ icon, label, value, link }) {
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
      {value || '-'}
    </Box>
  ) : (
    <Box sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{value || '-'}</Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 0.5, sm: 2 },
        py: 0.9,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        {icon}
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Box>
      <Box sx={{ width: { xs: '100%', sm: '55%' }, textAlign: { xs: 'left', sm: 'right' } }}>
        {content}
      </Box>
    </Box>
  );
}

export default function EmployeeDetail() {
  const { customerId, shortCode: routeShortCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const shortCode = text(routeShortCode);
  const [employee, setEmployee] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError('');
        const response = await apiRequest(
          `/customers/${encodeURIComponent(customerId)}/representatives/${encodeURIComponent(shortCode)}`,
        );
        if (!alive) return;
        setEmployee(response?.data || null);
      } catch (requestError) {
        if (!alive) return;
        setError(requestError?.message || t('loading_error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [customerId, shortCode, t]);

  const givenName = text(employee?.givenName);
  const surname = text(employee?.surname);
  const email = text(employee?.email);
  const phone = text(employee?.phone);
  const displayName = [givenName, surname].filter(Boolean).join(' ') || shortCode || '-';
  const roles = Array.isArray(employee?.roles) ? employee.roles : [];
  const roleLabel = roles.map((role) => (
    role === 'innendienst' ? t('inside_sales_label') : t('sales_rep_label')
  )).join(' / ');

  const handleBack = React.useCallback(() => {
    const fromCustomer = location.state?.fromCustomer;
    if (fromCustomer?.id) {
      navigate(`/customers/${encodeURIComponent(fromCustomer.id)}`, {
        state: fromCustomer.fromCustomers ? { fromCustomers: fromCustomer.fromCustomers } : undefined,
      });
      return;
    }
    navigate(-1);
  }, [location.state, navigate]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', minWidth: 0, overflowX: 'hidden' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 1, mb: 2, minWidth: 0 }}>
        <IconButton aria-label="back" onClick={handleBack} sx={{ mt: 0.25 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ minWidth: 0, py: 0.75 }}>
          <Typography variant="h5" sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {t('employee_detail_title')}
          </Typography>
          {!loading && !error && employee && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {roleLabel ? `${roleLabel} · ` : ''}{employee.shortCode || shortCode}
            </Typography>
          )}
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && employee && (
        <Card sx={{ width: '100%', minWidth: 0 }}>
          <CardContent sx={{ pt: 2, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <PersonIcon color="action" />
              <Typography variant="h6" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                {displayName}
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <DetailRow icon={<PersonIcon fontSize="small" />} label={t('employee_first_name_label')} value={givenName} />
            <DetailRow icon={<PersonIcon fontSize="small" />} label={t('employee_last_name_label')} value={surname} />
            <DetailRow icon={<EmailIcon fontSize="small" />} label={t('employee_email_label')} value={email} link={email ? `mailto:${email}` : undefined} />
            <DetailRow icon={<PhoneIcon fontSize="small" />} label={t('employee_phone_label')} value={phone} link={phone ? `tel:${phone}` : undefined} />

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
              <Button
                variant="contained"
                startIcon={<EmailIcon />}
                component={email ? 'a' : 'button'}
                href={email ? `mailto:${email}` : undefined}
                disabled={!email}
              >
                {t('employee_mail_action')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<PhoneIcon />}
                component={phone ? 'a' : 'button'}
                href={phone ? `tel:${phone}` : undefined}
                disabled={!phone}
              >
                {t('employee_call_action')}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
