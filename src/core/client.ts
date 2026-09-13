import { browser } from 'wxt/browser';
export async function request<T>(type: string, payload: unknown = {}): Promise<T> {
  try {
    const response = await browser.runtime.sendMessage({ type, payload });
    if (!response?.ok) throw new Error(response?.error || 'Glosswatch could not complete that action. Try again.');
    return response.data as T;
  } catch (error) {
    if (error instanceof Error && /context invalidated|receiving end|connection/i.test(error.message)) {
      throw new Error('Glosswatch was updated. Reload this page to reconnect.');
    }
    throw error;
  }
}
export function message(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
