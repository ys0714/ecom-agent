import { ok, err, Result } from 'neverthrow';
import type {
  UserSpecProfile, GenderSpecProfile, GenderRole,
  ProfileMeta, ColdStartStage, DimensionData, ProfileDelta,
  NumericRange,
} from '../types.js';

const COMPLETENESS_THRESHOLDS = { cold: 0.3, warm: 0.7 } as const;

function computeGenderCompleteness(g: GenderSpecProfile | undefined): number {
  if (!g) return 0;
  const fields: (keyof GenderSpecProfile)[] = [
    'weight', 'height', 'waistline', 'bust', 'footLength', 'size', 'bottomSize', 'shoeSize',
  ];
  const filled = fields.filter((f) => g[f] !== null && g[f] !== undefined).length;
  return filled / fields.length;
}

function mergeRange(existing: NumericRange | null, incoming: NumericRange | null): NumericRange | null {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return [Math.min(existing[0], incoming[0]), Math.max(existing[1], incoming[1])];
}

function mergeStringArray(existing: string[] | null, incoming: string[] | null): string[] | null {
  if (!incoming) return existing;
  if (!existing) return incoming;
  return [...new Set([...existing, ...incoming])];
}

export class UserProfileEntity {
  readonly userId: string;
  private _spec: UserSpecProfile;
  private _meta: ProfileMeta;
  private _dimensions: Map<string, DimensionData>;

  constructor(userId: string, spec?: Partial<UserSpecProfile>, meta?: Partial<ProfileMeta>) {
    this.userId = userId;
    this._spec = {
      userId,
      defaultRole: spec?.defaultRole ?? 'female',
      femaleClothing: spec?.femaleClothing,
      maleClothing: spec?.maleClothing,
      childClothing: spec?.childClothing,
      updatedAt: spec?.updatedAt ?? new Date().toISOString(),
    };
    this._meta = {
      totalOrders: meta?.totalOrders ?? 0,
      profileCompleteness: meta?.profileCompleteness ?? 0,
      lastOrderAt: meta?.lastOrderAt ?? '',
      dataFreshness: meta?.dataFreshness ?? 0,
      coldStartStage: meta?.coldStartStage ?? 'cold',
    };
    this._dimensions = new Map();
    this.recalcCompleteness();
  }

  get spec(): Readonly<UserSpecProfile> {
    return this._spec;
  }

  get meta(): Readonly<ProfileMeta> {
    return this._meta;
  }

  getGenderProfile(role?: GenderRole): GenderSpecProfile | undefined {
    const r = role ?? this._spec.defaultRole;
    switch (r) {
      case 'female': return this._spec.femaleClothing;
      case 'male': return this._spec.maleClothing;
      case 'child': return this._spec.childClothing;
    }
  }

  applyDelta(delta: ProfileDelta): Result<void, string> {
    if (delta.dimensionId === 'specPreference') {
      return this.applySpecDelta(delta);
    }
    this._dimensions.set(delta.dimensionId, {
      ...this._dimensions.get(delta.dimensionId),
      ...delta.delta,
    });
    this._spec.updatedAt = new Date().toISOString();
    this.recalcCompleteness();
    return ok(undefined);
  }

  private applySpecDelta(delta: ProfileDelta): Result<void, string> {
    const role = (delta.delta.role as GenderRole) ?? this._spec.defaultRole;
    const incoming = delta.delta as Partial<GenderSpecProfile>;
    const key = `${role}Clothing` as 'femaleClothing' | 'maleClothing' | 'childClothing';
    const existing = this._spec[key] ?? this.emptyGenderProfile();

    const merged: GenderSpecProfile = {
      weight: mergeRange(existing.weight, incoming.weight ?? null),
      height: mergeRange(existing.height, incoming.height ?? null),
      waistline: mergeRange(existing.waistline, incoming.waistline ?? null),
      bust: mergeRange(existing.bust, incoming.bust ?? null),
      footLength: mergeRange(existing.footLength, incoming.footLength ?? null),
      size: mergeStringArray(existing.size, incoming.size ?? null),
      bottomSize: mergeStringArray(existing.bottomSize, incoming.bottomSize ?? null),
      shoeSize: mergeStringArray(existing.shoeSize, incoming.shoeSize ?? null),
    };

    this._spec = { ...this._spec, [key]: merged, updatedAt: new Date().toISOString() };
    this.recalcCompleteness();
    return ok(undefined);
  }

  summarizeForPrompt(): string {
    const parts: string[] = [];
    const roles: { key: 'femaleClothing' | 'maleClothing' | 'childClothing'; label: string }[] = [
      { key: 'femaleClothing', label: '女装' },
      { key: 'maleClothing', label: '男装' },
      { key: 'childClothing', label: '童装' },
    ];

    for (const { key, label } of roles) {
      const g = this._spec[key];
      if (!g) continue;
      const attrs: string[] = [];
      if (g.weight) attrs.push(`体重${g.weight[0]}-${g.weight[1]}斤`);
      if (g.height) attrs.push(`身高${g.height[0]}-${g.height[1]}cm`);
      if (g.size) attrs.push(`上装${g.size.join('/')}`);
      if (g.bottomSize) attrs.push(`下装${g.bottomSize.join('/')}`);
      if (g.shoeSize) attrs.push(`鞋码${g.shoeSize.join('/')}`);
      if (g.waistline) attrs.push(`腰围${g.waistline[0]}-${g.waistline[1]}cm`);
      if (g.bust) attrs.push(`胸围${g.bust[0]}-${g.bust[1]}cm`);
      if (g.footLength) attrs.push(`脚长${g.footLength[0]}-${g.footLength[1]}mm`);
      if (attrs.length > 0) {
        parts.push(`${label}：${attrs.join('，')}`);
      }
    }

    if (parts.length === 0) return '暂无画像数据';

    const stage = this._meta.coldStartStage;
    const prefix = stage === 'cold' ? '[冷启动] ' : stage === 'warm' ? '[画像积累中] ' : '';
    return `${prefix}${parts.join('；')}`;
  }

  getCompleteness(): number {
    return this._meta.profileCompleteness;
  }

  getColdStartStage(): ColdStartStage {
    return this._meta.coldStartStage;
  }

  setMeta(partial: Partial<ProfileMeta>): void {
    Object.assign(this._meta, partial);
    this.recalcCompleteness();
  }

  getDimension(dimensionId: string): DimensionData | undefined {
    return this._dimensions.get(dimensionId);
  }

  toJSON(): { spec: UserSpecProfile; meta: ProfileMeta; dimensions: Record<string, DimensionData> } {
    return {
      spec: this._spec,
      meta: this._meta,
      dimensions: Object.fromEntries(this._dimensions),
    };
  }

  static fromJSON(data: {
    spec: UserSpecProfile;
    meta: ProfileMeta;
    dimensions?: Record<string, DimensionData>;
  }): UserProfileEntity {
    const entity = new UserProfileEntity(data.spec.userId, data.spec, data.meta);
    if (data.dimensions) {
      for (const [k, v] of Object.entries(data.dimensions)) {
        entity._dimensions.set(k, v);
      }
    }
    return entity;
  }

  mergeSessionProfile(sessionProfile: UserProfileEntity): void {
    const roles: ('femaleClothing' | 'maleClothing' | 'childClothing')[] = ['femaleClothing', 'maleClothing', 'childClothing'];
    
    for (const role of roles) {
      const sessData = sessionProfile._spec[role];
      if (!sessData) continue;
      
      let permData = this._spec[role];
      if (!permData) {
        permData = this.emptyGenderProfile();
        this._spec[role] = permData;
      }
      
      for (const [k, v] of Object.entries(sessData)) {
        if (v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : true)) {
          (permData as any)[k] = v;
        }
      }
    }

    for (const [dimId, data] of sessionProfile._dimensions.entries()) {
      this._dimensions.set(dimId, {
        ...this._dimensions.get(dimId),
        ...data,
      });
    }
    
    this._spec.updatedAt = new Date().toISOString();
    this.recalcCompleteness();
  }

  private recalcCompleteness(): void {
    const scores = [
      computeGenderCompleteness(this._spec.femaleClothing),
      computeGenderCompleteness(this._spec.maleClothing),
      computeGenderCompleteness(this._spec.childClothing),
    ].filter((s) => s > 0);

    this._meta.profileCompleteness = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    const c = this._meta.profileCompleteness;
    if (c < COMPLETENESS_THRESHOLDS.cold) {
      this._meta.coldStartStage = 'cold';
    } else if (c < COMPLETENESS_THRESHOLDS.warm) {
      this._meta.coldStartStage = 'warm';
    } else {
      this._meta.coldStartStage = 'hot';
    }
  }

  private emptyGenderProfile(): GenderSpecProfile {
    return {
      weight: null, height: null, waistline: null, bust: null,
      footLength: null, size: null, bottomSize: null, shoeSize: null,
    };
  }
}
