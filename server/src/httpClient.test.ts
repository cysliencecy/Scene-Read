import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExternalFetch, resolveProxyConfiguration } from './httpClient.js';

test('external fetch stays direct when no proxy environment is configured', async () => {
  const directResponse = new Response('direct');
  const directFetch = async () => directResponse;
  let proxyFactoryCalls = 0;

  const fetchImpl = createExternalFetch(
    {},
    directFetch as typeof fetch,
    () => {
      proxyFactoryCalls += 1;
      return async () => new Response('proxy');
    },
  );

  assert.strictEqual(await fetchImpl('https://example.com'), directResponse);
  assert.equal(proxyFactoryCalls, 0);
});

test('external fetch uses the configured HTTPS proxy and preserves NO_PROXY', async () => {
  const environment = {
    HTTPS_PROXY: 'http://127.0.0.1:7897',
    NO_PROXY: 'localhost,127.0.0.1',
  };
  let receivedConfiguration: ReturnType<typeof resolveProxyConfiguration> | undefined;
  const proxyResponse = new Response('proxy');

  const fetchImpl = createExternalFetch(
    environment,
    (async () => new Response('direct')) as typeof fetch,
    (configuration) => {
      receivedConfiguration = configuration;
      return async () => proxyResponse;
    },
  );

  assert.strictEqual(await fetchImpl('https://zh.wikisource.org/w/api.php'), proxyResponse);
  assert.ok(receivedConfiguration);
  assert.deepEqual(receivedConfiguration, {
    httpProxy: undefined,
    httpsProxy: 'http://127.0.0.1:7897',
    noProxy: 'localhost,127.0.0.1',
  });
});
