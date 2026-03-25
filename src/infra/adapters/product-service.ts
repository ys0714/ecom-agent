import type { ProductInfo, ProductSpecProfile } from '../../domain/types.js';

export interface ProductService {
  getProductById(productId: string): Promise<ProductInfo | null>;
  getProductSpecProfiles(productId: string): Promise<ProductSpecProfile[]>;
}

/**
 * Mock implementation with sample products for development/testing.
 */
export class MockProductService implements ProductService {
  private products: Map<string, ProductInfo> = new Map([
    ['p101', {
      productId: 'p101',
      productName: '连帽羽绒服 2025冬季新款',
      category: 'femaleClothing',
      price: 399,
      specs: [
        {
          propValueId: 'pv_s', productId: 'p101', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [80, 100], height: [150, 160], waistline: null, bust: [75, 85],
          footLength: null, size: 'S', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'pv_m', productId: 'p101', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [95, 115], height: [155, 168], waistline: null, bust: [80, 92],
          footLength: null, size: 'M', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'pv_l', productId: 'p101', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [110, 130], height: [162, 175], waistline: null, bust: [88, 100],
          footLength: null, size: 'L', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'pv_xl', productId: 'p101', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [125, 150], height: [168, 180], waistline: null, bust: [95, 110],
          footLength: null, size: 'XL', bottomSize: null, shoeSize: null,
        },
      ],
    }],
  ]);

  async getProductById(productId: string): Promise<ProductInfo | null> {
    return this.products.get(productId) ?? null;
  }

  async getProductSpecProfiles(productId: string): Promise<ProductSpecProfile[]> {
    const product = this.products.get(productId);
    return product?.specs ?? [];
  }

  addMockProduct(product: ProductInfo): void {
    this.products.set(product.productId, product);
  }
}
