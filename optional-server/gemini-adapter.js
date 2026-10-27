/**
 * Reserved server-side integration point. This is intentionally not an API
 * client: it never reads credentials, inspects user code, or sends requests.
 * The extension does not import this module.
 */
export const GEMINI_ADAPTER_STATUS = Object.freeze({
  provider: 'gemini',
  enabled: false,
  implemented: false,
});

export class GeminiAdapterDisabledError extends Error {
  constructor() {
    super('Gemini is not connected. Use Backstory’s local practice questions.');
    this.name = 'GeminiAdapterDisabledError';
    this.code = 'GEMINI_ADAPTER_DISABLED';
  }
}

/**
 * Future boundary: an explicitly approved request containing selected evidence.
 * All requests currently fail closed, even if a caller supplies enabled=true.
 * No request fields are inspected and no configuration is loaded.
 *
 * @param {unknown} _request Reserved request payload; unused in this stub.
 * @returns {Promise<never>}
 */
export async function requestGeminiQuestions(_request) {
  throw new GeminiAdapterDisabledError();
}
