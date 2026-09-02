import type { Node } from '@xyflow/react';
import type { MessageKey } from '@/shared/i18n/messages';
import type {
  EditNodeData,
  GenerateNodeData,
  ImageInputNodeData,
  NodeKind,
  PortType,
  PromptNodeData,
  ResultNodeData,
} from '@aiw/shared';

export const PORT_COLORS: Record<PortType, string> = {
  text: '#58a9ff',
  image: '#3bd5a0',
};

export type PromptFlowNode = Node<PromptNodeData, 'prompt'>;
export type ImageInputFlowNode = Node<ImageInputNodeData, 'image-input'>;
export type GenerateFlowNode = Node<GenerateNodeData, 'generate'>;
export type EditFlowNode = Node<EditNodeData, 'edit'>;
export type ResultFlowNode = Node<ResultNodeData, 'result'>;

export type WorkflowFlowNode =
  | PromptFlowNode
  | ImageInputFlowNode
  | GenerateFlowNode
  | EditFlowNode
  | ResultFlowNode;

export const NODE_TITLE_KEYS: Record<NodeKind, MessageKey> = {
  prompt: 'nodePrompt',
  'image-input': 'nodeImageInput',
  generate: 'nodeGenerate',
  edit: 'nodeEdit',
  result: 'nodeResult',
};

export function defaultNodeData(kind: NodeKind): WorkflowFlowNode['data'] {
  switch (kind) {
    case 'prompt':
      return { text: '' };
    case 'image-input':
      return { imageDataUrl: null };
    case 'generate':
      return { presetId: null };
    case 'edit':
      return { prompt: '' };
    case 'result':
      return {};
  }
}
