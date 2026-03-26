## 2. 画像数据结构

系统针对服饰类目实现了精细化的身体特征画像。画像由大模型从用户历史购买订单中提取，以增量滚动 T+1 方式持续更新，存储于 Redis（key: `profile:{userId}`）。区间类特征采用 `[min, max]` 表示，尽可能扩大匹配范围——如用户曾购买身高 120-150 的女装 A 和身高 160-180 的女装 B，则画像中女性身高为 `[120.0, 180.0]`。

**用户尺码画像数据结构（`UserSpecProfile`）**：

```typescript
interface UserSpecProfile {
  userId: string;

  // 按性别/角色分组的身体特征（同一用户可能为自己和家人购买）
  femaleClothing?: GenderSpecProfile;   // 女装画像
  maleClothing?: GenderSpecProfile;     // 男装画像
  childClothing?: GenderSpecProfile;    // 童装画像

  defaultRole: 'female' | 'male' | 'child'; // 无法判断时的默认角色
  updatedAt: string;
}

interface GenderSpecProfile {
  weight: [number, number] | null;      // 体重区间（斤），如 [105, 115]
  height: [number, number] | null;      // 身高区间（cm），如 [160, 170]
  waistline: [number, number] | null;   // 腰围区间（cm），如 [66, 70]
  bust: [number, number] | null;        // 胸围区间（cm），如 [80, 90]
  footLength: [number, number] | null;  // 脚长区间（mm），如 [235, 245]
  size: string[] | null;                // 上装尺码集合，如 ["M", "L"]
  bottomSize: string[] | null;          // 下装尺码集合，如 ["M", "L"]
  shoeSize: string[] | null;            // 鞋码集合，如 ["37", "38"]
}
```

**商品规格画像数据结构（`ProductSpecProfile`）**：

商品画像由大模型从商品标题、规格数据中提取，按 `propValueId`（规格值 ID）粒度存储。每个规格值对应一组身体特征区间，用于与用户画像进行覆盖率匹配。

```typescript
interface ProductSpecProfile {
  propValueId: string;                  // 规格值 ID（如某个 SKU 的尺码 ID）
  productId: string;
  category: string;                     // 商品类目（femaleClothing / maleClothing / ...）
  targetAudience: 'adult_female' | 'adult_male' | 'child';

  // 该规格值对应的身体特征区间
  weight: [number, number] | null;      // 适合体重区间（斤）
  height: [number, number] | null;      // 适合身高区间（cm）
  waistline: [number, number] | null;   // 适合腰围区间（cm）
  bust: [number, number] | null;        // 适合胸围区间（cm）
  footLength: [number, number] | null;  // 适合脚长区间（mm）
  size: string | null;                  // 上装尺码，如 "XL"
  bottomSize: string | null;            // 下装尺码，如 "XL"
  shoeSize: string | null;              // 鞋码，如 "40"
}
```

**Redis 存储示例**：

```json
// 商品画像：key = product_spec:{propValueId}
{
  "propValueId": "105217133",
  "shoeSize": "40",
  "size": "2XL",
  "weight": [80, 110],
  "height": [160, 165],
  "bust": [80, 110]
}

// 用户画像：key = profile:{userId} → femaleClothing
{
  "weight": [105, 115],
  "height": [160, 170],
  "size": ["M"],
  "bottomSize": ["M"],
  "shoeSize": ["37", "38"],
  "footLength": [235, 245],
  "waistline": null,
  "bust": null
}
```

---
