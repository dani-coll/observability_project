console.log('🔧 Loading tracing.js...');

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_SERVICE_INSTANCE_ID } = require('@opentelemetry/semantic-conventions');

console.log('📦 OpenTelemetry modules loaded successfully');

// Debug: Log all environment variables related to service identification
console.log('🔍 Environment Variables Check:');
console.log('  SERVICE_NAME:', process.env.SERVICE_NAME);
console.log('  SERVICE_INSTANCE_ID:', process.env.SERVICE_INSTANCE_ID);
console.log('  SERVICE_VERSION:', process.env.SERVICE_VERSION);
console.log('  HOSTNAME:', process.env.HOSTNAME);

// Get service identification from environment variables
const serviceName = process.env.SERVICE_NAME || 'backend-service';
const serviceInstanceId = process.env.SERVICE_INSTANCE_ID || process.env.HOSTNAME || require('os').hostname();
const serviceVersion = process.env.SERVICE_VERSION || '1.0.0';

console.log(`🏷️  Service Identity: ${serviceName} (instance: ${serviceInstanceId}, version: ${serviceVersion})`);

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
    exportIntervalMillis: 5000, // Export every 5 seconds for demo purposes
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-dns': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-net': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        // Keep tracing but disable automatic metrics that cause issues
        ignoreIncomingRequestHook: (req) => {
          return req.url?.includes('/health');
        },
      },
      // Disable auto-instrumentation for pg since we're using manual instrumentation
      '@opentelemetry/instrumentation-pg': {
        enabled: false,
      },
    }),
    // Add PostgreSQL instrumentation with custom configuration
    new PgInstrumentation({
      // Enhanced database span information
      enhancedDatabaseReporting: true,
      // Add SQL parameters to spans (be careful with sensitive data)
      addSqlCommenterCommentToQueries: true,
    }),
  ],
});

console.log('🚀 Starting OpenTelemetry SDK...');

// Start the SDK
sdk.start();

console.log('✅ OpenTelemetry initialized successfully');

// Gracefully shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down OpenTelemetry...');
  sdk.shutdown()
    .then(() => console.log('✅ OpenTelemetry terminated'))
    .catch((error) => console.log('❌ Error terminating OpenTelemetry', error))
    .finally(() => process.exit(0));
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});