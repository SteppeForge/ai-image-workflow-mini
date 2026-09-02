import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { isValidConnection } from './connection';
import type { WorkflowFlowNode } from './types';

const nodes: WorkflowFlowNode[] = [
  { id: 'p1', type: 'prompt', position: { x: 0, y: 0 }, data: { text: 'x' } },
  { id: 'g1', type: 'generate', position: { x: 0, y: 0 }, data: { presetId: null } },
  { id: 'e1', type: 'edit', position: { x: 0, y: 0 }, data: { prompt: 'a' } },
  { id: 'e2', type: 'edit', position: { x: 0, y: 0 }, data: { prompt: 'b' } },
  { id: 'r1', type: 'result', position: { x: 0, y: 0 }, data: {} },
];

const connection = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  source,
  sourceHandle,
  target,
  targetHandle,
});

describe('isValidConnection (typed ports)', () => {
  it('allows a matching text → text connection', () => {
    expect(isValidConnection(connection('p1', 'text', 'g1', 'prompt'), nodes, [])).toBe(true);
  });

  it('blocks incompatible port types (text output → image input)', () => {
    expect(isValidConnection(connection('p1', 'text', 'r1', 'image'), nodes, [])).toBe(false);
  });

  it('blocks a second connection into an occupied input port', () => {
    const edges: Edge[] = [
      { id: 'x', source: 'g1', sourceHandle: 'image', target: 'r1', targetHandle: 'image' },
    ];
    expect(isValidConnection(connection('e1', 'image', 'r1', 'image'), nodes, edges)).toBe(false);
  });

  it('blocks self-loops', () => {
    expect(isValidConnection(connection('e1', 'image', 'e1', 'image'), nodes, [])).toBe(false);
  });

  it('blocks connections that would create a cycle', () => {
    const edges: Edge[] = [
      { id: 'x', source: 'e1', sourceHandle: 'image', target: 'e2', targetHandle: 'image' },
    ];
    expect(isValidConnection(connection('e2', 'image', 'e1', 'image'), nodes, edges)).toBe(false);
  });

  it('blocks connections to unknown ports or nodes', () => {
    expect(isValidConnection(connection('p1', 'nope', 'g1', 'prompt'), nodes, [])).toBe(false);
    expect(isValidConnection(connection('ghost', 'text', 'g1', 'prompt'), nodes, [])).toBe(false);
  });
});
