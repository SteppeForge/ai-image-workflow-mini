import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { DEMO_BRANCHING } from '@/entities/workflow/model/demo';
import { useWorkflowStore } from '@/entities/workflow/model/store';
import { EditorPage } from '@/pages/editor/ui/EditorPage';

export function App() {
  // Сидим демо с ветвлением: при первом открытии на canvas сразу запускаемый
  // параллельный workflow, а не пустой экран.
  useEffect(() => {
    const { nodes, loadGraph } = useWorkflowStore.getState();
    if (nodes.length === 0) {
      loadGraph(DEMO_BRANCHING.nodes, DEMO_BRANCHING.edges, DEMO_BRANCHING.nameKey);
    }
  }, []);

  return (
    <ReactFlowProvider>
      <EditorPage />
    </ReactFlowProvider>
  );
}
