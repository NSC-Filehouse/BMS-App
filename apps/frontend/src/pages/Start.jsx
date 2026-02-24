import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { setMandant, getMandant, clearMandant } from '../utils/mandant.js';
import { useI18n } from '../utils/i18n.jsx';

export default function Start() {
  const [mandants, setMandants] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [meName, setMeName] = React.useState({ given: '', surname: '' });
  const navigate = useNavigate();
  const { t } = useI18n();
  const noPermissionText = t('start_no_permission_text');

  const selected = getMandant();

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError('');
        const [meRes, res] = await Promise.all([
          apiRequest('/me'),
          apiRequest('/mandants'),
        ]);
        if (!alive) return;

        const emailVal = meRes?.principalName || meRes?.mail || meRes?.email || '';
        setEmail(emailVal);
        setMeName({
          given: meRes?.givenName || '',
          surname: meRes?.surname || '',
        });
        const allowed = Array.isArray(res?.data) ? res.data : [];
        setMandants(allowed);

        if (!allowed.length) {
          clearMandant();
          setError(t('start_no_permission_text'));
          return;
        }

        const selectedLower = String(selected || '').toLowerCase();
        const selectedStillAllowed = allowed.find((m) => String(m).toLowerCase() === selectedLower);
        if (selected && !selectedStillAllowed) {
          clearMandant();
        }

        if (allowed.length === 1) {
          setMandant(allowed[0]);
          navigate('/vl');
        }
      } catch (e) {
        if (!alive) return;
        setError(e?.message || t('loading_mandants_error'));
        setMeName({ given: '', surname: '' });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t('start_title')}
      </Typography>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1">
            {t('start_user')}: <b>{`${meName.given || ''} ${meName.surname || ''}`.trim() || '-'}</b>
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            {email || '-'}
          </Typography>
        </Box>
      )}

      {!loading && error && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {error === noPermissionText ? t('start_no_permission_title') : t('loading_mandants_error')}
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {error}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t('start_user')}: <b>{`${meName.given || ''} ${meName.surname || ''}`.trim() || '-'}</b>
            </Typography>
            <Typography variant="body2">
              {t('start_email')}: <b>{email || '-'}</b>
            </Typography>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <Card>
          <CardContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {t('start_prompt')}
            </Typography>

            <List dense>
              {mandants.map((m) => (
                <ListItemButton
                  key={m}
                  selected={m === selected}
                  onClick={() => {
                    setMandant(m);
                    navigate('/vl');
                  }}
                >
                  <ListItemText primary={m} />
                </ListItemButton>
              ))}
            </List>

            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                disabled={!selected}
                onClick={() => navigate('/vl')}
              >
                {t('start_continue')}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
