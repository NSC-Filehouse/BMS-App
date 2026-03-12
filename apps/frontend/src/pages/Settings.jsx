import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Switch,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { getCurrentPushSubscription, isPushSupported, subscribeToPush } from '../utils/push.js';

export default function Settings() {
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [data, setData] = React.useState({ vapidPublicKey: '', subscribed: false, mandants: [] });
  const [supported] = React.useState(() => isPushSupported());
  const [permission, setPermission] = React.useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'));
  const hasVapidKey = Boolean(String(data?.vapidPublicKey || '').trim());

  const loadSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest('/push/settings');
      const currentSubscription = await getCurrentPushSubscription();
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
      setData({
        vapidPublicKey: String(res?.data?.vapidPublicKey || ''),
        subscribed: Boolean(currentSubscription) && Boolean(res?.data?.subscribed),
        mandants: Array.isArray(res?.data?.mandants) ? res.data.mandants : [],
      });
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleEnablePush = React.useCallback(async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      if (!hasVapidKey) {
        throw new Error(t('push_missing_config'));
      }
      const subscription = await subscribeToPush(data.vapidPublicKey);
      await apiRequest('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription?.toJSON ? subscription.toJSON() : subscription,
          language: lang,
        }),
      });
      await loadSettings();
      setSuccess(t('push_enabled_success'));
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setSaving(false);
    }
  }, [data.vapidPublicKey, hasVapidKey, lang, loadSettings, t]);

  const handleDisablePush = React.useCallback(async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const subscription = await getCurrentPushSubscription();
      const endpoint = subscription?.endpoint || '';
      if (subscription) {
        await subscription.unsubscribe();
      }
      if (endpoint) {
        await apiRequest('/push/subscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint }),
        });
      }
      await loadSettings();
      setSuccess(t('push_disabled_success'));
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setSaving(false);
    }
  }, [loadSettings, t]);

  const handleMandantToggle = React.useCallback(async (companyId, enabled) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const nextMandants = (Array.isArray(data.mandants) ? data.mandants : []).map((item) => (
        Number(item.companyId) === Number(companyId) ? { ...item, enabled } : item
      ));
      const res = await apiRequest('/push/settings', {
        method: 'PUT',
        body: JSON.stringify({
          settings: nextMandants.map((item) => ({
            companyId: item.companyId,
            enabled: Boolean(item.enabled),
          })),
        }),
      });
      setData((prev) => ({
        ...prev,
        mandants: Array.isArray(res?.data?.mandants) ? res.data.mandants : nextMandants,
      }));
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setSaving(false);
    }
  }, [data.mandants, t]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {!loading && (
        <Card>
          <CardContent sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="subtitle1">
                {t('push_settings_title')}
              </Typography>
              <IconButton aria-label="back-to-timeline" onClick={() => navigate('/timeline')} size="small">
                <ArrowBackIcon />
              </IconButton>
            </Box>

            {!supported && (
              <Alert severity="warning">
                {t('push_not_supported')}
              </Alert>
            )}

            {supported && (
              <>
                <Typography variant="body2" color="text.secondary">
                  {permission === 'granted'
                    ? t('push_permission_granted')
                    : permission === 'denied'
                      ? t('push_permission_denied')
                      : t('push_permission_default')}
                </Typography>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {!data.subscribed ? (
                    <Button variant="contained" onClick={handleEnablePush} disabled={saving}>
                      {t('push_enable_button')}
                    </Button>
                  ) : (
                    <Button variant="outlined" color="error" onClick={handleDisablePush} disabled={saving}>
                      {t('push_disable_button')}
                    </Button>
                  )}
                </Box>

                <Typography variant="subtitle2" color="text.secondary">
                  {t('push_mandants_title')}
                </Typography>

                <Box sx={{ display: 'grid', gap: 0.5 }}>
                  {(Array.isArray(data.mandants) ? data.mandants : []).map((mandant) => (
                    <FormControlLabel
                      key={mandant.companyId}
                      control={(
                        <Switch
                          checked={Boolean(mandant.enabled)}
                          onChange={(event) => handleMandantToggle(mandant.companyId, event.target.checked)}
                          disabled={saving || !data.subscribed}
                        />
                      )}
                      label={mandant.name || '-'}
                    />
                  ))}
                </Box>

                {!data.subscribed && (
                  <Typography variant="caption" color="text.secondary">
                    {hasVapidKey ? t('push_enable_hint') : t('push_missing_config')}
                  </Typography>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
