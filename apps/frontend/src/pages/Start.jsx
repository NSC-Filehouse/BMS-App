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
import { getSelectableMandants } from '../utils/mandantOptions.js';
import { useI18n } from '../utils/i18n.jsx';

export default function Start({ selectionMode = false }) {
  const [mandants, setMandants] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [meName, setMeName] = React.useState({ given: '', surname: '' });
  const navigate = useNavigate();
  const { t } = useI18n();
  const noPermissionText = t('start_no_permission_text');

  const [selected, setSelected] = React.useState(() => getMandant());

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

        const emailVal = meRes?.email || meRes?.mail || meRes?.principalName || '';
        setEmail(emailVal);
        setMeName({
          given: meRes?.givenName || '',
          surname: meRes?.surname || '',
        });
        const allowed = getSelectableMandants(res?.data, meRes);
        setMandants(allowed);

        if (!allowed.length) {
          clearMandant();
          setError(t('start_no_permission_text'));
          return;
        }

        const storedMandant = getMandant();
        const selectedLower = String(storedMandant || '').toLowerCase();
        const selectedStillAllowed = allowed.find((m) => m.name.toLowerCase() === selectedLower);
        if (storedMandant && !selectedStillAllowed) {
          clearMandant();
          setSelected('');
        } else if (selectedStillAllowed) {
          setSelected(selectedStillAllowed.name);
        }

        if (!selectionMode) {
          const mainMandant = allowed.find((mandant) => mandant.isMain);
          if (!mainMandant) {
            setError(t('start_main_mandant_unavailable'));
            return;
          }

          setMandant(mainMandant.name);
          setSelected(mainMandant.name);
          navigate('/customers', { replace: true });
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
  }, [navigate, selectionMode, t]);

  return (
    <Box sx={{ maxWidth: 720, width: '100%', minWidth: 0, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {selectionMode ? t('start_title') : t('start_loading_title')}
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
          <Typography variant="body2" sx={{ opacity: 0.8, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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
            <Typography variant="body1" sx={{ mb: 2, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {error}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t('start_user')}: <b>{`${meName.given || ''} ${meName.surname || ''}`.trim() || '-'}</b>
            </Typography>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {t('start_email')}: <b>{email || '-'}</b>
            </Typography>
            {!selectionMode && error !== noPermissionText && (
              <Button
                variant="outlined"
                sx={{ mt: 2 }}
                onClick={() => navigate('/mandants/select')}
              >
                {t('switch_mandant')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && !error && selectionMode && (
        <Card>
          <CardContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {t('start_prompt')}
            </Typography>

            <List dense>
              {mandants.map((m) => (
                <ListItemButton
                  key={m.id ?? m.name}
                  selected={m.name === selected}
                  onClick={() => {
                    setSelected(m.name);
                    setMandant(m.name);
                    navigate('/customers', { replace: true });
                  }}
                >
                  <ListItemText primary={m.name} />
                </ListItemButton>
              ))}
            </List>

            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                disabled={!selected}
                onClick={() => navigate('/customers', { replace: true })}
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
