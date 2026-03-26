## 5. 项目排期

项目采用**纵向切片**（Vertical Slice）模式交付，绝大部分后端与核心引擎开发已完成。当前所处阶段：**收尾与全链路集成测试**。

| 阶段 | 核心任务 | 状态 | 涉及核心模块 |
|------|---------|------|---------|
| **阶段 1：基础画像与推荐引擎** | 订单提取、画像构建、覆盖率匹配算法、Redis 持久化 | ✅ 已完成 | `profile-engine`, `profile-store` |
| **阶段 2：对话主循环与架构设施** | Intent 路由、EventBus解耦、Model Slot 切换、四层架构建设 | ✅ 已完成 | `agent.ts`, `workflow`, `model-slot` |
| **阶段 3：推荐解释与仲裁机制** | 三层结构化解释、规则+LLM混合置信度偏好仲裁 | ✅ 已完成 | `explanation-generator`, `confidence-arbitrator` |
| **阶段 4：长文本与上下文记忆** | 滑动窗口 + 角色切换强制分段压缩 + 摘要主动注入 | ✅ 已完成 | `segment-compressor`, `sliding-window` |
| **阶段 5：数据飞轮与工程运维** | BadCase 收集/归因/调优、OTel 指标采集、安全护栏Guardrails | ✅ 已完成 | `data-flywheel`, `subscribers`, `guardrails` |
| **阶段 6：Web Chat 与调试面板** | 浏览器端交互面板、画像与仲裁的中间态 Debug 数据回显 | 🏃 进行中 | `web/app`, `DebugPanel` |
| **阶段 7：生产级打磨与端到端测试** | 前后端集成测试、核心深水区修复校验、异常边界回归 | 📋 待启动 | `tests/e2e`, 线上观测 |

---

---
