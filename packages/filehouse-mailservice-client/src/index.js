'use strict';

class MailServiceClientError extends Error {
  constructor(message, { statusCode = null, responseBody = null, code = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MailServiceClientError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.code = code;
  }
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstDefined(source, ...keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) return source[key];
  }
  return undefined;
}

function setIfDefined(target, key, value) {
  if (value !== undefined && value !== null) target[key] = value;
}

function toIsoString(value, fieldName) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError(`${fieldName} must be a valid date.`);
    return value.toISOString();
  }
  const text = asText(value);
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${fieldName} must be a valid date or ISO date string.`);
  return date.toISOString();
}

function toBase64(value, fieldName) {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value)).toString('base64');
  throw new TypeError(`${fieldName} must be a Buffer, Uint8Array, ArrayBuffer, or Base64 string.`);
}

function mapRecipient(recipient, fieldName) {
  const source = recipient || {};
  const result = {
    Address: asText(firstDefined(source, 'address', 'Address')),
  };
  setIfDefined(result, 'DisplayName', firstDefined(source, 'displayName', 'DisplayName'));
  if (!result.Address) throw new TypeError(`${fieldName}.address is required.`);
  return result;
}

function mapRecipients(value, fieldName) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new TypeError(`${fieldName} must be an array.`);
  return value.map((recipient, index) => mapRecipient(recipient, `${fieldName}[${index}]`));
}

function mapAttachment(attachment, index) {
  const source = attachment || {};
  const fileName = asText(firstDefined(source, 'fileName', 'FileName'));
  if (!fileName) throw new TypeError(`attachments[${index}].fileName is required.`);

  const contentBase64 = firstDefined(source, 'contentBase64', 'ContentBase64');
  const content = contentBase64 !== undefined
    ? toBase64(contentBase64, `attachments[${index}].contentBase64`)
    : toBase64(firstDefined(source, 'content', 'Content'), `attachments[${index}].content`);
  if (!content) throw new TypeError(`attachments[${index}].content must not be empty.`);

  const result = { FileName: fileName, Content: content };
  setIfDefined(result, 'ContentType', firstDefined(source, 'contentType', 'ContentType'));
  return result;
}

function mapCalendarAttendee(attendee, index) {
  const source = attendee || {};
  const result = {
    Address: asText(firstDefined(source, 'address', 'Address')),
  };
  if (!result.Address) throw new TypeError(`calendar.attendees[${index}].address is required.`);
  setIfDefined(result, 'DisplayName', firstDefined(source, 'displayName', 'DisplayName'));
  const required = firstDefined(source, 'required', 'Required');
  if (required !== undefined && required !== null) result.Required = Boolean(required);
  return result;
}

function mapCalendar(calendar) {
  if (calendar === undefined || calendar === null) return undefined;
  const source = calendar;
  const result = {
    Summary: asText(firstDefined(source, 'summary', 'Summary')),
    StartUtc: toIsoString(firstDefined(source, 'startUtc', 'StartUtc'), 'calendar.startUtc'),
    EndUtc: toIsoString(firstDefined(source, 'endUtc', 'EndUtc'), 'calendar.endUtc'),
  };
  if (!result.Summary) throw new TypeError('calendar.summary is required.');
  if (!result.StartUtc) throw new TypeError('calendar.startUtc is required.');
  if (!result.EndUtc) throw new TypeError('calendar.endUtc is required.');
  for (const [key, fieldName] of [['Description', 'description'], ['Location', 'location'], ['Uid', 'uid'], ['Method', 'method']]) {
    setIfDefined(result, key, firstDefined(source, fieldName, key));
  }
  const attendees = firstDefined(source, 'attendees', 'Attendees');
  if (attendees !== undefined && attendees !== null) {
    if (!Array.isArray(attendees)) throw new TypeError('calendar.attendees must be an array.');
    result.Attendees = attendees.map(mapCalendarAttendee);
  }
  return result;
}

function toMailSubmissionRequest(request = {}) {
  const source = request || {};
  const body = firstDefined(source, 'body', 'Body');
  if (body === undefined || body === null) throw new TypeError('body is required.');

  const result = {
    Body: String(body),
  };
  for (const [key, fields] of [
    ['ClientMessageId', ['clientMessageId', 'ClientMessageId']],
    ['Subject', ['subject', 'Subject']],
    ['FromAddress', ['fromAddress', 'FromAddress']],
    ['FromDisplayName', ['fromDisplayName', 'FromDisplayName']],
  ]) {
    setIfDefined(result, key, firstDefined(source, ...fields));
  }

  const isBodyHtml = firstDefined(source, 'isBodyHtml', 'IsBodyHtml');
  result.IsBodyHtml = isBodyHtml === undefined || isBodyHtml === null ? true : Boolean(isBodyHtml);

  const to = mapRecipients(firstDefined(source, 'to', 'To'), 'to');
  const cc = mapRecipients(firstDefined(source, 'cc', 'Cc'), 'cc');
  const bcc = mapRecipients(firstDefined(source, 'bcc', 'Bcc'), 'bcc');
  if (!(to?.length || cc?.length || bcc?.length)) {
    throw new TypeError('At least one recipient is required across to, cc, and bcc.');
  }
  setIfDefined(result, 'To', to);
  setIfDefined(result, 'Cc', cc);
  setIfDefined(result, 'Bcc', bcc);

  const attachments = firstDefined(source, 'attachments', 'Attachments');
  if (attachments !== undefined && attachments !== null) {
    if (!Array.isArray(attachments)) throw new TypeError('attachments must be an array.');
    result.Attachments = attachments.map(mapAttachment);
  }
  setIfDefined(result, 'Calendar', mapCalendar(firstDefined(source, 'calendar', 'Calendar')));
  return result;
}

function mapSubmissionResponse(body) {
  const source = body || {};
  return {
    id: firstDefined(source, 'id', 'Id'),
    clientMessageId: firstDefined(source, 'clientMessageId', 'ClientMessageId'),
    status: firstDefined(source, 'status', 'Status'),
    duplicate: Boolean(firstDefined(source, 'duplicate', 'Duplicate')),
    raw: body,
  };
}

function normalizeBaseAddress(value) {
  const text = asText(value);
  if (!text) throw new TypeError('baseAddress is required.');
  let url;
  try {
    url = new URL(text);
  } catch (error) {
    throw new TypeError('baseAddress must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('baseAddress must use HTTP or HTTPS.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function combineAbortSignals(userSignal, timeoutMs) {
  const controller = new AbortController();
  let timeout;
  const abort = () => controller.abort(userSignal?.reason || new Error('MailService request aborted.'));
  if (userSignal) {
    if (userSignal.aborted) abort();
    else userSignal.addEventListener('abort', abort, { once: true });
  }
  if (timeoutMs > 0) timeout = setTimeout(() => controller.abort(new Error('MailService request timed out.')), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeout) clearTimeout(timeout);
      if (userSignal) userSignal.removeEventListener('abort', abort);
    },
  };
}

class MailServiceClient {
  constructor({
    baseAddress,
    apiKey,
    apiKeyHeaderName = 'X-Api-Key',
    timeoutMs = 100000,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.baseAddress = normalizeBaseAddress(baseAddress);
    this.apiKey = asText(apiKey);
    if (!this.apiKey) throw new TypeError('apiKey is required.');
    this.apiKeyHeaderName = asText(apiKeyHeaderName) || 'X-Api-Key';
    this.timeoutMs = Number(timeoutMs);
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new TypeError('timeoutMs must be a positive number.');
    }
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('A fetch implementation is required. Node.js 18 or newer provides fetch globally.');
    }
    this.fetchImpl = fetchImpl;
  }

  url(path) {
    return new URL(path, this.baseAddress).toString();
  }

  async request(method, path, { body, signal } = {}) {
    const abort = combineAbortSignals(signal, this.timeoutMs);
    try {
      const headers = {
        Accept: 'application/json',
        [this.apiKeyHeaderName]: this.apiKey,
      };
      const options = { method, headers, signal: abort.signal };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
      let response;
      try {
        response = await this.fetchImpl(this.url(path), options);
      } catch (error) {
        const timedOut = abort.signal.aborted && !signal?.aborted;
        throw new MailServiceClientError(
          timedOut ? 'MailService request timed out.' : 'MailService request failed before receiving a response.',
          { code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', cause: error },
        );
      }

      const responseBody = await response.text();
      let parsedBody = null;
      if (responseBody) {
        try {
          parsedBody = JSON.parse(responseBody);
        } catch {
          parsedBody = responseBody;
        }
      }
      if (!response.ok) {
        throw new MailServiceClientError(
          `MailService returned HTTP ${response.status}.`,
          { statusCode: response.status, responseBody: parsedBody, code: 'HTTP_ERROR' },
        );
      }
      return parsedBody;
    } finally {
      abort.cleanup();
    }
  }

  async submitMail(request, { signal } = {}) {
    const response = await this.request('POST', 'api/mails', {
      body: toMailSubmissionRequest(request),
      signal,
    });
    return mapSubmissionResponse(response);
  }

  async getMail(id, { signal } = {}) {
    const mailId = asText(id);
    if (!mailId) throw new TypeError('id is required.');
    if (mailId.includes('/')) throw new TypeError('id must not contain a slash.');
    return this.request('GET', `api/mails/${encodeURIComponent(mailId)}`, { signal });
  }

  async getMails({ page = 1, pageSize = 50, signal } = {}) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.request('GET', `api/mails?${params.toString()}`, { signal });
  }
}

function getMailServiceConfigFromEnv(env = process.env, prefix = 'FILEHOUSE_MAIL_SERVICE_') {
  const toInt = (value, fallback) => {
    const result = Number.parseInt(value, 10);
    return Number.isFinite(result) ? result : fallback;
  };
  return {
    enabled: String(env[`${prefix}ENABLED`] ?? 'true').toLowerCase() === 'true',
    baseAddress: asText(env[`${prefix}BASE_ADDRESS`]),
    apiKey: asText(env[`${prefix}API_KEY`]),
    apiKeyHeaderName: asText(env[`${prefix}API_KEY_HEADER_NAME`]) || 'X-Api-Key',
    timeoutMs: toInt(env[`${prefix}TIMEOUT_MS`], 100000),
  };
}

module.exports = {
  MailServiceClient,
  MailServiceClientError,
  getMailServiceConfigFromEnv,
  toMailSubmissionRequest,
};
