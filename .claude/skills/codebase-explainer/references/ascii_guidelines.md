# ASCII Architecture Diagram Best Practices

To fulfill the "highly readable" (人类高度可读) requirement of the `codebase-explainer` skill, please adhere to these ASCII/Unicode text diagram design principles when generating architecture diagrams:

## 1. Top-Down or Left-Right Flow
Organize the diagram with a clear flow. Use arrows (`▼`, `▶`, `▲`, `◀`) to indicate direction. 

## 2. Logical Grouping with Boxes
Use Unicode box-drawing characters to group related components into semantic regions. This significantly lowers the cognitive load for human readers.
Use `┌ ┐ └ ┘ ─ │` for boundaries.

```text
┌───────────────────────────────────────────┐
│              接入层 (API & UI)            │
│   ┌──────────────┐     ┌──────────────┐   │
│   │ FastAPI 接口 │     │ Streamlit 面板│   │
│   └──────┬───────┘     └──────┬───────┘   │
└──────────┼────────────────────┼───────────┘
           │                    │
           ▼                    ▼
┌───────────────────────────────────────────┐
│               核心业务逻辑                │
│            ┌─────────────┐                │
│            │ RAG Pipeline│                │
│            └─────────────┘                │
└───────────────────────────────────────────┘
```

## 3. Informative Node Labels
Labels inside the boxes should describe **what the component does**, not just its class name. 
- Bad: `│ HybridSearcher │`
- Good: `│ 混合检索器(HybridSearcher) │`

## 4. Descriptive Edge Labels
Transitions between nodes must be labeled if the data flow isn't completely obvious. Use spaces to break lines or put text alongside arrows.
- Bad: 
```
  │
  ▼
```
- Good:
```
  │ 提炼用户意图
  │ (Query Rewrite)
  ▼
```

## 5. Less is More
Do not diagram every single helper function or utility class. Focus on the macroscopic building blocks. Abstract away low-level implementation details into higher-level logical nodes.

## 6. ASCII Art Tooling Tips
For complex layouts, ensure alignment of pipes (`│`) and dashes (`─`) to keep the diagram looking professional and clean. Avoid mixed-width character misalignment where possible by padding with spaces appropriately.