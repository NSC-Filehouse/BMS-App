# `@filehouse/mailservice-client`

Reusable Node.js client for the Filehouse MailService ingest API.

The package sends a `MailSubmissionRequest` to `POST /api/mails`, adds the configured API key in `X-Api-Key` by default, converts Node.js binary attachment values to Base64, and exposes the service response and HTTP errors. It requires Node.js 18 or newer because it uses the built-in `fetch` implementation.

```js
const {
  MailServiceClient,
  getMailServiceConfigFromEnv,
} = require('@filehouse/mailservice-client');

const client = new MailServiceClient(getMailServiceConfigFromEnv());
const result = await client.submitMail({
  clientMessageId: 'invoice:2026-0042',
  subject: 'Rechnung',
  body: 'Im Anhang findest du die Rechnung.',
  isBodyHtml: false,
  to: [{ address: 'kunde@example.com' }],
  attachments: [{
    fileName: 'rechnung.pdf',
    contentType: 'application/pdf',
    content: pdfBuffer,
  }],
});
```

Configuration is read from `FILEHOUSE_MAIL_SERVICE_*` by default:

```dotenv
FILEHOUSE_MAIL_SERVICE_ENABLED=true
FILEHOUSE_MAIL_SERVICE_BASE_ADDRESS=https://mailservice.example/
FILEHOUSE_MAIL_SERVICE_API_KEY=fhm_application_key
FILEHOUSE_MAIL_SERVICE_API_KEY_HEADER_NAME=X-Api-Key
FILEHOUSE_MAIL_SERVICE_TIMEOUT_MS=100000
```

The package is transport-only. Application-specific recipient selection, outbox handling, logging, and any fallback transport such as EWS stay in the consuming application.
