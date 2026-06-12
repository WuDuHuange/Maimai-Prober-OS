export function handleError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return '未知错误, 请查看控制台';
}

export function toast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  // Simple console-based toast for now
  const icon = type === 'success' ? '[OK]' : type === 'error' ? '[ERR]' : '[i]';
  console.log(`${icon} ${message}`);

  // Could be expanded to a proper toast notification component
  if (type === 'error') {
    alert(`错误: ${message}`);
  } else if (type === 'success') {
    alert(message);
  }
}
