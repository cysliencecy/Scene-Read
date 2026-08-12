import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { load } from 'cheerio';
import { Agent, fetch as undiciFetch } from 'undici';

export type Selector = {
  type: 'jsonpath' | 'css' | 'xpath' | 'text';
  value: string;
  attribute?: string;
  regex?: { pattern: string; replacement?: string };
};

export type SourceStage = {
  request: {
    url: string;
    method?: 'GET' | 'POST';
    query?: Record<string, string>;
    body?: Record<string, string>;
    headers?: Record<string, string>;
  };
  response: {
    format: 'json' | 'html';
    list?: Selector;
    fields: Record<string, Selector>;
  };
};

export type BookSourceConfig = {
  schemaVersion: 1;
  sourceId: string;
  name: string;
  version: number;
  domains: string[];
  search: SourceStage;
  detail: SourceStage;
  catalog: SourceStage;
  chapter: SourceStage;
};

export type CompatibilityIssue = { path: string; code: string; message: string };
export type BookSourceValidation = { valid: boolean; issues: CompatibilityIssue[] };

const SAFE_HEADERS = new Set(['accept', 'content-type', 'user-agent']);
const TEMPLATE_KEYS = new Set(['query', 'bookId', 'chapterId', 'page']);
const SOURCE_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const templateKeys = (value: string) => [...value.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].map((match) => match[1]);
const unsafeRegex = (pattern: string) =>
  pattern.length > 200 || /\\[1-9]|\(\?[:=!<]|\([^)]*(?:\*|\+|\{\d+,?\})[^)]*\)(?:\*|\+|\{\d+,?\})/.test(pattern);

function validateSelector(selector: Selector, path: string, format: SourceStage['response']['format'], issues: CompatibilityIssue[]) {
  if (!selector || typeof selector !== 'object') {
    issues.push({ path, code: 'SELECTOR_REQUIRED', message: 'Selector must be an object.' });
    return;
  }
  if (!['jsonpath', 'css', 'xpath', 'text'].includes(selector.type)) {
    issues.push({ path, code: 'SELECTOR_TYPE_UNSUPPORTED', message: 'Only JSONPath, CSS, XPath, and text selectors are supported.' });
  }
  if (format === 'json' && !['jsonpath', 'text'].includes(selector.type)) {
    issues.push({ path, code: 'SELECTOR_FORMAT_MISMATCH', message: 'JSON responses require JSONPath or text selectors.' });
  }
  if (format === 'html' && selector.type === 'jsonpath') {
    issues.push({ path, code: 'SELECTOR_FORMAT_MISMATCH', message: 'HTML responses do not support JSONPath.' });
  }
  if (typeof selector.value !== 'string' || selector.value.length === 0 || selector.value.length > 500) {
    issues.push({ path, code: 'SELECTOR_INVALID', message: 'Selector value must contain 1–500 characters.' });
  }
  if (selector.regex && unsafeRegex(selector.regex.pattern)) {
    issues.push({ path: `${path}.regex`, code: 'REGEX_UNSAFE', message: 'Regex uses unsupported or potentially unsafe constructs.' });
  }
}

function validateStage(stage: SourceStage, path: string, domains: string[], issues: CompatibilityIssue[]) {
  if (!stage?.request || !stage.response) {
    issues.push({ path, code: 'STAGE_REQUIRED', message: 'Request and response definitions are required.' });
    return;
  }
  try {
    const probe = stage.request.url.replace(/\{\{[A-Za-z][A-Za-z0-9]*\}\}/g, 'value');
    const url = new URL(probe);
    if (url.protocol !== 'https:') issues.push({ path: `${path}.request.url`, code: 'HTTPS_REQUIRED', message: 'Only HTTPS URLs are allowed.' });
    if (url.port && url.port !== '443') issues.push({ path: `${path}.request.url`, code: 'PORT_REJECTED', message: 'Only the standard HTTPS port is allowed.' });
    if (!domains.includes(url.hostname.toLowerCase())) issues.push({ path: `${path}.request.url`, code: 'DOMAIN_NOT_DECLARED', message: 'Request host must be declared by the source.' });
  } catch {
    issues.push({ path: `${path}.request.url`, code: 'URL_INVALID', message: 'Request URL is invalid.' });
  }
  for (const key of templateKeys(JSON.stringify(stage.request))) {
    if (!TEMPLATE_KEYS.has(key)) issues.push({ path: `${path}.request`, code: 'TEMPLATE_KEY_UNSUPPORTED', message: `Unsupported template key: ${key}` });
  }
  if (stage.request.method && !['GET', 'POST'].includes(stage.request.method)) {
    issues.push({ path: `${path}.request.method`, code: 'METHOD_REJECTED', message: 'Only GET and ordinary POST are allowed.' });
  }
  for (const header of Object.keys(stage.request.headers ?? {})) {
    if (!SAFE_HEADERS.has(header.toLowerCase())) issues.push({ path: `${path}.request.headers.${header}`, code: 'HEADER_REJECTED', message: 'Header is not in the safe allowlist.' });
  }
  if (!['json', 'html'].includes(stage.response.format)) issues.push({ path: `${path}.response.format`, code: 'FORMAT_UNSUPPORTED', message: 'Response must be JSON or HTML.' });
  if (stage.response.list) validateSelector(stage.response.list, `${path}.response.list`, stage.response.format, issues);
  for (const [field, selector] of Object.entries(stage.response.fields ?? {})) {
    validateSelector(selector, `${path}.response.fields.${field}`, stage.response.format, issues);
  }
}

export function validateBookSourceConfig(input: unknown): BookSourceValidation {
  const issues: CompatibilityIssue[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, issues: [{ path: '$', code: 'CONFIG_INVALID', message: 'Configuration must be a JSON object.' }] };
  const config = input as BookSourceConfig;
  if (config.schemaVersion !== 1) issues.push({ path: 'schemaVersion', code: 'SCHEMA_VERSION_UNSUPPORTED', message: 'Only Scene Read schema version 1 is supported.' });
  if (!SOURCE_ID.test(config.sourceId ?? '')) issues.push({ path: 'sourceId', code: 'SOURCE_ID_INVALID', message: 'sourceId must be a stable lowercase identifier.' });
  if (typeof config.name !== 'string' || !config.name.trim() || config.name.length > 80) issues.push({ path: 'name', code: 'NAME_INVALID', message: 'Source name must contain 1–80 characters.' });
  if (!Number.isInteger(config.version) || config.version < 1) issues.push({ path: 'version', code: 'VERSION_INVALID', message: 'Version must be a positive integer.' });
  if (!Array.isArray(config.domains) || config.domains.length < 1 || config.domains.length > 5) issues.push({ path: 'domains', code: 'DOMAIN_COUNT_INVALID', message: 'Declare between 1 and 5 domains.' });
  const domains = Array.isArray(config.domains) ? config.domains.map((domain) => String(domain).toLowerCase()) : [];
  domains.forEach((domain, index) => {
    if (!DOMAIN.test(domain) || isIP(domain)) issues.push({ path: `domains[${index}]`, code: 'DOMAIN_INVALID', message: 'Domains must be public DNS hostnames, not IP addresses.' });
  });
  validateStage(config.search, 'search', domains, issues);
  validateStage(config.detail, 'detail', domains, issues);
  validateStage(config.catalog, 'catalog', domains, issues);
  validateStage(config.chapter, 'chapter', domains, issues);
  return { valid: issues.length === 0, issues };
}

function jsonPath(value: unknown, path: string): unknown[] {
  if (path === '$' || path === '@') return [value];
  if (!path.startsWith('$') && !path.startsWith('@')) throw new Error('JSONPATH_UNSUPPORTED');
  const tokens = path.slice(1).match(/(?:\.[A-Za-z0-9_-]+|\[(?:\d+|\*)\])/g) ?? [];
  if (tokens.join('') !== path.slice(1)) throw new Error('JSONPATH_UNSUPPORTED');
  let values: unknown[] = [value];
  for (const token of tokens) {
    if (token.startsWith('.')) {
      const key = token.slice(1);
      values = values.flatMap((item) => item && typeof item === 'object' && !Array.isArray(item) ? [(item as Record<string, unknown>)[key]] : []).filter((item) => item !== undefined);
    } else if (token === '[*]') {
      values = values.flatMap((item) => Array.isArray(item) ? item : []);
    } else {
      const index = Number(token.slice(1, -1));
      values = values.flatMap((item) => Array.isArray(item) && item[index] !== undefined ? [item[index]] : []);
    }
  }
  return values;
}

function xpathToCss(path: string) {
  const normalized = path.replace(/^\.\/\//, '').replace(/^\/\//, '').replace(/^\//, '');
  if (!normalized || /\||\(|\)|::|\.\./.test(normalized)) throw new Error('XPATH_UNSUPPORTED');
  return normalized.split('/').filter(Boolean).map((part) => {
    const match = /^([A-Za-z][A-Za-z0-9_-]*|\*)?(?:\[@(id|class)=['"]([^'"]+)['"]\])?$/.exec(part);
    if (!match) throw new Error('XPATH_UNSUPPORTED');
    const tag = match[1] || '*';
    return match[2] === 'id' ? `${tag}#${match[3]}` : match[2] === 'class' ? `${tag}.${match[3].split(/\s+/).join('.')}` : tag;
  }).join(' > ');
}

const clean = (value: string, selector: Selector) => selector.regex
  ? value.replace(new RegExp(selector.regex.pattern, 'gu'), selector.regex.replacement ?? '')
  : value;

export function extractStageResponse(stage: SourceStage, payload: unknown): Array<Record<string, string>> {
  if (stage.response.format === 'json') {
    const roots = stage.response.list ? jsonPath(payload, stage.response.list.value) : [payload];
    return roots.map((root) => Object.fromEntries(Object.entries(stage.response.fields).map(([field, selector]) => {
      const selected = selector.type === 'text' ? [root] : jsonPath(root, selector.value.replace(/^\$/, '@'));
      const text = selected.flatMap((item) => Array.isArray(item) ? item : [item]).filter((item) => item != null).map(String).join('\n');
      return [field, clean(text, selector)];
    })));
  }
  if (typeof payload !== 'string') throw new Error('HTML_RESPONSE_REQUIRED');
  const $ = load(payload);
  const listSelector = stage.response.list
    ? stage.response.list.type === 'xpath' ? xpathToCss(stage.response.list.value) : stage.response.list.value
    : 'html';
  return $(listSelector).toArray().map((root) => Object.fromEntries(Object.entries(stage.response.fields).map(([field, selector]) => {
    const targetSelector = selector.type === 'xpath' ? xpathToCss(selector.value) : selector.value;
    const target = selector.type === 'text' ? $(root) : $(root).find(targetSelector).first();
    const text = selector.attribute ? target.attr(selector.attribute) ?? '' : target.text();
    return [field, clean(text.trim(), selector)];
  })));
}

const isBlockedIpv4 = (address: string) => {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19));
};

export const isBlockedNetworkAddress = (address: string) => {
  if (isIP(address) === 4) return isBlockedIpv4(address);
  const normalized = address.toLowerCase();
  if (isIP(address) !== 6) return true;
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
};

export async function resolvePublicHost(
  hostname: string,
  resolver: typeof lookup = lookup,
) {
  if (isIP(hostname)) throw new Error('SOURCE_NETWORK_BLOCKED');
  const addresses = await resolver(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((item) => isBlockedNetworkAddress(item.address))) {
    throw new Error('SOURCE_NETWORK_BLOCKED');
  }
  return addresses;
}

const render = (value: string, variables: Record<string, string>) => value.replace(
  /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,
  (_match, key: string) => encodeURIComponent(variables[key] ?? ''),
);

export async function executeSourceStage(
  config: BookSourceConfig,
  stage: SourceStage,
  variables: Record<string, string>,
  dependencies: { resolver?: typeof lookup; fetchImpl?: typeof undiciFetch } = {},
) {
  const method = stage.request.method ?? 'GET';
  const url = new URL(render(stage.request.url, variables));
  for (const [key, value] of Object.entries(stage.request.query ?? {})) url.searchParams.set(key, render(value, variables));
  let current = url;
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    if (current.protocol !== 'https:' || (current.port && current.port !== '443') || !config.domains.includes(current.hostname.toLowerCase())) {
      throw new Error('SOURCE_URL_REJECTED');
    }
    const addresses = await resolvePublicHost(current.hostname, dependencies.resolver);
    const selected = addresses[0];
    const agent = new Agent({ connect: { lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family) } });
    try {
      const response = await (dependencies.fetchImpl ?? undiciFetch)(current, {
        method,
        headers: { Accept: stage.response.format === 'json' ? 'application/json' : 'text/html', ...stage.request.headers },
        body: method === 'POST' ? JSON.stringify(Object.fromEntries(Object.entries(stage.request.body ?? {}).map(([key, value]) => [key, render(value, variables)]))) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
        dispatcher: agent,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === 5) throw new Error('SOURCE_REDIRECT_REJECTED');
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > 20 * 1024 * 1024) throw new Error('SOURCE_RESPONSE_TOO_LARGE');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('SOURCE_RESPONSE_TOO_LARGE');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const payload = stage.response.format === 'json' ? JSON.parse(text) as unknown : text;
      return extractStageResponse(stage, payload);
    } finally {
      await agent.close();
    }
  }
  throw new Error('SOURCE_REDIRECT_REJECTED');
}
