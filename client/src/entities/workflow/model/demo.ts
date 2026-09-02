import type { Edge } from '@xyflow/react';
import type { MessageKey } from '@/shared/i18n/messages';
import type { WorkflowFlowNode } from './types';

export interface DemoGraph {
  /** Служит и подписью кнопки, и идентификатором демо. */
  nameKey: MessageKey;
  nodes: WorkflowFlowNode[];
  edges: Edge[];
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): Edge => ({
  id: `${source}->${target}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});

export const DEMO_LINEAR: DemoGraph = {
  nameKey: 'demoLinear',
  nodes: [
    { id: 'prompt-1', type: 'prompt', position: { x: 60, y: 160 }, data: { text: 'A neon fox in a night forest' } },
    { id: 'generate-1', type: 'generate', position: { x: 360, y: 150 }, data: { presetId: null } },
    { id: 'result-1', type: 'result', position: { x: 660, y: 150 }, data: {} },
  ],
  edges: [
    edge('prompt-1', 'text', 'generate-1', 'prompt'),
    edge('generate-1', 'image', 'result-1', 'image'),
  ],
};

export const DEMO_EDIT: DemoGraph = {
  nameKey: 'demoEdit',
  nodes: [
    { id: 'image-input-1', type: 'image-input', position: { x: 60, y: 140 }, data: { imageDataUrl: null } },
    { id: 'edit-1', type: 'edit', position: { x: 360, y: 150 }, data: { prompt: 'Make the background blue' } },
    { id: 'result-1', type: 'result', position: { x: 660, y: 150 }, data: {} },
  ],
  edges: [
    edge('image-input-1', 'image', 'edit-1', 'image'),
    edge('edit-1', 'image', 'result-1', 'image'),
  ],
};

export const DEMO_BRANCHING: DemoGraph = {
  nameKey: 'demoBranching',
  nodes: [
    { id: 'prompt-1', type: 'prompt', position: { x: 40, y: 220 }, data: { text: 'A lighthouse in a storm' } },
    { id: 'generate-1', type: 'generate', position: { x: 360, y: 60 }, data: { presetId: 'preset-premium-3d' } },
    { id: 'generate-2', type: 'generate', position: { x: 360, y: 380 }, data: { presetId: 'preset-flat-illustration' } },
    { id: 'result-1', type: 'result', position: { x: 680, y: 60 }, data: {} },
    { id: 'result-2', type: 'result', position: { x: 680, y: 380 }, data: {} },
  ],
  edges: [
    edge('prompt-1', 'text', 'generate-1', 'prompt'),
    edge('prompt-1', 'text', 'generate-2', 'prompt'),
    edge('generate-1', 'image', 'result-1', 'image'),
    edge('generate-2', 'image', 'result-2', 'image'),
  ],
};

export const DEMO_GRAPHS: DemoGraph[] = [DEMO_LINEAR, DEMO_EDIT, DEMO_BRANCHING];
