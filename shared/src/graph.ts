export type PortType = 'text' | 'image';

export type NodeKind = 'prompt' | 'image-input' | 'generate' | 'edit' | 'result';

export interface PortSpec {
  id: string;
  type: PortType;
  label: string;
}

/**
 * Единая спецификация портов: по ней клиент блокирует несовместимые
 * соединения, по ней же сервер валидирует входящий граф.
 */
export const NODE_PORTS: Record<NodeKind, { inputs: PortSpec[]; outputs: PortSpec[] }> = {
  prompt: {
    inputs: [],
    outputs: [{ id: 'text', type: 'text', label: 'Text' }],
  },
  'image-input': {
    inputs: [],
    outputs: [{ id: 'image', type: 'image', label: 'Image' }],
  },
  generate: {
    inputs: [{ id: 'prompt', type: 'text', label: 'Prompt' }],
    outputs: [{ id: 'image', type: 'image', label: 'Image' }],
  },
  edit: {
    inputs: [{ id: 'image', type: 'image', label: 'Image' }],
    outputs: [{ id: 'image', type: 'image', label: 'Image' }],
  },
  result: {
    inputs: [{ id: 'image', type: 'image', label: 'Image' }],
    outputs: [],
  },
};

// Алиасы, а не interface: так payload'ы проходят constraint
// Record<string, unknown> у нод React Flow на клиенте.
export type PromptNodeData = {
  text: string;
};

export type ImageInputNodeData = {
  imageDataUrl: string | null;
};

export type GenerateNodeData = {
  presetId: string | null;
};

export type EditNodeData = {
  prompt: string;
};

export type ResultNodeData = Record<string, never>;

export interface NodeDataByKind {
  prompt: PromptNodeData;
  'image-input': ImageInputNodeData;
  generate: GenerateNodeData;
  edit: EditNodeData;
  result: ResultNodeData;
}

export interface WorkflowNodeOf<K extends NodeKind> {
  id: string;
  kind: K;
  data: NodeDataByKind[K];
}

/** Discriminated union: switch по `kind` сужает `data` до точного типа. */
export type WorkflowNode = { [K in NodeKind]: WorkflowNodeOf<K> }[NodeKind];

export interface WorkflowEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

/** Graph definition: workflow как данные — транспорт между клиентом и сервером. */
export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
