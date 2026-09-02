import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_BRANCHING, DEMO_LINEAR } from './demo';
import { useWorkflowStore } from './store';

describe('workflow store', () => {
  beforeEach(() => {
    useWorkflowStore.setState({ nodes: [], edges: [], past: [], future: [], activeDemoKey: null });
  });

  it('addNode creates a node with default data for its kind', () => {
    useWorkflowStore.getState().addNode('prompt');
    const [node] = useWorkflowStore.getState().nodes;
    expect(node.type).toBe('prompt');
    expect(node.data).toEqual({ text: '' });
  });

  it('updateNodeData patches only the target node', () => {
    const store = useWorkflowStore.getState();
    store.addNode('prompt');
    store.addNode('prompt');
    const [first, second] = useWorkflowStore.getState().nodes;

    useWorkflowStore.getState().updateNodeData(first.id, { text: 'hello' });

    const after = useWorkflowStore.getState().nodes;
    expect(after.find((n) => n.id === first.id)?.data).toEqual({ text: 'hello' });
    expect(after.find((n) => n.id === second.id)?.data).toEqual({ text: '' });
  });

  it('loadGraph continues id numbering after the highest existing suffix', () => {
    useWorkflowStore
      .getState()
      .loadGraph(
        [{ id: 'prompt-9', type: 'prompt', position: { x: 0, y: 0 }, data: { text: 'x' } }],
        [],
      );

    useWorkflowStore.getState().addNode('prompt');

    const ids = useWorkflowStore.getState().nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('prompt-10');
  });

  it('removeNode drops the node together with its connections', () => {
    useWorkflowStore.getState().loadGraph(DEMO_BRANCHING.nodes, DEMO_BRANCHING.edges);

    useWorkflowStore.getState().removeNode('prompt-1');

    const { nodes, edges } = useWorkflowStore.getState();
    expect(nodes.some((n) => n.id === 'prompt-1')).toBe(false);
    expect(edges.some((e) => e.source === 'prompt-1' || e.target === 'prompt-1')).toBe(false);
    // Несвязанные рёбра остаются.
    expect(edges.some((e) => e.source === 'generate-1' && e.target === 'result-1')).toBe(true);
  });

  it('removeEdge разрывает только указанное соединение, ноды остаются', () => {
    useWorkflowStore.getState().loadGraph(DEMO_BRANCHING.nodes, DEMO_BRANCHING.edges);
    const target = DEMO_BRANCHING.edges[0];

    useWorkflowStore.getState().removeEdge(target.id);

    const { nodes, edges } = useWorkflowStore.getState();
    expect(edges.some((e) => e.id === target.id)).toBe(false);
    expect(edges).toHaveLength(DEMO_BRANCHING.edges.length - 1);
    expect(nodes).toHaveLength(DEMO_BRANCHING.nodes.length);

    // Разрыв соединения отменяется через undo.
    useWorkflowStore.getState().undo();
    expect(useWorkflowStore.getState().edges.some((e) => e.id === target.id)).toBe(true);
  });

  it('onConnect adds only valid connections', () => {
    const store = useWorkflowStore.getState();
    store.loadGraph(DEMO_BRANCHING.nodes, []);

    store.onConnect({ source: 'prompt-1', sourceHandle: 'text', target: 'generate-1', targetHandle: 'prompt' });
    expect(useWorkflowStore.getState().edges).toHaveLength(1);

    // Несовместимые типы отклоняются без исключения.
    store.onConnect({ source: 'prompt-1', sourceHandle: 'text', target: 'result-1', targetHandle: 'image' });
    expect(useWorkflowStore.getState().edges).toHaveLength(1);
  });

  it('удаление ноды с рёбрами — одна запись в истории, один undo', () => {
    useWorkflowStore.getState().loadGraph(DEMO_BRANCHING.nodes, DEMO_BRANCHING.edges);
    useWorkflowStore.setState({ past: [], future: [] });

    // React Flow при удалении связанной ноды шлёт два пакета подряд:
    // сначала рёбра, потом саму ноду.
    const { onEdgesChange, onNodesChange } = useWorkflowStore.getState();
    onEdgesChange([
      { id: 'prompt-1->generate-1', type: 'remove' },
      { id: 'prompt-1->generate-2', type: 'remove' },
    ]);
    onNodesChange([{ id: 'prompt-1', type: 'remove' }]);

    expect(useWorkflowStore.getState().past).toHaveLength(1);

    useWorkflowStore.getState().undo();

    const { nodes, edges } = useWorkflowStore.getState();
    expect(nodes).toHaveLength(DEMO_BRANCHING.nodes.length);
    expect(edges).toHaveLength(DEMO_BRANCHING.edges.length);
  });

  it('undo restores a removed node, redo removes it again', () => {
    useWorkflowStore.getState().loadGraph(DEMO_BRANCHING.nodes, DEMO_BRANCHING.edges);
    useWorkflowStore.getState().removeNode('prompt-1');
    expect(useWorkflowStore.getState().nodes.some((n) => n.id === 'prompt-1')).toBe(false);

    useWorkflowStore.getState().undo();
    expect(useWorkflowStore.getState().nodes.some((n) => n.id === 'prompt-1')).toBe(true);
    expect(useWorkflowStore.getState().edges).toHaveLength(DEMO_BRANCHING.edges.length);

    useWorkflowStore.getState().redo();
    expect(useWorkflowStore.getState().nodes.some((n) => n.id === 'prompt-1')).toBe(false);
  });

  it('a new edit after undo clears the redo stack', () => {
    const store = useWorkflowStore.getState();
    store.addNode('prompt');
    store.addNode('result');

    useWorkflowStore.getState().undo();
    expect(useWorkflowStore.getState().future).toHaveLength(1);

    useWorkflowStore.getState().addNode('edit');
    expect(useWorkflowStore.getState().future).toHaveLength(0);
  });

  it('loadGraph запоминает демо-шаблон, undo возвращает предыдущий', () => {
    // Точка возврата для «Сброса» должна следовать за выбранным демо.
    useWorkflowStore.getState().loadGraph(DEMO_BRANCHING.nodes, DEMO_BRANCHING.edges, DEMO_BRANCHING.nameKey);
    expect(useWorkflowStore.getState().activeDemoKey).toBe('demoBranching');

    useWorkflowStore.getState().loadGraph(DEMO_LINEAR.nodes, DEMO_LINEAR.edges, DEMO_LINEAR.nameKey);
    expect(useWorkflowStore.getState().activeDemoKey).toBe('demoLinear');

    useWorkflowStore.getState().undo();
    expect(useWorkflowStore.getState().activeDemoKey).toBe('demoBranching');
  });

  it('toGraph maps canvas state to the transport graph definition', () => {
    useWorkflowStore.getState().loadGraph(DEMO_BRANCHING.nodes, DEMO_BRANCHING.edges);

    const graph = useWorkflowStore.getState().toGraph();

    expect(graph.nodes).toHaveLength(DEMO_BRANCHING.nodes.length);
    expect(graph.nodes[0]).toEqual({ id: 'prompt-1', kind: 'prompt', data: { text: 'A lighthouse in a storm' } });
    const edge = graph.edges.find((e) => e.source === 'prompt-1' && e.target === 'generate-1');
    expect(edge).toMatchObject({ sourcePort: 'text', targetPort: 'prompt' });
  });
});
