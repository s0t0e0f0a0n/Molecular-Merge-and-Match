// Side-effect module: routes API calls through the Electron protocol in production and adds the required header.
const originalFetch = window.fetch;

window.fetch = async (input, init) => {
  const requestUrl = input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.href
      : input;
  const requestPath = new URL(requestUrl, window.location.href).pathname;
  const isApiRequest = requestPath === '/api/v1' || requestPath.startsWith('/api/v1/');
  let url = input;

  if (
    import.meta.env.PROD
    && typeof url === 'string'
    && (url.startsWith('/api/v1') || url.startsWith('/uploads'))
  ) {
    url = `api://backend${url}`;
  }

  if (!isApiRequest) return originalFetch(url, init);

  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set('X-Requested-With', 'MMM');
  return originalFetch(url, { ...init, headers });
};
