import type { WorkflowGraph } from './graph.js';

/** Job — одна задача выполнения; словарь статусов — раздел 13 ТЗ. */
export type JobStatus = 'idle' | 'queued' | 'running' | 'success' | 'error';

// Словарь run отличается от словаря job (completed/failed против
// success/error) — так задано в ТЗ.
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface JobSnapshot {
  nodeId: string;
  status: JobStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  imageUrl: string | null;
}

export interface RunSnapshot {
  runId: string;
  status: RunStatus;
  createdAt: string;
  jobs: Record<string, JobSnapshot>;
}

export interface CreateRunRequest {
  graph: WorkflowGraph;
}

export interface CreateRunResponse {
  runId: string;
}
