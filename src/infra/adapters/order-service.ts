import type { Order } from '../../domain/types.js';

export interface OrderService {
  getOrdersByUserId(userId: string, limit?: number): Promise<Order[]>;
}

/**
 * Mock implementation with sample clothing orders for development/testing.
 */
export class MockOrderService implements OrderService {
  private orders: Order[] = [
    {
      orderId: 'ord_001', userId: 'u001',
      items: [{
        productId: 'p001', productName: '2025新款打底彩修身L',
        category: 'femaleClothing', specDescription: '尺码：S，体重区间105-115斤',
        price: 129, quantity: 1,
      }],
      totalAmount: 129, createdAt: '2025-11-01T10:00:00Z', status: 'delivered',
    },
    {
      orderId: 'ord_002', userId: 'u001',
      items: [{
        productId: 'p002', productName: '板鞋小白鞋42码（内长250-255mm）',
        category: 'femaleClothing', specDescription: '鞋码：42，脚长区间250-255mm',
        price: 199, quantity: 1,
      }],
      totalAmount: 199, createdAt: '2025-11-15T14:00:00Z', status: 'delivered',
    },
    {
      orderId: 'ord_003', userId: 'u001',
      items: [{
        productId: 'p003', productName: '牛仔裤黑色M（170-175）',
        category: 'femaleClothing', specDescription: '尺码：M，身高区间170-175cm，体重区间105-115斤',
        price: 159, quantity: 1,
      }],
      totalAmount: 159, createdAt: '2025-12-01T09:00:00Z', status: 'delivered',
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
