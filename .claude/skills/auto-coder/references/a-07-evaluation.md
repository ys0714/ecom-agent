## 7. 评测方案

### 7.1 性能测试

| 测试目标 | 方法 | 验收标准 |
|---------|------|---------|
| 8B 模型推理延迟 | 1000 次规格推理 benchmark | P50 < 150ms, P99 < 500ms |
| 画像构建耗时 | 1000 用户画像构建 | P50 < 50ms (纯 CPU) |
| 冲突仲裁耗时 | 10000 次仲裁计算 | P50 < 5ms |
| 上下文压缩耗时 | 200 轮对话压缩 | < 100ms (零 LLM 调用层) |
| Redis 画像读取 | 10000 次随机读 | P50 < 2ms |

### 7.2 回归测试

| 测试目标 | 方法 | 说明 |
|---------|------|------|
| 规格推荐准确率 | 标注数据集 (≥500 case) | 8B-SFT 准确率 ≥ 72B 基线的 95% |
| Prompt 优化效果 | A/B 实验离线回放 | 优化后 badcase 率下降 ≥ 10% |

---

## 附录 A: 真实训练数据格式

### A.1 用户画像提取训练数据

```json
[
  {
    "instruction": "提取用户特征......",
    "input": "{\"女装\":[{\"item_title\":\"拼色长袖衬衫女士2025新款春秋洋气时尚宽松假两件衬衣休闲上衣潮\",\"sku_desc\":\"红色,XL  (建议115-125斤)\"},{\"item_title\":\"2025休闲裤女春夏新款梨形身材小个子宽松显瘦九分裤(气球裤)\",\"sku_desc\":\"白色,M  (80-105斤)\"}]}",
    "output": "{\"userProfileMap\":{\"female\":{\"weight\":[80.0,125.0],\"clothingSize\":[\"XL\"],\"plantsSize\":[\"M\"]}},\"defaultRole\":\"female\"}"
  },
  {
    "instruction": "提取用户特征......",
    "input": "{\"内衣/家居服/袜子\":[{\"item_title\":\"【透气  防臭 吸汗】精品男士防臭运动袜  不闷脚不臭脚！10双13.9\",\"sku_desc\":\"防滑耐磨不掉跟！吸汗透气【10双】13.9包邮\"}]}",
    "output": "{\"userProfileMap\":{},\"defaultRole\":\"male\"}"
  }
]
```

### A.2 模型输出画像结构

```json
{
  "userProfileMap": {
    "male":   {"weight": "[number, number] | null", "height": "[number, number] | null", "waist": "[number, number] | null", "bust": "[number, number] | null", "footLength": "[number, number] | null", "clothingSize": "string[] | null", "plantsSize": "string[] | null", "shoeSize": "string[] | null"},
    "female": {"weight": "[number, number] | null", "height": "[number, number] | null", "waist": "[number, number] | null", "bust": "[number, number] | null", "footLength": "[number, number] | null", "clothingSize": "string[] | null", "plantsSize": "string[] | null", "shoeSize": "string[] | null"},
    "child":  {"weight": "[number, number] | null", "height": "[number, number] | null", "waist": "[number, number] | null", "bust": "[number, number] | null", "footLength": "[number, number] | null", "clothingSize": "string[] | null", "plantsSize": "string[] | null", "shoeSize": "string[] | null"}
  },
  "defaultRole": "female | male | child"
}
```

### A.3 字段映射（模型输出 → 代码字段）

模型输出的字段名与代码中 `types.ts` 定义的字段名存在差异，映射在 `order-analyzer.ts` 中完成：

| 模型输出字段 | 代码字段 (types.ts) | 说明 |
|-------------|-------------------|------|
| `userProfileMap.female` | `femaleClothing` | 女装画像 |
| `userProfileMap.male` | `maleClothing` | 男装画像 |
| `userProfileMap.child` | `childClothing` | 童装画像 |
| `waist` | `waistline` | 腰围 |
| `clothingSize` | `size` | 上装尺码 |
| `plantsSize` | `bottomSize` | 下装尺码 |
