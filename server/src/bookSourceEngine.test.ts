import assert from 'node:assert/strict';
import test from 'node:test';
import { extractStageResponse, isBlockedNetworkAddress, resolvePublicHost, validateBookSourceConfig, type BookSourceConfig } from './bookSourceEngine.js';

const source = (): BookSourceConfig => ({
  schemaVersion: 1,
  sourceId: 'example.books',
  name: 'Example Books',
  version: 1,
  domains: ['books.example.com'],
  search: {
    request: { url: 'https://books.example.com/search', query: { q: '{{query}}' } },
    response: {
      format: 'json', list: { type: 'jsonpath', value: '$.items[*]' },
      fields: { id: { type: 'jsonpath', value: '$.id' }, title: { type: 'jsonpath', value: '$.title' } },
    },
  },
  detail: { request: { url: 'https://books.example.com/books/{{bookId}}' }, response: { format: 'json', fields: { title: { type: 'jsonpath', value: '$.title' } } } },
  catalog: { request: { url: 'https://books.example.com/books/{{bookId}}/chapters' }, response: { format: 'json', list: { type: 'jsonpath', value: '$.items[*]' }, fields: { id: { type: 'jsonpath', value: '$.id' }, title: { type: 'jsonpath', value: '$.title' } } } },
  chapter: { request: { url: 'https://books.example.com/chapters/{{chapterId}}' }, response: { format: 'json', fields: { content: { type: 'jsonpath', value: '$.content' } } } },
});

test('accepts a declarative JSON API source and extracts list fields', () => {
  const config = source();
  assert.deepEqual(validateBookSourceConfig(config), { valid: true, issues: [] });
  assert.deepEqual(extractStageResponse(config.search, { items: [{ id: 1, title: '孟子' }] }), [{ id: '1', title: '孟子' }]);
});

test('rejects unsafe transport, undeclared domains, headers, templates, and regex', () => {
  const config = source();
  config.search.request.url = 'http://127.0.0.1:8080/search';
  config.search.request.headers = { Cookie: 'secret' };
  config.search.request.query = { q: '{{token}}' };
  config.search.response.fields.title.regex = { pattern: '(a+)+$' };
  const result = validateBookSourceConfig(config);
  const codes = result.issues.map((issue) => issue.code);
  assert.ok(codes.includes('HTTPS_REQUIRED'));
  assert.ok(codes.includes('PORT_REJECTED'));
  assert.ok(codes.includes('DOMAIN_NOT_DECLARED'));
  assert.ok(codes.includes('HEADER_REJECTED'));
  assert.ok(codes.includes('TEMPLATE_KEY_UNSUPPORTED'));
  assert.ok(codes.includes('REGEX_UNSAFE'));
});

test('extracts ordinary HTML with CSS and the limited XPath subset', () => {
  const config = source();
  config.search.response = {
    format: 'html',
    list: { type: 'css', value: '.book' },
    fields: {
      title: { type: 'css', value: 'h2' },
      href: { type: 'xpath', value: './/a', attribute: 'href' },
    },
  };
  assert.deepEqual(extractStageResponse(config.search, '<div class="book"><h2>大学</h2><a href="/1">读</a></div>'), [{ title: '大学', href: '/1' }]);
});

test('blocks localhost, private, link-local, metadata, and mixed DNS answers', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isBlockedNetworkAddress(address), true, address);
  }
  assert.equal(isBlockedNetworkAddress('1.1.1.1'), false);
  await assert.rejects(
    () => resolvePublicHost('books.example.com', (async () => [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }]) as any),
    /SOURCE_NETWORK_BLOCKED/,
  );
});
