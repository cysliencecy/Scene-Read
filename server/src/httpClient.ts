import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';

type Environment = Record<string, string | undefined>;

export type ProxyConfiguration = {
  httpProxy: string | undefined;
  httpsProxy: string | undefined;
  noProxy: string | undefined;
};

type ProxyFetchFactory = (configuration: ProxyConfiguration) => typeof fetch;

const environmentValue = (environment: Environment, lowerCase: string, upperCase: string) =>
  environment[lowerCase]?.trim() || environment[upperCase]?.trim() || undefined;

export function resolveProxyConfiguration(environment: Environment): ProxyConfiguration | null {
  const configuration = {
    httpProxy: environmentValue(environment, 'http_proxy', 'HTTP_PROXY'),
    httpsProxy: environmentValue(environment, 'https_proxy', 'HTTPS_PROXY'),
    noProxy: environmentValue(environment, 'no_proxy', 'NO_PROXY'),
  };
  return configuration.httpProxy || configuration.httpsProxy ? configuration : null;
}

const createUndiciProxyFetch: ProxyFetchFactory = (configuration) => {
  const dispatcher = new EnvHttpProxyAgent(configuration);
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...init,
      dispatcher,
    } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>) as typeof fetch;
};

export function createExternalFetch(
  environment: Environment = process.env,
  directFetch: typeof fetch = globalThis.fetch,
  createProxyFetch: ProxyFetchFactory = createUndiciProxyFetch,
): typeof fetch {
  const configuration = resolveProxyConfiguration(environment);
  return configuration ? createProxyFetch(configuration) : directFetch;
}

let cachedProxyKey: string | undefined;
let cachedProxyFetch: typeof fetch | undefined;

export const externalFetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const configuration = resolveProxyConfiguration(process.env);
  if (!configuration) return globalThis.fetch(input, init);

  const proxyKey = JSON.stringify(configuration);
  if (proxyKey !== cachedProxyKey || !cachedProxyFetch) {
    cachedProxyKey = proxyKey;
    cachedProxyFetch = createUndiciProxyFetch(configuration);
  }
  return cachedProxyFetch(input, init);
}) as typeof fetch;
