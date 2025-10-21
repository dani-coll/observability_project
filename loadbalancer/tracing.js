console.log('🔧 Loading loadbalancer tracing.js...');

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_SERVICE_INSTANCE_ID } = require('@opentelemetry/semantic-conventions');

console.log('📦 OpenTelemetry modules loaded successfully for loadbalancer');

// Get service identification from environment variables
const serviceName = process.env.SERVICE_NAME || 'loadbalancer-service';
const serviceInstanceId = process.env.SERVICE_INSTANCE_ID || process.env.HOSTNAME || require('os').hostname();
const serviceVersion = process.env.SERVICE_VERSION || '1.0.0';

console.log(`🏷️  Loadbalancer Service Identity: ${serviceName} (instance: ${serviceInstanceId}, version: ${serviceVersion})`);

// Create the SDK with proper configuration
const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [ATTR_SERVICE_INSTANCE_ID]: serviceInstanceId,
  }),
  traceExporter: new OTLPTraceExporter({
    url: 'http://otel-collector:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://otel-collector:4318/v1/metrics',
    }),
    exportIntervalMillis: 5000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
          // Don't trace health check requests to reduce noise
          return req.url === '/lb-health';
        }
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-dns': {
        enabled: true,
      },
    }),
  ],
});

// Initialize the SDK
try {
  sdk.start();
  console.log('✅ Loadbalancer OpenTelemetry SDK initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize loadbalancer OpenTelemetry SDK:', error);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('🔄 Loadbalancer OpenTelemetry SDK shut down successfully'))
    .catch((error) => console.log('❌ Error terminating loadbalancer OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});

module.exports = sdk;