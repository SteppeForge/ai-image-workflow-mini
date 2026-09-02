import { useCallback, useState } from 'react';
import {
  Background,
  ControlButton,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import { useRunInProgress, useRunStore } from '@/entities/run/model/store';
import { RunStatusChip } from '@/entities/run/ui/RunStatusChip';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { isValidConnection } from '@/entities/workflow/model/connection';
import { PORT_COLORS } from '@/entities/workflow/model/types';
import type { NodeKind } from '@aiw/shared';
import { useT } from '@/shared/i18n/locale';
import { readStorage, writeStorage } from '@/shared/lib/storage';
import { DeletableEdge } from './DeletableEdge';
import { PromptNode } from './nodes/PromptNode';
import { ImageInputNode } from './nodes/ImageInputNode';
import { GenerateNode } from './nodes/GenerateNode';
import { EditNode } from './nodes/EditNode';
import { ResultNode } from './nodes/ResultNode';

// Цвета источников берутся из палитры портов — правка порта не оставит миникарту рассинхронизированной.
const MINIMAP_COLORS: Record<NodeKind, string> = {
  prompt: PORT_COLORS.text,
  'image-input': PORT_COLORS.image,
  generate: '#7d8cff',
  edit: '#f1bd63',
  result: '#6b7280',
};

// Подмена встроенного типа default: кнопка удаления появляется и на демо-рёбрах,
// у которых type не задан.
const EDGE_TYPES: EdgeTypes = { default: DeletableEdge };

// React Flow требует стабильный nodeTypes вне рендера.
const NODE_TYPES: NodeTypes = {
  prompt: PromptNode,
  'image-input': ImageInputNode,
  generate: GenerateNode,
  edit: EditNode,
  result: ResultNode,
};

export function WorkflowCanvas() {
  const t = useT();
  const [showMiniMap, setShowMiniMap] = useState(() => readStorage('aiw-minimap') !== '0');
  const toggleMiniMap = () =>
    setShowMiniMap((visible) => {
      writeStorage('aiw-minimap', visible ? '0' : '1');
      return !visible;
    });

  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const runStatus = useRunStore((state) => state.snapshot?.status ?? null);
  const runConnection = useRunStore((state) => state.connection);
  const runInProgress = useRunInProgress();
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowStore((state) => state.onConnect);

  const checkConnection = useCallback((connection: Connection | Edge) => {
    const { nodes: currentNodes, edges: currentEdges } = useWorkflowStore.getState();
    return isValidConnection(connection, currentNodes, currentEdges);
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      // Оттягивание конца связи отключено намеренно: зона порта и конец провода
      // накладываются, и жест перехватывал создание новой связи. Разрыв — кнопкой × на ребре.
      edgesReconnectable={false}
      isValidConnection={checkConnection}
      colorMode="dark"
      // Во время запуска удаление отключено — и кнопками, и клавишами.
      deleteKeyCode={runInProgress ? null : ['Backspace', 'Delete']}
      fitView
    >
      <Background gap={18} />
      {/* Чип плавает над canvas — смена статуса не сдвигает вёрстку. */}
      <Panel position="top-left">
        <RunStatusChip status={runStatus} connection={runConnection} />
      </Panel>
      <Panel
        position="top-right"
        className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-950/90 px-2.5 py-1.5 text-[11px] text-neutral-400"
      >
        {(['text', 'image'] as const).map((type) => (
          <span key={type} className="flex items-center gap-1">
            <span className="size-2.5 rounded-full" style={{ background: PORT_COLORS[type] }} />
            {type}
          </span>
        ))}
      </Panel>
      {showMiniMap && (
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => MINIMAP_COLORS[node.type as NodeKind] ?? '#6b7280'}
          nodeStrokeWidth={4}
          nodeBorderRadius={6}
          bgColor="#111114"
          maskColor="rgba(9, 9, 11, 0.75)"
          className="!hidden overflow-hidden !rounded-xl !border !border-neutral-700/80 shadow-xl shadow-black/40 md:!block"
        />
      )}
      <Controls>
        <ControlButton onClick={toggleMiniMap} title={t('toggleMinimap')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <rect x="3.4" y="3.4" width="4" height="3" rx="0.8" fill="currentColor" />
          </svg>
        </ControlButton>
      </Controls>
    </ReactFlow>
  );
}
