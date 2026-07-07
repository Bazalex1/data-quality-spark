export function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const detail = (error as { response?: { data?: { detail?: unknown } } })
      .response?.data?.detail;

    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === 'object' && item && 'msg' in item
            ? String((item as { msg: string }).msg)
            : String(item)
        )
        .join(', ');
    }
  }

  return 'Не удалось выполнить операцию';
}