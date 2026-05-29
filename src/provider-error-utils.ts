type HttpErrorLike = {
  status?: number;
  response?: { status?: number };
  error?: { message?: string };
  message?: string;
};

export function formatProviderErrorMessage(error: unknown, driverKind: string): string {
  const e = error as HttpErrorLike | undefined;
  const status = e?.status ?? e?.response?.status;
  const apiMessage = e?.error?.message || e?.message;

  const defaultMessage = apiMessage || 'An unexpected error occurred';

  if (driverKind === 'gemini') {
    return defaultMessage;
  }

  if (!status) {
    return defaultMessage;
  }

  switch (status) {
    case 400:
      return apiMessage ? `Bad request: ${apiMessage}` : 'Bad request';
    case 401:
      return 'Invalid API key or unauthorized access';
    case 402:
      return apiMessage ? `Insufficient balance: ${apiMessage}` : 'Insufficient balance';
    case 413:
      return apiMessage ? `Request too large: ${apiMessage}` : 'Request too large';
    case 422:
      return apiMessage ? `Invalid parameters: ${apiMessage}` : 'Invalid parameters';
    case 429:
      return 'Rate limit exceeded. Please try again later';
    case 500:
      return 'Server error. Please try again later';
    case 503:
      return 'Service is temporarily unavailable';
    default:
      return defaultMessage;
  }
}
