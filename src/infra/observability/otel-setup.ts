import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { trace, type Tracer } from '@opentelemetry/api';

export interface OTelConfig {
  serviceName: string;
  enabled: boolean;
  prometheusPort?: number;
}

let sdk: NodeSDK | null = null;

export function initOTel(config: OTelConfig): void {
  if (!config.enabled || sdk) return;

  const prometheusExporter = new PrometheusExporter({
    port: config.prometheusPort ?? 9464,
    preventServerStart: false,
  });

  sdk = new NodeSDK({
    serviceName: config.serviceName,
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[OTel] initialized: service=${config.serviceName}, prometheus=:${config.prometheusPort ?? 9464}`);
}

export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

export function isOTelInitialized(): boolean {
  return sdk !== null;
}

export async function shutdownOTel(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
