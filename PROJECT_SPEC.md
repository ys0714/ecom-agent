# 电商客服智能 Agent — 项目规格索引

本项目包含两个逻辑独立的系统，通过 `UserSpecProfile` / `ProductSpecProfile` 画像数据契约连接。

| 系统 | 文档 | 核心 LLM | 职责 |
|------|------|---------|------|
| **画像提取系统** | [SPEC-A-PROFILE.md](./SPEC-A-PROFILE.md) | Qwen3-8B(SFT/RL) | 离线清洗（T+1 画像构建）+ 在线匹配（覆盖率算法）+ SFT/GRPO 微调 |
| **客服 Agent** | [SPEC-B-AGENT.md](./SPEC-B-AGENT.md) | DeepSeek-Chat | 多轮对话 + 推荐解释 + 偏好仲裁 + 分段压缩记忆 + 数据飞轮 |
