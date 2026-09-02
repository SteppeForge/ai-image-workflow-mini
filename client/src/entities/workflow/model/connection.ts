import type { Connection, Edge } from '@xyflow/react';
import { NODE_PORTS } from '@aiw/shared';
import type { WorkflowFlowNode } from './types';

// Правила соединений (зеркало серверной валидации): типы портов совпадают,
// вход занят одним ребром, без петель и циклов.
export function isValidConnection(
  connection: Connection | Edge,
  nodes: WorkflowFlowNode[],
  edges: Edge[],
): boolean {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (!source || !target || source === target) return false;

  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);
  if (!sourceNode?.type || !targetNode?.type) return false;

  const outPort = NODE_PORTS[sourceNode.type].outputs.find((port) => port.id === sourceHandle);
  const inPort = NODE_PORTS[targetNode.type].inputs.find((port) => port.id === targetHandle);
  if (!outPort || !inPort) return false;

  if (outPort.type !== inPort.type) return false;

  const inputTaken = edges.some(
    (edge) => edge.target === target && edge.targetHandle === targetHandle,
  );
  if (inputTaken) return false;

  return !wouldCreateCycle(source, target, edges);
}

function wouldCreateCycle(source: string, target: string, edges: Edge[]): boolean {
  const stack = [target];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges) {
      if (edge.source === current) stack.push(edge.target);
    }
  }
  return false;
}
