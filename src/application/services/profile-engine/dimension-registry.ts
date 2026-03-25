import type { ProfileDimensionPlugin } from '../../../domain/types.js';

export class ProfileDimensionRegistry {
  private plugins = new Map<string, ProfileDimensionPlugin>();

  register(plugin: ProfileDimensionPlugin): void {
    this.plugins.set(plugin.dimensionId, plugin);
  }

  unregister(dimensionId: string): void {
    this.plugins.delete(dimensionId);
  }

  getPlugin(dimensionId: string): ProfileDimensionPlugin | undefined {
    return this.plugins.get(dimensionId);
  }

  getPluginsForCategory(category: string): ProfileDimensionPlugin[] {
    return [...this.plugins.values()].filter((p) =>
      !p.applicableCategories || p.applicableCategories.includes(category)
    );
  }

  listAll(): ProfileDimensionPlugin[] {
    return [...this.plugins.values()];
  }
}
