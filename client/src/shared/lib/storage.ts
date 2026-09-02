// localStorage без исключений: приватный режим, квота и тестовое окружение
// деградируют в no-op / null.
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Персистентность — удобство, а не требование.
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // См. выше.
  }
}
