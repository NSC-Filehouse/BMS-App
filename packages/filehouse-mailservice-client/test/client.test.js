'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MailServiceClient,
  MailServiceClientError,
  getMailServiceConfigFromEnv,
  toMailSubmissionRequest,
} = require('../src');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === undefined ? '' : JSON.stringify(body),
  };
}

test('maps a Node mail request to the Filehouse contract', () => {
  const result = toMailSubmissionRequest({
    clientMessageId: 'bms-app:order:42',
    subject: 'Test',
    body: '<p>Hallo</p>',
    to: [{ address: 'kunde@example.com', displayName: 'Kunde' }],
    attachments: [{ fileName: 'test.pdf', contentType: 'application/pdf', content: Buffer.from('pdf') }],
  });

  assert.deepEqual(result, {
    ClientMessageId: 'bms-app:order:42',
    Subject: 'Test',
    Body: '<p>Hallo</p>',
    IsBodyHtml: true,
    To: [{ Address: 'kunde@example.com', DisplayName: 'Kunde' }],
    Attachments: [{ FileName: 'test.pdf', ContentType: 'application/pdf', Content: 'cGRm' }],
  });
});

test('submits with API key and normalizes PascalCase response', async () => {
  let call;
  const client = new MailServiceClient({
    baseAddress: 'https://db03.domkimaz.de.local:3300',
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      call = { url, options, body: JSON.parse(options.body) };
      return response(201, {
        Id: 'mail-id',
        ClientMessageId: 'bms-app:order:42',
        Status: 'Pending',
        Duplicate: false,
      });
    },
  });

  const result = await client.submitMail({
    clientMessageId: 'bms-app:order:42',
    body: 'Test',
    isBodyHtml: false,
    to: [{ address: 'test@example.com' }],
  });

  assert.equal(call.url, 'https://db03.domkimaz.de.local:3300/api/mails');
  assert.equal(call.options.headers['X-Api-Key'], 'test-key');
  assert.equal(call.body.IsBodyHtml, false);
  assert.deepEqual(result, {
    id: 'mail-id',
    clientMessageId: 'bms-app:order:42',
    status: 'Pending',
    duplicate: false,
    raw: {
      Id: 'mail-id',
      ClientMessageId: 'bms-app:order:42',
      Status: 'Pending',
      Duplicate: false,
    },
  });
});

test('exposes HTTP status and response body without exposing the API key in the error', async () => {
  const client = new MailServiceClient({
    baseAddress: 'https://mailservice.example/',
    apiKey: 'secret-key',
    fetchImpl: async () => response(401, { error: 'Unauthorized' }),
  });

  await assert.rejects(
    client.submitMail({ body: 'Test', to: [{ address: 'test@example.com' }] }),
    (error) => {
      assert.ok(error instanceof MailServiceClientError);
      assert.equal(error.statusCode, 401);
      assert.deepEqual(error.responseBody, { error: 'Unauthorized' });
      assert.doesNotMatch(error.message, /secret-key/);
      return true;
    },
  );
});

test('reads reusable client configuration from environment variables', () => {
  assert.deepEqual(
    getMailServiceConfigFromEnv({
      FILEHOUSE_MAIL_SERVICE_ENABLED: 'false',
      FILEHOUSE_MAIL_SERVICE_BASE_ADDRESS: 'https://mailservice.example/',
      FILEHOUSE_MAIL_SERVICE_API_KEY: 'test-key',
      FILEHOUSE_MAIL_SERVICE_TIMEOUT_MS: '15000',
    }),
    {
      enabled: false,
      baseAddress: 'https://mailservice.example/',
      apiKey: 'test-key',
      apiKeyHeaderName: 'X-Api-Key',
      timeoutMs: 15000,
    },
  );
});
