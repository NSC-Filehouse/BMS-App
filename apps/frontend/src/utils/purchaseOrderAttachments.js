export function purchaseOrderRequestBody(order, files = order.pendingAttachmentFiles || []) {
  const body = new FormData();
  const { pendingAttachmentFiles, attachments, hadPendingAttachments, ...values } = order;
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) body.append(key, value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  body.set('attachmentCount', String(order.attachmentCount ?? files.length));
  files.forEach((file) => body.append('attachment', file));
  return body;
}
