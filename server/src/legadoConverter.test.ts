import assert from 'node:assert/strict';
import test from 'node:test';
import { convertLegadoSafeSubset } from './legadoConverter.js';

test('converts the declarative Legado subset into Scene Read schema', () => {
  const result = convertLegadoSafeSubset({
    sourceId: 'legado.example', bookSourceName: '示例书源', bookSourceUrl: 'https://books.example.com',
    searchUrl: 'https://books.example.com/search?q={{key}}', bookInfoUrl: 'https://books.example.com/book/{{bookId}}',
    tocUrl: 'https://books.example.com/book/{{bookId}}/toc', contentUrl: 'https://books.example.com/chapter/{{chapterId}}',
    ruleSearch: { bookList: '@json:$.items[*]', bookUrl: '@json:$.id', name: '@json:$.title', author: '@json:$.author' },
    ruleBookInfo: { name: '@json:$.title', author: '@json:$.author' },
    ruleToc: { chapterList: '@json:$.items[*]', chapterUrl: '@json:$.id', chapterName: '@json:$.title' },
    ruleContent: { content: '@json:$.content' },
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.config?.search.request.url.includes('{{query}}'), true);
});

test('reports unsupported executable Legado capabilities instead of running them', () => {
  const result = convertLegadoSafeSubset({
    bookSourceName: '危险书源', bookSourceUrl: 'https://books.example.com', searchUrl: 'https://books.example.com?q={{key}}',
    ruleSearch: { bookList: '<js>eval(result)</js>' },
  });
  assert.equal(result.config, null);
  assert.ok(result.issues.some((issue) => issue.code === 'LEGADO_CAPABILITY_UNSUPPORTED'));
});
