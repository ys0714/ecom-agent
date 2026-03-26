import type { Order } from '../../domain/types.js';

export interface OrderService {
  getOrdersByUserId(userId: string, limit?: number): Promise<Order[]>;
}

/**
 * Mock implementation with sample clothing orders for development/testing.
 */
export class MockOrderService implements OrderService {
  private orders: Order[] = [
    // ── 用户 u001：女性，身高160-170，体重105-115，脚长235-240 ──
    {
      orderId: 'ord_001', userId: 'u001',
      items: [{
        productId: 'p001', productName: '2025新款打底衫修身',
        category: 'femaleClothing', specDescription: '尺码：M，体重区间100-115斤，身高区间160-168cm',
        price: 129, quantity: 1,
      }],
      totalAmount: 129, createdAt: '2025-09-10T10:00:00Z', status: 'delivered',
    },
    {
      orderId: 'ord_002', userId: 'u001',
      items: [{
        productId: 'p002', productName: '休闲运动鞋 网面透气',
        category: 'femaleClothing', specDescription: '鞋码：37，脚长区间235-240mm',
        price: 199, quantity: 1,
      }],
      totalAmount: 199, createdAt: '2025-10-05T14:00:00Z', status: 'delivered',
    },
    {
      orderId: 'ord_003', userId: 'u001',
      items: [{
        productId: 'p003', productName: '高腰直筒牛仔裤',
        category: 'femaleClothing', specDescription: '尺码：M，身高区间160-170cm，体重区间105-115斤，腰围区间66-70cm',
        price: 159, quantity: 1,
      }],
      totalAmount: 159, createdAt: '2025-11-01T09:00:00Z', status: 'delivered',
    },
    {
      orderId: 'ord_004', userId: 'u001',
      items: [{
        productId: 'p004', productName: '连帽羽绒服 中长款',
        category: 'femaleClothing', specDescription: '尺码：M，身高区间158-168cm，体重区间100-118斤，胸围区间82-90cm',
        price: 399, quantity: 1,
      }],
      totalAmount: 399, createdAt: '2025-11-20T16:00:00Z', status: 'delivered',
    },
    // u001 也帮老公买过男装
    {
      orderId: 'ord_005', userId: 'u001',
      items: [{
        productId: 'p005', productName: '男士休闲夹克 春秋款',
        category: 'maleClothing', specDescription: '尺码：XL，身高区间175-182cm，体重区间145-165斤',
        price: 329, quantity: 1,
      }],
      totalAmount: 329, createdAt: '2025-11-25T11:00:00Z', status: 'delivered',
    },
    // u001 帮孩子买过童装
    {
      orderId: 'ord_006', userId: 'u001',
      items: [{
        productId: 'p006', productName: '儿童卡通卫衣 纯棉',
        category: 'childClothing', specDescription: '尺码：120，身高区间115-125cm，体重区间35-45斤',
        price: 79, quantity: 1,
      }],
      totalAmount: 79, createdAt: '2025-12-01T09:00:00Z', status: 'delivered',
    },

    // ── 用户 u002：男性，身高175-180，体重140-155，脚长255-260 ──
    {
      orderId: 'ord_101', userId: 'u002',
      items: [{
        productId: 'p201', productName: '男士商务夹克',
        category: 'maleClothing', specDescription: '尺码：L，身高区间172-180cm，体重区间135-155斤，胸围区间100-108cm',
        price: 459, quantity: 1,
      }],
      totalAmount: 459, createdAt: '2025-10-15T10:00:00Z', status: 'delivered',
    },
    {
      orderId: 'ord_102', userId: 'u002',
      items: [{
        productId: 'p202', productName: '男士直筒休闲裤',
        category: 'maleClothing', specDescription: '尺码：L，身高区间170-180cm，体重区间130-155斤，腰围区间82-88cm',
        price: 169, quantity: 1,
      }],
      totalAmount: 169, createdAt: '2025-11-01T14:00:00Z', status: 'delivered',
    },
    {
      orderId: 'ord_103', userId: 'u002',
      items: [{
        productId: 'p203', productName: '商务正装皮鞋',
        category: 'maleClothing', specDescription: '鞋码：42，脚长区间255-260mm',
        price: 369, quantity: 1,
      }],
      totalAmount: 369, createdAt: '2025-11-20T16:00:00Z', status: 'delivered',
    },
  ];

  async getOrdersByUserId(userId: string, limit = 50): Promise<Order[]> {
    return this.orders
      .filter((o) => o.userId === userId)
      .slice(0, limit);
  }

  addMockOrder(order: Order): void {
    this.orders.push(order);
  }
}
