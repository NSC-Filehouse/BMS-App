import React from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { useBackDisclosure } from './DisclosureBack.jsx';
const OptionPdfDialog=React.lazy(()=>import('./OptionPdfDialog.jsx'));
import { optionMailDocument } from '../utils/optionSource.js';

export default function OptionSourceDocuments({ offer }) {
  const { t } = useI18n();
  const [mailOpen, setMailOpen] = React.useState(false);
  const [mail, setMail] = React.useState(null);
  const [mailLoading, setMailLoading] = React.useState(false);
  const [mailError, setMailError] = React.useState('');
  const [fileOpen,setFileOpen]=React.useState(false);
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
  const pdf = offer.sourceFileMime === 'application/pdf' || /\.pdf$/i.test(offer.sourceFileName || '');
  return <Box sx={{ mt: 1 }}>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {Boolean(offer.hasSourceMail) && <Button size="small" variant="outlined" onClick={() => setMailOpen(true)}>{t('option_source_mail')}</Button>}
      {Boolean(offer.hasSourceFile) && <Button size="small" variant="outlined" onClick={()=>setFileOpen(true)}>{t(pdf ? 'option_source_pdf' : 'option_source_file')}</Button>}
    </Box>
    {!offer.hasSourceMail && !offer.hasSourceFile && <Typography variant="caption" color="text.secondary">{t('option_source_missing')}</Typography>}
    {fileOpen && <React.Suspense fallback={<CircularProgress size={22} />}><OptionPdfDialog offer={offer} onClose={()=>setFileOpen(false)} /></React.Suspense>}
    <Dialog open={mailOpen} onClose={() => setMailOpen(false)} fullWidth maxWidth="lg" aria-labelledby="option-source-mail-title">
      <DialogTitle id="option-source-mail-title">{t('option_source_mail_title')}</DialogTitle>
      <DialogContent sx={{ p: 1, height: '70vh' }}>
        {mailLoading && <CircularProgress size={24} />}
        {mailError && <Alert severity="error">{mailError}</Alert>}
        {mail?.missingImages?.length>0 && <Alert severity="warning">Einige Grafiken fehlen in der gespeicherten Mailquelle.</Alert>}
        {mail && <Box component="iframe" title={t('option_source_mail_title')} sandbox="" referrerPolicy="no-referrer"
          srcDoc={optionMailDocument(mail.body, mail.format,mail.images)} sx={{ width: '100%', height: '100%', border: 0, bgcolor: '#fff' }} />}
      </DialogContent>
      <DialogActions><Button onClick={() => setMailOpen(false)}>{t('close_label')}</Button></DialogActions>
    </Dialog>
  </Box>;
}
