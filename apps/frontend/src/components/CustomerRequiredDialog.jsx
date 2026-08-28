import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useI18n } from '../utils/i18n.jsx';

export default function CustomerRequiredDialog({ open, onClose, onChoose }) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('customer_required_title')}</DialogTitle>
      <DialogContent>
        <Typography>{t('customer_required_message')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('no_label')}</Button>
        <Button variant="contained" onClick={onChoose}>
          {t('customer_required_choose')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
