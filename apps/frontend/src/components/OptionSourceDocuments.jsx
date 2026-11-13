import React from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { apiRequest, apiRequestBlob } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { useBackDisclosure } from './DisclosureBack.jsx';
import { optionMailDocument } from '../utils/optionSource.js';

export default function OptionSourceDocuments({ offer }) {
  const { t } = useI18n();
  const [mailOpen, setMailOpen] = React.useState(false);
  const [mail, setMail] = React.useState(null);
  const [mailLoading, setMailLoading] = React.useState(false);
  const [mailError, setMailError] = React.useState('');
  const [fileLoading, setFileLoading] = React.useState(false);
  const [fileError, setFileError] = React.useState('');
  useBackDisclosure(mailOpen, () => setMailOpen(false));
  React.useEffect(() => {
    if (!mailOpen) return undefined;
    let active = true;
    setMail(null); setMailError(''); setMailLoading(true);
    apiRequest(`/options/${offer.id}/source/mail`)
      .then(response => { if (active) setMail(response.data); })
      .catch(error => { if (active) setMailError(error.message || t('loading_error')); })
      .finally(() => { if (active) setMailLoading(false); });
    return () => { active = false; };
  }, [mailOpen, offer.id, t]);
  async function openFile() {
    const popup = window.open('', '_blank');
    if (!popup) { setFileError(t('order_pdf_popup_blocked')); return; }
    popup.opener = null;
    setFileLoading(true); setFileError('');
    try {
      const blob = await apiRequestBlob(`/options/${offer.id}/source/file`);
      const url = URL.createObjectURL(blob);
      popup.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      popup.close(); setFileError(error.message || t('loading_error'));
    } finally { setFileLoading(false); }
  }
  const pdf = offer.sourceFileMime === 'application/pdf' || /\.pdf$/i.test(offer.sourceFileName || '');
  return <Box sx={{ mt: 1 }}>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {Boolean(offer.hasSourceMail) && <Button size="small" variant="outlined" onClick={() => setMailOpen(true)}>{t('option_source_mail')}</Button>}
      {Boolean(offer.hasSourceFile) && <Button size="small" variant="outlined" disabled={fileLoading} onClick={openFile}>{t(pdf ? 'option_source_pdf' : 'option_source_file')}</Button>}
    </Box>
    {!offer.hasSourceMail && !offer.hasSourceFile && <Typography variant="caption" color="text.secondary">{t('option_source_missing')}</Typography>}
    {fileLoading && <CircularProgress size={20} sx={{ mt: 1 }} />}
    {fileError && <Alert severity="error" sx={{ mt: 1 }}>{fileError}</Alert>}
    <Dialog open={mailOpen} onClose={() => setMailOpen(false)} fullWidth maxWidth="lg" aria-labelledby="option-source-mail-title">
      <DialogTitle id="option-source-mail-title">{t('option_source_mail_title')}</DialogTitle>
      <DialogContent sx={{ p: 1, height: '70vh' }}>
        {mailLoading && <CircularProgress size={24} />}
        {mailError && <Alert severity="error">{mailError}</Alert>}
        {mail && <Box component="iframe" title={t('option_source_mail_title')} sandbox="" referrerPolicy="no-referrer"
          srcDoc={optionMailDocument(mail.body, mail.format)} sx={{ width: '100%', height: '100%', border: 0, bgcolor: '#fff' }} />}
      </DialogContent>
      <DialogActions><Button onClick={() => setMailOpen(false)}>{t('close_label')}</Button></DialogActions>
    </Dialog>
  </Box>;
}
