---
name: codebase-explainer
description: 梳理文档与代码对应关系，生成人类高度可读的 ASCII 纯文本架构图，并结合代码深入讲解核心实现步骤。当用户说"讲解代码"、"生成架构图"、"梳理代码"、"解析源码"、"explain codebase"、"draw architecture"、"梳理每章对应代码" 时使用。
---

# Codebase Explainer (源码架构解析助手)

This skill enables the agent to systematically analyze a codebase, map it to documentation chapters/features, generate human-readable architecture diagrams, and explain key implementations step-by-step with real code references.

## 核心工作流 (Core Workflow)

当收到解析代码或梳理架构的请求时，请严格按照以下三个阶段执行：

### 参考文件

| 文件 | 用途 |
|------|------|
| [references/ecom-agent-walkthrough.md](references/ecom-agent-walkthrough.md) | 已完成的 ecom-agent 全景讲解（映射表 + 架构图 + 6 步代码讲解），可作为增量更新的基线 |
| [references/ascii_guidelines.md](references/ascii_guidelines.md) | ASCII 架构图绘制规范 |

### 1. 梳理文档与代码映射关系 (Mapping)
- 阅读用户提供的需求文档、设计文档（如 `PROJECT_SPEC.md`）或口述的功能说明。
- 结合系统提供的工具（如 `Glob` 查找文件、`Read` 阅读文件、`SemanticSearch` 语义搜索），在代码库中找出每个章节/模块对应的核心代码文件。
- 输出一份结构清晰的**「模块 -> 对应核心文件路径」**映射清单。

### 2. 绘制高可读性架构图 (Architecture Diagram)
- 结合梳理出的代码结构，使用**纯文本图形/ASCII 图形**（包含横竖线、方框等特殊字符）绘制整体架构图或数据流图。
- **不使用 Mermaid**，而是使用结构化的 ASCII/Unicode 字符画（如 `┌──┐`, `│`, `├─`, `▼`）。
- **绘图原则**：
  - **人类高可读**：不要堆砌过多的细枝末节代码类名，突出"业务概念/核心组件"、"模块间调用关系"及"数据流向"。
  - **逻辑分层**：使用外层大方框将不同层级或边界（如 API 层、核心业务层、数据持久层）清晰区分开来。
  - **图文并茂**：在图的连线上或方框旁边加上描述性的文字注释。

### 3. 结合代码讲解关键实现 (Code Walkthrough)
- 按照业务流程或文档章节，分步骤进行深度讲解。
- 每一步讲解必须包含以下三要素：
  1. **意图与目标**：这一步在做什么？业务逻辑或设计初衷是什么？
  2. **源码引用**：使用准确的代码引用格式（` ```startLine:endLine:filepath `），截取项目中**最核心的几行代码**，过滤掉无关紧要的 imports 和 logging 等样板代码，保持版面干净。
  3. **技术亮点/设计模式解析**：解释这几行核心代码为什么这么写（如用到了什么设计模式、为什么是工厂模式、为什么采用某特定算法或数据结构等）。

## 参考输出范例 (Example Output Format)

### 阶段 1：模块与代码映射
- **第一章：数据摄取 (Ingestion)** -> `src/ingestion/pipeline.py`, `src/ingestion/loader.py`
- **第二章：混合检索 (Retrieval)** -> `src/retrieval/hybrid.py`

### 阶段 2：系统架构图
```text
┌─────────────────────────────────────────────────────────┐
│                      API 接入层                         │
│   ┌────────────────┐             ┌────────────────┐     │
│   │   API Server   │             │   Dashboard    │     │
│   └───────┬────────┘             └───────┬────────┘     │
└───────────┼──────────────────────────────┼──────────────┘
            │ 1. 查询请求                  │
            ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                    核心处理逻辑                         │
│                 ┌──────────────────┐                    │
│                 │  Hybrid Search   │                    │
│                 └────┬────────┬────┘                    │
│         2a. 语义匹配 │        │ 2b. 关键词匹配          │
│                      ▼        ▼                         │
│   ┌────────────────────┐    ┌────────────────────┐      │
│   │  Dense Retriever   │    │  Sparse Retriever  │      │
│   └─────────┬──────────┘    └─────────┬──────────┘      │
│             │                         │                 │
│             └───────────┐ ┌───────────┘                 │
│                         ▼ ▼                             │
│                 ┌──────────────────┐                    │
│                 │    RRF Fusion    │                    │
│                 └──────────────────┘                    │
└─────────────────────────┼───────────────────────────────┘
                          │ 3. 存储交互
                          ▼
┌─────────────────────────────────────────────────────────┐
│                       存储层                            │
│                 ┌──────────────────┐                    │
│                 │ VectorDB(Chroma) │                    │
│                 └──────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### 阶段 3：关键代码实现讲解
#### 步骤 1：混合检索策略 (Hybrid Search)
为了兼顾长尾词的精确匹配和同义词的泛化，系统在此处采用了结合向量检索与 BM25 的混合召回策略。
```15:23:src/retrieval/hybrid.py
def hybrid_search(self, query: str, top_k: int = 10) -> List[Document]:
    # 并发进行稠密与稀疏检索
    dense_results = self.dense_retriever.invoke(query, k=top_k)
    sparse_results = self.sparse_retriever.invoke(query, k=top_k)
    
    # RRF 倒数排序融合
    return self._rrf_fusion(dense_results, sparse_results)
```
**深度解析**：在这里采用 RRF（Reciprocal Rank Fusion）可以在无需依赖归一化分数对齐的情况下，公平融合不同维度的检索结果分数。
