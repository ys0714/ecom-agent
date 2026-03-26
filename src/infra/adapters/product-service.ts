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
    // ── 女装：连帽羽绒服 ──────────────────────────────
    ['p101', {
      productId: 'p101',
      productName: '连帽羽绒服 2025冬季新款',
      category: 'femaleClothing',
      price: 399,
      specs: [
        {
          propValueId: 'p101_s', productId: 'p101', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [80, 100], height: [150, 160], waistline: null, bust: [75, 85],
          footLength: null, size: 'S', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p101_m', productId: 'p101', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [95, 115], height: [155, 168], waistline: null, bust: [80, 92],
          footLength: null, size: 'M', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p101_l', productId: 'p101', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [110, 130], height: [162, 175], waistline: null, bust: [88, 100],
          footLength: null, size: 'L', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p101_xl', productId: 'p101', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [125, 150], height: [168, 180], waistline: null, bust: [95, 110],
          footLength: null, size: 'XL', bottomSize: null, shoeSize: null,
        },
      ],
    }],

    // ── 女装：高腰牛仔裤（下装，含腰围） ──────────────
    ['p102', {
      productId: 'p102',
      productName: '高腰直筒牛仔裤 春秋薄款',
      category: 'femaleClothing',
      price: 189,
      specs: [
        {
          propValueId: 'p102_26', productId: 'p102', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [80, 100], height: [150, 162], waistline: [63, 67], bust: null,
          footLength: null, size: null, bottomSize: 'S', shoeSize: null,
        },
        {
          propValueId: 'p102_27', productId: 'p102', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [95, 115], height: [155, 168], waistline: [66, 72], bust: null,
          footLength: null, size: null, bottomSize: 'M', shoeSize: null,
        },
        {
          propValueId: 'p102_28', productId: 'p102', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [110, 130], height: [160, 175], waistline: [70, 78], bust: null,
          footLength: null, size: null, bottomSize: 'L', shoeSize: null,
        },
        {
          propValueId: 'p102_29', productId: 'p102', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: [125, 145], height: [162, 178], waistline: [76, 84], bust: null,
          footLength: null, size: null, bottomSize: 'XL', shoeSize: null,
        },
      ],
    }],

    // ── 女鞋：运动鞋（含脚长） ────────────────────────
    ['p103', {
      productId: 'p103',
      productName: '轻便跑步鞋 透气网面',
      category: 'femaleClothing',
      price: 259,
      specs: [
        {
          propValueId: 'p103_36', productId: 'p103', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [225, 230], size: null, bottomSize: null, shoeSize: '36',
        },
        {
          propValueId: 'p103_37', productId: 'p103', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [230, 235], size: null, bottomSize: null, shoeSize: '37',
        },
        {
          propValueId: 'p103_38', productId: 'p103', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [235, 240], size: null, bottomSize: null, shoeSize: '38',
        },
        {
          propValueId: 'p103_39', productId: 'p103', category: 'femaleClothing',
          targetAudience: 'adult_female',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [240, 245], size: null, bottomSize: null, shoeSize: '39',
        },
      ],
    }],

    // ── 男装：商务夹克 ────────────────────────────────
    ['p201', {
      productId: 'p201',
      productName: '男士商务休闲夹克 2025春季',
      category: 'maleClothing',
      price: 459,
      specs: [
        {
          propValueId: 'p201_m', productId: 'p201', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: [110, 130], height: [165, 172], waistline: null, bust: [90, 100],
          footLength: null, size: 'M', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p201_l', productId: 'p201', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: [125, 150], height: [170, 178], waistline: null, bust: [96, 108],
          footLength: null, size: 'L', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p201_xl', productId: 'p201', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: [145, 170], height: [175, 185], waistline: null, bust: [104, 116],
          footLength: null, size: 'XL', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p201_2xl', productId: 'p201', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: [165, 200], height: [178, 190], waistline: null, bust: [112, 126],
          footLength: null, size: '2XL', bottomSize: null, shoeSize: null,
        },
      ],
    }],

    // ── 男装：休闲长裤（含腰围） ──────────────────────
    ['p202', {
      productId: 'p202',
      productName: '男士直筒休闲裤 弹力面料',
      category: 'maleClothing',
      price: 169,
      specs: [
        {
          propValueId: 'p202_30', productId: 'p202', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: [110, 130], height: [165, 175], waistline: [76, 82], bust: null,
          footLength: null, size: null, bottomSize: 'M', shoeSize: null,
        },
        {
          propValueId: 'p202_32', productId: 'p202', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: [125, 150], height: [170, 180], waistline: [80, 88], bust: null,
          footLength: null, size: null, bottomSize: 'L', shoeSize: null,
        },
        {
          propValueId: 'p202_34', productId: 'p202', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: [145, 175], height: [175, 185], waistline: [86, 96], bust: null,
          footLength: null, size: null, bottomSize: 'XL', shoeSize: null,
        },
      ],
    }],

    // ── 男鞋：皮鞋 ───────────────────────────────────
    ['p203', {
      productId: 'p203',
      productName: '商务正装皮鞋 头层牛皮',
      category: 'maleClothing',
      price: 369,
      specs: [
        {
          propValueId: 'p203_40', productId: 'p203', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [245, 250], size: null, bottomSize: null, shoeSize: '40',
        },
        {
          propValueId: 'p203_41', productId: 'p203', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [250, 255], size: null, bottomSize: null, shoeSize: '41',
        },
        {
          propValueId: 'p203_42', productId: 'p203', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [255, 260], size: null, bottomSize: null, shoeSize: '42',
        },
        {
          propValueId: 'p203_43', productId: 'p203', category: 'maleClothing',
          targetAudience: 'adult_male',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [260, 265], size: null, bottomSize: null, shoeSize: '43',
        },
      ],
    }],

    // ── 童装：儿童卫衣 ────────────────────────────────
    ['p301', {
      productId: 'p301',
      productName: '儿童卡通卫衣 纯棉加绒',
      category: 'childClothing',
      price: 89,
      specs: [
        {
          propValueId: 'p301_110', productId: 'p301', category: 'childClothing',
          targetAudience: 'child',
          weight: [30, 40], height: [105, 115], waistline: null, bust: null,
          footLength: null, size: '110', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p301_120', productId: 'p301', category: 'childClothing',
          targetAudience: 'child',
          weight: [35, 50], height: [115, 125], waistline: null, bust: null,
          footLength: null, size: '120', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p301_130', productId: 'p301', category: 'childClothing',
          targetAudience: 'child',
          weight: [45, 60], height: [125, 135], waistline: null, bust: null,
          footLength: null, size: '130', bottomSize: null, shoeSize: null,
        },
        {
          propValueId: 'p301_140', productId: 'p301', category: 'childClothing',
          targetAudience: 'child',
          weight: [55, 75], height: [135, 145], waistline: null, bust: null,
          footLength: null, size: '140', bottomSize: null, shoeSize: null,
        },
      ],
    }],

    // ── 童鞋：运动鞋 ─────────────────────────────────
    ['p302', {
      productId: 'p302',
      productName: '儿童运动鞋 魔术贴透气',
      category: 'childClothing',
      price: 129,
      specs: [
        {
          propValueId: 'p302_28', productId: 'p302', category: 'childClothing',
          targetAudience: 'child',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [170, 175], size: null, bottomSize: null, shoeSize: '28',
        },
        {
          propValueId: 'p302_30', productId: 'p302', category: 'childClothing',
          targetAudience: 'child',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [180, 185], size: null, bottomSize: null, shoeSize: '30',
        },
        {
          propValueId: 'p302_32', productId: 'p302', category: 'childClothing',
          targetAudience: 'child',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [195, 200], size: null, bottomSize: null, shoeSize: '32',
        },
        {
          propValueId: 'p302_34', productId: 'p302', category: 'childClothing',
          targetAudience: 'child',
          weight: null, height: null, waistline: null, bust: null,
          footLength: [210, 215], size: null, bottomSize: null, shoeSize: '34',
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
