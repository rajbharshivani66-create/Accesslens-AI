const legacyUnavailable = 'AI assistance is unavailable. Configure a valid Gemini API key and try again.';

export function describeGeminiError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : '';
  if (message.includes(legacyUnavailable) || message.includes('AI_PROVIDER_UNAVAILABLE')) {
    return 'Gemini is not configured on the API server. Add GEMINI_API_KEY to the backend service environment (Render), then restart or redeploy the API. Do not add the key to Vercel or any NEXT_PUBLIC_ variable.';
  }
  if (message.includes('AI_PROVIDER_REQUEST_FAILED')) {
    return 'The API server could not reach Gemini. Check its GEMINI_API_KEY and GEMINI_MODEL settings, then restart or redeploy the API.';
  }
  return message || 'Gemini assistance failed. Check the API connection and retry.';
}
