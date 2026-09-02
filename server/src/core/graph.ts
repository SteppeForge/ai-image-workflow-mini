import { NODE_PORTS, type WorkflowGraph } from '@aiw/shared';

const MAX_NODES = 50;
const MAX_EDGES = 100;
const MAX_TEXT_LENGTH = 2000;
// Зеркало клиентского лимита 10 MB: ~14M символов base64 + заголовок data-URL.
const MAX_IMAGE_DATA_URL_LENGTH = 14 * 1024 * 1024;
// Заодно отсекает prototype-polluting id вроде "__proto__".
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value) && !FORBIDDEN_IDS.has(value);
}

function nodeDataErrors(kind: string, data: unknown, nodeId: string): string[] {
  if (!isRecord(data)) return [`Node "${nodeId}": data must be an object`];
  const errors: string[] = [];
  const textField = kind === 'prompt' ? 'text' : kind === 'edit' ? 'prompt' : null;
  if (textField) {
    const value = data[textField];
    if (typeof value !== 'string') {
      errors.push(`Node "${nodeId}": data.${textField} must be a string`);
    } else if (value.length > MAX_TEXT_LENGTH) {
      errors.push(`Node "${nodeId}": data.${textField} exceeds ${MAX_TEXT_LENGTH} characters`);
    }
  }
  if (kind === 'generate' && data.presetId !== null && typeof data.presetId !== 'string') {
    errors.push(`Node "${nodeId}": data.presetId must be a string or null`);
  }
  if (kind === 'image-input' && data.imageDataUrl !== null) {
    const value = data.imageDataUrl;
    if (typeof value !== 'string') {
      errors.push(`Node "${nodeId}": data.imageDataUrl must be a string or null`);
    } else if (!value.startsWith('data:')) {
      errors.push(`Node "${nodeId}": data.imageDataUrl must be a data URL`);
    } else if (value.length > MAX_IMAGE_DATA_URL_LENGTH) {
      errors.push(`Node "${nodeId}": data.imageDataUrl exceeds the 10 MB upload limit`);
    }
  }
  return errors;
}

// Сервер не доверяет клиенту: форма JSON, лимиты, порты по той же
// NODE_PORTS, что и на клиенте, плюс детект циклов.
export function validateGraph(graph: WorkflowGraph): string[] {
  const errors: string[] = [];

  if (graph.nodes.length === 0) {
    errors.push('Graph has no nodes');
  }
  if (graph.nodes.length > MAX_NODES) {
    errors.push(`Too many nodes (max ${MAX_NODES})`);
  }
  if (graph.edges.length > MAX_EDGES) {
    errors.push(`Too many edges (max ${MAX_EDGES})`);
  }

  const seenIds = new Set<string>();
  for (const [index, node] of graph.nodes.entries()) {
    if (!isRecord(node) || !isValidId(node.id)) {
      errors.push(`Node #${index}: must be an object with an id of 1-64 chars [A-Za-z0-9_-]`);
      continue;
    }
    if (seenIds.has(node.id)) {
      errors.push(`Duplicate node id "${node.id}"`);
    }
    seenIds.add(node.id);
    // hasOwn: оператор in пропустил бы унаследованные ключи вроде "toString".
    if (typeof node.kind !== 'string' || !Object.hasOwn(NODE_PORTS, node.kind)) {
      errors.push(`Node "${node.id}" has unknown kind "${String(node.kind)}"`);
      continue;
    }
    errors.push(...nodeDataErrors(node.kind as string, node.data, node.id));
  }
  // Пока структура битая, остальные проверки бессмысленны.
  if (errors.length > 0) return errors;

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const seenTargetPorts = new Set<string>();
  for (const [index, edge] of graph.edges.entries()) {
    if (
      !isRecord(edge) ||
      typeof edge.id !== 'string' ||
      typeof edge.source !== 'string' ||
      typeof edge.target !== 'string' ||
      typeof edge.sourcePort !== 'string' ||
      typeof edge.targetPort !== 'string'
    ) {
      errors.push(`Edge #${index}: must be an object with string id/source/target/sourcePort/targetPort`);
      continue;
    }
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source) {
      errors.push(`Edge "${edge.id}" references missing source node "${edge.source}"`);
      continue;
    }
    if (!target) {
      errors.push(`Edge "${edge.id}" references missing target node "${edge.target}"`);
      continue;
    }

    const outPort = NODE_PORTS[source.kind]?.outputs.find((port) => port.id === edge.sourcePort);
    const inPort = NODE_PORTS[target.kind]?.inputs.find((port) => port.id === edge.targetPort);
    if (!outPort) {
      errors.push(`Edge "${edge.id}": node "${source.id}" has no output port "${edge.sourcePort}"`);
    }
    if (!inPort) {
      errors.push(`Edge "${edge.id}": node "${target.id}" has no input port "${edge.targetPort}"`);
    }
    if (outPort && inPort && outPort.type !== inPort.type) {
      errors.push(
        `Edge "${edge.id}": incompatible port types ${outPort.type} → ${inPort.type} ` +
          `(${source.id} → ${target.id})`,
      );
    }

    const targetPortKey = `${edge.target}:${edge.targetPort}`;
    if (seenTargetPorts.has(targetPortKey)) {
      errors.push(`Input port "${edge.targetPort}" of node "${edge.target}" has multiple connections`);
    }
    seenTargetPorts.add(targetPortKey);
  }

  for (const node of graph.nodes) {
    const spec = NODE_PORTS[node.kind];
    if (!spec) continue;
    for (const input of spec.inputs) {
      const connected = graph.edges.some(
        (edge) => edge.target === node.id && edge.targetPort === input.id,
      );
      if (!connected) {
        errors.push(`Node "${node.id}" (${node.kind}): required input "${input.id}" is not connected`);
      }
    }
  }

  if (errors.length === 0 && hasCycle(graph)) {
    errors.push('Graph contains a cycle');
  }

  return errors;
}

export function buildDependencyMap(graph: WorkflowGraph): Map<string, string[]> {
  const deps = new Map<string, string[]>(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    deps.get(edge.target)?.push(edge.source);
  }
  return deps;
}

function hasCycle(graph: WorkflowGraph): boolean {
  const deps = buildDependencyMap(graph);
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string): boolean => {
    const current = state.get(id);
    if (current === 'visiting') return true;
    if (current === 'done') return false;
    state.set(id, 'visiting');
    for (const dep of deps.get(id) ?? []) {
      if (visit(dep)) return true;
    }
    state.set(id, 'done');
    return false;
  };

  return graph.nodes.some((node) => visit(node.id));
}
