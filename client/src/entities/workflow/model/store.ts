import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import type { NodeKind, WorkflowGraph } from '@aiw/shared';
import type { MessageKey } from '@/shared/i18n/messages';
import { readStorage, removeStorage, writeStorage } from '@/shared/lib/storage';
import { isValidConnection } from './connection';
import { defaultNodeData, type WorkflowFlowNode } from './types';

interface GraphSnapshot {
  nodes: WorkflowFlowNode[];
  edges: Edge[];
  activeDemoKey: MessageKey | null;
}

interface WorkflowState {
  nodes: WorkflowFlowNode[];
  edges: Edge[];
  /** Демо-шаблон, из которого вырос текущий граф: точка возврата для «Сброса». */
  activeDemoKey: MessageKey | null;
  past: GraphSnapshot[];
  future: GraphSnapshot[];
  undo: () => void;
  redo: () => void;
  onNodesChange: (changes: NodeChange<WorkflowFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: NodeKind, position?: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;
  updateNodeData: (id: string, patch: Partial<WorkflowFlowNode['data']>) => void;
  loadGraph: (nodes: WorkflowFlowNode[], edges: Edge[], demoKey?: MessageKey | null) => void;
  toGraph: () => WorkflowGraph;
}

type PersistedGraph = Pick<WorkflowState, 'nodes' | 'edges' | 'activeDemoKey'>;

const HISTORY_LIMIT = 50;
const PERSIST_DEBOUNCE_MS = 300;

// Максимальный числовой суффикс + 1; выводится из состояния, а не счётчика —
// переживает перезагрузку и загрузку графов без коллизий id.
function nextNodeNumber(nodes: WorkflowFlowNode[]): number {
  return nodes.reduce((max, node) => {
    const suffix = /-(\d+)$/.exec(node.id);
    return suffix ? Math.max(max, Number(suffix[1]) + 1) : max;
  }, 1);
}

// Удаление связанной ноды клавишей React Flow шлёт двумя пакетами подряд
// (сначала рёбра, потом нода). Для пользователя это одно действие, поэтому
// снимки одного тика схлопываются: иначе первый undo вернул бы ноду без связей.
let snapshotTaken = false;

function remember(state: WorkflowState): Pick<WorkflowState, 'past' | 'future'> {
  if (snapshotTaken) return { past: state.past, future: [] };
  snapshotTaken = true;
  queueMicrotask(() => {
    snapshotTaken = false;
  });
  return {
    past: [
      ...state.past.slice(-(HISTORY_LIMIT - 1)),
      { nodes: state.nodes, edges: state.edges, activeDemoKey: state.activeDemoKey },
    ],
    future: [],
  };
}

// React Flow шлёт position-change на каждый кадр драга — синхронная запись
// в localStorage сидела бы на hot path. Дебаунс 300 мс + flush на beforeunload;
// битый JSON и приватный режим деградируют в «ничего не сохранено».
function createGraphStorage(): PersistStorage<PersistedGraph> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let write: (() => void) | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    write?.();
    write = null;
  };
  // pagehide, а не beforeunload: любой слушатель beforeunload выкидывает страницу
  // из bfcache, и возврат «назад» перезагружал бы всё приложение.
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);

  return {
    getItem: (name) => {
      const raw = readStorage(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StorageValue<PersistedGraph>;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      // Санитация и сериализация — внутри отложенной записи: persist зовёт setItem
      // на каждый кадр драга, и перебор нод там был бы лишней работой на hot path.
      write = () => writeStorage(name, JSON.stringify(stripImages(value)));
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
    },
    removeItem: (name) => removeStorage(name),
  };
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      activeDemoKey: null,
      past: [],
      future: [],

      undo: () =>
        set((state) => {
          const previous = state.past.at(-1);
          if (!previous) return state;
          return {
            past: state.past.slice(0, -1),
            future: [
              ...state.future,
              { nodes: state.nodes, edges: state.edges, activeDemoKey: state.activeDemoKey },
            ],
            ...previous,
          };
        }),

      redo: () =>
        set((state) => {
          const next = state.future.at(-1);
          if (!next) return state;
          return {
            future: state.future.slice(0, -1),
            past: [...state.past, { nodes: state.nodes, edges: state.edges, activeDemoKey: state.activeDemoKey }],
            ...next,
          };
        }),

      onNodesChange: (changes) =>
        set((state) => ({
          // В историю — только удаления; перемещения и выделение — нет.
          ...(changes.some((change) => change.type === 'remove') ? remember(state) : null),
          nodes: applyNodeChanges(changes, state.nodes),
        })),

      onEdgesChange: (changes) =>
        set((state) => ({
          ...(changes.some((change) => change.type === 'remove') ? remember(state) : null),
          edges: applyEdgeChanges(changes, state.edges),
        })),

      onConnect: (connection) =>
        set((state) => {
          if (!isValidConnection(connection, state.nodes, state.edges)) return state;
          return { ...remember(state), edges: addEdge(connection, state.edges) };
        }),

      addNode: (kind, position) =>
        set((state) => ({
          ...remember(state),
          nodes: [
            ...state.nodes,
            {
              id: `${kind}-${nextNodeNumber(state.nodes)}`,
              type: kind,
              position: position ?? spawnPosition(state.nodes.length),
              data: defaultNodeData(kind),
            } as WorkflowFlowNode,
          ],
        })),

      removeNode: (id) =>
        set((state) => ({
          ...remember(state),
          nodes: state.nodes.filter((node) => node.id !== id),
          edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
        })),

      removeEdge: (id) =>
        set((state) => ({
          ...remember(state),
          edges: state.edges.filter((edge) => edge.id !== id),
        })),

      updateNodeData: (id, patch) =>
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? ({ ...node, data: { ...node.data, ...patch } } as WorkflowFlowNode) : node,
          ),
        })),

      loadGraph: (nodes, edges, demoKey = null) =>
        set((state) => ({
          // Сидинг пустого canvas — не пользовательская правка, в историю не пишем.
          ...(state.nodes.length > 0 ? remember(state) : null),
          nodes,
          edges,
          activeDemoKey: demoKey,
        })),

      toGraph: () => ({
        // type у нод обязателен (Node<Data, 'kind'>); каст лишь коррелирует
        // пары kind↔data, которые map() стирает.
        nodes: get().nodes.map((node) => ({
          id: node.id,
          kind: node.type,
          data: node.data,
        })) as WorkflowGraph['nodes'],
        edges: get().edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          sourcePort: edge.sourceHandle ?? '',
          target: edge.target,
          targetPort: edge.targetHandle ?? '',
        })),
      }),
    }),
    {
      name: 'aiw-workflow',
      storage: createGraphStorage(),
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        activeDemoKey: state.activeDemoKey,
      }),
    },
  ),
);

// Загруженные картинки не персистим: многомегабайтные data-URL не влезают в квоту.
function stripImages(value: StorageValue<PersistedGraph>): StorageValue<PersistedGraph> {
  return {
    ...value,
    state: {
      ...value.state,
      nodes: value.state.nodes.map((node) =>
        node.type === 'image-input' ? { ...node, data: { imageDataUrl: null } } : node,
      ),
    },
  };
}

function spawnPosition(index: number): { x: number; y: number } {
  return { x: 80 + (index % 4) * 60, y: 80 + index * 40 };
}
