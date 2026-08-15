const SOURCE = 'gbfit-passive-account-v1';

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!isObject(message) || message.source !== SOURCE || !isObject(message.response)) return;

  const response = message.response;
  if (
    typeof response.url !== 'string' ||
    typeof response.body !== 'string' ||
    (response.resourceType !== 'xhr' && response.resourceType !== 'fetch')
  ) return;

  void chrome.runtime.sendMessage({
    type: 'gbfit:passive-account-response',
    response: {
      url: response.url,
      status: typeof response.status === 'number' ? response.status : undefined,
      mimeType: typeof response.mimeType === 'string' ? response.mimeType : undefined,
      resourceType: response.resourceType,
      body: response.body,
    },
  });
});

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
