import type { RunSnapshot } from '@aiw/shared';

// Минимальная замена EventSource для тестов run-workflow.
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emit(snapshot: RunSnapshot): void {
    this.onmessage?.({ data: JSON.stringify(snapshot) } as MessageEvent<string>);
  }
}

export function snapshotOf(runId: string, status: RunSnapshot['status']): RunSnapshot {
  return { runId, status, createdAt: new Date().toISOString(), jobs: {} };
}
