import type {
  OnlineBookImportResult,
  OnlineBookSearchPage,
  OnlineBookSource,
  OnlineBookSourceError,
  VisualStyle,
} from './types.js';

export type OnlineBookProvider = {
  source: OnlineBookSource;
  search(query: string, page: number): Promise<OnlineBookSearchPage>;
  importBook(sourceBookId: string, visualStyle: VisualStyle): Promise<OnlineBookImportResult>;
};

export class OnlineBookError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
  }
}

export class OnlineBookProviderRegistry {
  private readonly providers = new Map<OnlineBookSource, OnlineBookProvider>();

  constructor(providers: OnlineBookProvider[] = []) {
    providers.forEach((provider) => this.register(provider));
  }

  register(provider: OnlineBookProvider) {
    this.providers.set(provider.source, provider);
  }

  get(source: OnlineBookSource) {
    return this.providers.get(source);
  }

  list() {
    return [...this.providers.values()];
  }
}

export function normalizeOnlineBookProviderError(
  source: OnlineBookSource,
  error: unknown,
): OnlineBookSourceError {
  return {
    source,
    code: error instanceof OnlineBookError ? error.code : 'BOOK_SOURCE_UNAVAILABLE',
  };
}
