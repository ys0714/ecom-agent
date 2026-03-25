/**
 * OpenTelemetry SDK initialization placeholder.
 * Install @opentelemetry/* packages and enable via OTEL_ENABLED=true for production.
 */

export interface OTelConfig {
  serviceName: string;
  enabled: boolean;
}

let initialized = false;

export async function initOTel(config: OTelConfig): Promise<void> {
  if (!config.enabled || initialized) return;

  try {
    // @ts-expect-error Optional dependency
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
    console.warn('[OTel] packages not installed, skipping');
  }
}

export function isOTelInitialized(): boolean {
  return initialized;
}
