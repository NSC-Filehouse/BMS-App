import React from 'react';
import { Box, Button, Card, CardContent, Collapse, Typography } from '@mui/material';

function InvoiceCard({ invoice, isSupplier, t, formatDate, formatMoney }) {
  const credit = !isSupplier && invoice.isCreditNote;
  const status = invoice.paymentStatus || (invoice.isPaid ? 'paid' : 'open');
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: '8px !important', px: '10px !important', display: 'grid', gap: 0.25 }}>
        {credit && (
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            {t(invoice.creditKind === 'partial' ? 'credit_note_partial_label' : 'credit_note_label')}
          </Typography>
        )}
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {t(credit ? 'credit_note_number_label' : 'invoice_number_label')}: {invoice.invoiceNumber || '-'}
        </Typography>
        {isSupplier && invoice.supplierNumber && (
          <Typography variant="caption">{t('supplier_number_label')}: {invoice.supplierNumber}</Typography>
        )}
        <Typography variant="caption">
          {t(credit ? 'credit_note_date_label' : 'invoice_date_label')}: {formatDate(invoice.invoiceDate)}
        </Typography>
        {credit && invoice.relatedInvoiceNumber && (
          <Typography variant="caption">{t('credit_note_reference_label')}: {invoice.relatedInvoiceNumber}</Typography>
        )}
        {credit && !invoice.isAttachedCredit && (
          <Typography variant="caption" color="text.secondary">
            {t(invoice.invoiceAssignment === 'ambiguous' ? 'credit_note_invoice_ambiguous' : 'credit_note_invoice_missing')}
          </Typography>
        )}
        {!credit && (
          <Typography variant="caption">{t('due_date_label')}: {formatDate(invoice.dueDate)}</Typography>
        )}
        {!isSupplier && !credit && (
          <Typography variant="caption">{t('payment_terms_label')}: {invoice.paymentText || '-'}</Typography>
        )}
        {isSupplier && invoice.invoiceType !== null && invoice.invoiceType !== undefined && (
          <Typography variant="caption">{t('invoice_type_label')}: {invoice.invoiceType}</Typography>
        )}
        <Typography variant="caption">
          {t('amount_label')}: {formatMoney(invoice.amount)} (
          <Box component="span" sx={status === 'paid' ? { color: 'success.main', fontWeight: 700 } : undefined}>
            {t(credit && status === 'open' ? 'credit_note_status_open' : `invoice_status_${status}`)}
          </Box>)
        </Typography>
        {!credit && invoice.isFullyCredited && (
          <Typography variant="caption" color="text.secondary">{t('invoice_fully_credited')}</Typography>
        )}
        {!isSupplier && !credit && invoice.reminderStageText && (
          <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
            {t('reminder_stage_label')}: {invoice.reminderStageText}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function AttachedCredit(props) {
  const { invoice, t } = props;
  const [expanded, setExpanded] = React.useState(false);
  const panelId = React.useId();
  const buttonId = React.useId();
  return (
    <Box sx={{ ml: 2, borderLeft: '3px solid', borderLeftColor: 'divider', pl: 0.5 }}>
      <Button
        id={buttonId}
        fullWidth
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((previous) => !previous)}
        sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: '0.75rem', py: 0.25, px: 0.25, gap: 0.25 }}
      >
        <Box component="span" aria-hidden="true" sx={{ display: 'inline-block', fontSize: '1rem', transform: expanded ? 'rotate(90deg)' : undefined }}>▸</Box>
        {t(invoice.creditKind === 'partial' ? 'credit_note_partial_label' : 'credit_note_label')}: {invoice.invoiceNumber || '-'}
      </Button>
      <Collapse in={expanded} unmountOnExit>
        <Box id={panelId} role="region" aria-labelledby={buttonId} sx={{ pt: 0.25 }}>
          <InvoiceCard {...props} />
        </Box>
      </Collapse>
    </Box>
  );
}

export default function CustomerInvoiceDocuments({ items, ...props }) {
  return items.map((invoice) => (
    !props.isSupplier && invoice.isAttachedCredit
      ? <AttachedCredit key={invoice.id} invoice={invoice} {...props} />
      : <InvoiceCard key={invoice.id} invoice={invoice} {...props} />
  ));
}
