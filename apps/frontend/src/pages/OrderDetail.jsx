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
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { getMandant } from '../utils/mandant.js';

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  return `${value} EUR`;
}

function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('de-DE');
}

function InfoRow({ label, value }) {
  return (
    <Box
      sx={{
        display: { xs: 'grid', md: 'flex' },
        gridTemplateColumns: 'minmax(0, 1fr)',
        alignItems: { xs: 'start', md: 'center' },
        justifyContent: 'space-between',
        gap: { xs: 0.25, md: 2 },
        py: 0.75,
        minWidth: 0,
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          width: { xs: '100%', md: '60%' },
          maxWidth: { xs: '100%', md: '60%' },
          minWidth: 0,
          textAlign: { xs: 'left', md: 'right' },
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value || ''}
      </Typography>
    </Box>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [editOpen, setEditOpen] = React.useState(false);
  const [editAmount, setEditAmount] = React.useState('');
  const [editDate, setEditDate] = React.useState('');
  const [editComment, setEditComment] = React.useState('');
  const [editLoading, setEditLoading] = React.useState(false);
  const [editError, setEditError] = React.useState('');

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
        setError(e?.message || t('loading_error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [id, t]);

  const mandant = getMandant();
  const isReserved = Boolean(item?.isReserved);
  const canEdit = Boolean(item?.canEdit);
  const handleBack = React.useCallback(() => {
    const fromOrders = location.state?.fromOrders;
    if (fromOrders) {
      navigate('/orders', { state: { listState: fromOrders } });
      return;
    }
    navigate(-1);
  }, [location.state, navigate]);

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', overflowX: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, minWidth: 0 }}>
        <IconButton aria-label="back" onClick={handleBack}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {item?.orderNumber || id}
        </Typography>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {!loading && !error && item && (
        <Card sx={{ width: '100%', minWidth: 0 }}>
          <CardContent sx={{ pt: 2, minWidth: 0 }}>
            {item?.isReserved && (
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {canEdit && (
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ whiteSpace: 'nowrap', minWidth: 0, px: 1.5 }}
                    onClick={() => {
                      setEditAmount(String(item.reserveAmount || ''));
                      setEditDate(item.reservationDate ? String(item.reservationDate).slice(0, 10) : '');
                      setEditComment(item.comment || '');
                      setEditError('');
                      setEditOpen(true);
                    }}
                  >
                    {t('edit_label')}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    sx={{ whiteSpace: 'nowrap', minWidth: 0, px: 1.5 }}
                    onClick={async () => {
                      try {
                        setError('');
                        setSuccess('');
                        await apiRequest(`/orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
                        setSuccess(t('reservation_deleted'));
                        navigate('/orders');
                      } catch (e) {
                        setError(e?.message || t('loading_error'));
                      }
                    }}
                  >
                    {t('delete_label')}
                  </Button>
                )}
              </Box>
            )}
            {!isReserved && <InfoRow label={t('order_customer')} value={item.clientName} />}
            <InfoRow label={t('order_distributor')} value={mandant} />
            <InfoRow label={t('order_article')} value={item.article} />
            <InfoRow label={t('order_price')} value={formatPrice(item.price)} />
            {item?.isReserved && <InfoRow label={t('order_reserve_amount')} value={item.reserveAmount ? `${item.reserveAmount} ${item.unit || 'kg'}` : ''} />}
            <InfoRow label={t('order_closing')} value={item.closingDate} />
            <InfoRow label={t('order_reserved_until')} value={formatDateOnly(item.reservationDate)} />
            {!isReserved && <InfoRow label={t('order_created')} value={item.createdAt} />}
            <InfoRow label={t('order_owner')} value={item.receivedFrom} />
            <InfoRow label={t('order_passed_to')} value={item.passedTo} />
            {item?.isReserved && <InfoRow label={t('order_comment')} value={item.comment} />}
            <Divider sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      )}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('reservation_edit')}</DialogTitle>
        <DialogContent>
          {editError && <Alert severity="error" sx={{ mb: 1 }}>{editError}</Alert>}
          <TextField
            margin="dense"
            fullWidth
            type="number"
            label={t('product_reserve_amount')}
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            inputProps={{ min: 1, step: 'any' }}
          />
          <TextField
            margin="dense"
            fullWidth
            type="date"
            label={t('product_reserve_until')}
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            margin="dense"
            fullWidth
            multiline
            minRows={2}
            label={t('order_comment')}
            value={editComment}
            onChange={(e) => setEditComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editLoading}>{t('back_label')}</Button>
          <Button
            variant="contained"
            disabled={editLoading || !editAmount || !editDate}
            onClick={async () => {
              try {
                setEditLoading(true);
                setEditError('');
                setSuccess('');
                await apiRequest(`/orders/${encodeURIComponent(id)}`, {
                  method: 'PUT',
                  body: JSON.stringify({
                    amount: Number(editAmount),
                    reservationEndDate: editDate,
                    comment: editComment || '',
                  }),
                });
                setEditOpen(false);
                setSuccess(t('reservation_updated'));
                const res = await apiRequest(`/orders/${encodeURIComponent(id)}`);
                setItem(res?.data || null);
              } catch (e) {
                setEditError(e?.message || t('loading_error'));
              } finally {
                setEditLoading(false);
              }
            }}
          >
            {t('save_label')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
