import type { BookSourceConfig, Selector } from './bookSourceEngine.js';
import type { CompatibilityIssue } from './bookSourceEngine.js';

type LegadoRule = Record<string, unknown>;
const forbidden = /<js>|@js:|javascript:|eval\s*\(|cookie|login|webview|captcha|decrypt/i;

function selector(value: unknown, path: string, issues: CompatibilityIssue[]): Selector {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ path, code: 'LEGADO_RULE_MISSING', message: 'Required Legado rule is missing.' });
    return { type: 'text', value: '@' };
  }
  if (forbidden.test(value)) {
    issues.push({ path, code: 'LEGADO_CAPABILITY_UNSUPPORTED', message: 'JavaScript, login, Cookies, WebView, CAPTCHA, and decryption are not supported.' });
    return { type: 'text', value: '@' };
  }
  if (value.startsWith('@json:')) return { type: 'jsonpath', value: value.slice(6) };
  if (value.startsWith('@css:')) return { type: 'css', value: value.slice(5) };
  if (value.startsWith('@xpath:')) return { type: 'xpath', value: value.slice(7) };
  if (value.startsWith('$')) return { type: 'jsonpath', value };
  if (value.startsWith('//') || value.startsWith('.//')) return { type: 'xpath', value };
  return { type: 'css', value };
}

const stage = (
  url: unknown,
  rules: LegadoRule,
  listKey: string | null,
  fields: Record<string, string>,
  path: string,
  issues: CompatibilityIssue[],
) => {
  const requestUrl = typeof url === 'string' ? url.replace(/\{\{key\}\}/g, '{{query}}') : '';
  if (!requestUrl || forbidden.test(requestUrl)) issues.push({ path: `${path}.url`, code: 'LEGADO_URL_UNSUPPORTED', message: 'Legado URL is missing or uses unsupported executable syntax.' });
  const format = Object.values(rules).some((value) => typeof value === 'string' && (value.startsWith('@json:') || value.startsWith('$'))) ? 'json' as const : 'html' as const;
  return {
    request: { url: requestUrl, method: 'GET' as const },
    response: {
      format,
      ...(listKey ? { list: selector(rules[listKey], `${path}.${listKey}`, issues) } : {}),
      fields: Object.fromEntries(Object.entries(fields).map(([field, key]) => [field, selector(rules[key], `${path}.${key}`, issues)])),
    },
  };
};

export function convertLegadoSafeSubset(input: unknown): { config: BookSourceConfig | null; issues: CompatibilityIssue[] } {
  const issues: CompatibilityIssue[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { config: null, issues: [{ path: '$', code: 'LEGADO_CONFIG_INVALID', message: 'Legado source must be an object.' }] };
  const source = input as Record<string, unknown>;
  if (forbidden.test(JSON.stringify(source))) issues.push({ path: '$', code: 'LEGADO_CAPABILITY_UNSUPPORTED', message: 'Source contains executable, login, Cookie, WebView, CAPTCHA, or decryption rules.' });
  const baseUrl = typeof source.bookSourceUrl === 'string' ? source.bookSourceUrl : '';
  let hostname = '';
  try { hostname = new URL(baseUrl).hostname; } catch { issues.push({ path: 'bookSourceUrl', code: 'LEGADO_URL_UNSUPPORTED', message: 'bookSourceUrl must be HTTPS.' }); }
  const searchRules = (source.ruleSearch ?? {}) as LegadoRule;
  const detailRules = (source.ruleBookInfo ?? {}) as LegadoRule;
  const tocRules = (source.ruleToc ?? {}) as LegadoRule;
  const contentRules = (source.ruleContent ?? {}) as LegadoRule;
  const sourceId = typeof source.sourceId === 'string' ? source.sourceId : `legado.${hostname.replace(/[^a-z0-9]+/gi, '.').replace(/^\.|\.$/g, '').toLowerCase()}`;
  const config: BookSourceConfig = {
    schemaVersion: 1,
    sourceId,
    name: typeof source.bookSourceName === 'string' ? source.bookSourceName : sourceId,
    version: Number.isInteger(source.version) ? Number(source.version) : 1,
    domains: hostname ? [hostname.toLowerCase()] : [],
    search: stage(source.searchUrl, searchRules, 'bookList', { id: 'bookUrl', title: 'name', author: 'author' }, 'ruleSearch', issues),
    detail: stage(source.bookInfoUrl ?? '{{bookId}}', detailRules, null, { title: 'name', author: 'author' }, 'ruleBookInfo', issues),
    catalog: stage(source.tocUrl ?? '{{bookId}}', tocRules, 'chapterList', { id: 'chapterUrl', title: 'chapterName' }, 'ruleToc', issues),
    chapter: stage(source.contentUrl ?? '{{chapterId}}', contentRules, null, { content: 'content' }, 'ruleContent', issues),
  };
  return { config: issues.length === 0 ? config : null, issues };
}
