/**
 * OpenTelemetry SDK initialization.
 *
 * In production, this should be imported BEFORE any other modules
 * (typically via node --require or --import flag).
 *
 * For MVP, we provide a minimal setup that can be extended with
 * auto-instrumentations and exporters as needed.
 */

export interface OTelConfig {
  serviceName: string;
  enabled: boolean;
  traceEndpoint?: string;
  metricsPort?: number;
}

let initialized = false;

export async function initOTel(config: OTelConfig): Promise<void> {
  if (!config.enabled || initialized) return;

  try {
    // Dynamic import to avoid hard dependency when OTel packages are not installed
    // @ts-expect-error Optional dependency — installed only when OTel is needed
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    // @ts-expect-error Optional dependency
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

    const sdk = new NodeSDK({
      serviceName: config.serviceName,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    initialized = true;
    console.log(`[OTel] initialized for service: ${config.serviceName}`);
  } catch {
    console.warn('[OTel] SDK packages not installed, skipping initialization');
  }
}

export function isOTelInitialized(): boolean {
  return initialized;
}
