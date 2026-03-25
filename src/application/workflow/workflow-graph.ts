import type { WorkflowType } from '../../domain/types.js';

export type NodeHandler<TState> = (state: TState) => Promise<TState>;

interface Edge<TState> {
  type: 'fixed' | 'conditional';
  to?: string;
  router?: (state: TState) => string;
}

export class WorkflowGraph<TState extends { currentNode: string }> {
  private nodes = new Map<string, NodeHandler<TState>>();
  private edges = new Map<string, Edge<TState>>();
  private entryPoint: string | null = null;

  addNode(id: string, handler: NodeHandler<TState>): this {
    this.nodes.set(id, handler);
    return this;
  }

  addEdge(from: string, to: string): this {
    this.edges.set(from, { type: 'fixed', to });
    return this;
  }

  addConditionalEdge(from: string, router: (state: TState) => string): this {
    this.edges.set(from, { type: 'conditional', router });
    return this;
  }

  setEntryPoint(nodeId: string): this {
    this.entryPoint = nodeId;
    return this;
  }

  compile(): CompiledWorkflow<TState> {
    if (!this.entryPoint) throw new Error('Entry point not set');
    if (!this.nodes.has(this.entryPoint)) throw new Error(`Entry node "${this.entryPoint}" not found`);
    return new CompiledWorkflow(this.nodes, this.edges, this.entryPoint);
  }
}

export class CompiledWorkflow<TState extends { currentNode: string }> {
  constructor(
    private nodes: Map<string, NodeHandler<TState>>,
    private edges: Map<string, Edge<TState>>,
    private entryPoint: string,
  ) {}

  get entry(): string {
    return this.entryPoint;
  }

  async step(state: TState): Promise<TState> {
    const nodeId = state.currentNode;
    const handler = this.nodes.get(nodeId);
    if (!handler) throw new Error(`Node "${nodeId}" not found`);

    const newState = await handler(state);

    const edge = this.edges.get(nodeId);
    if (!edge) return newState;

    const nextNode = edge.type === 'fixed' ? edge.to! : edge.router!(newState);
    if (!this.nodes.has(nextNode)) throw new Error(`Target node "${nextNode}" not found`);

    return { ...newState, currentNode: nextNode };
  }

  getNodeIds(): string[] {
    return [...this.nodes.keys()];
  }
}

export class WorkflowRegistry {
  private workflows = new Map<WorkflowType, CompiledWorkflow<any>>();

  register<T extends { currentNode: string }>(type: WorkflowType, workflow: CompiledWorkflow<T>): void {
    this.workflows.set(type, workflow);
  }

  get<T extends { currentNode: string }>(type: WorkflowType): CompiledWorkflow<T> | undefined {
    return this.workflows.get(type);
  }

  listTypes(): WorkflowType[] {
    return [...this.workflows.keys()];
  }
}
