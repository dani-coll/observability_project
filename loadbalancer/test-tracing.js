console.log('🔧 Loading loadbalancer tracing.js for LOCAL TESTING...');

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_SERVICE_INSTANCE_ID } = require('@opentelemetry/semantic-conventions');

console.log('📦 OpenTelemetry modules loaded successfully for loadbalancer');

// Get service identification from environment variables
const serviceName = process.env.SERVICE_NAME || 'loadbalancer-service';
const serviceInstanceId = process.env.SERVICE_INSTANCE_ID || process.env.HOSTNAME || require('os').hostname();
const serviceVersion = process.env.SERVICE_VERSION || '1.0.0';

console.log(`🏷️  Loadbalancer Service Identity: ${serviceName} (instance: ${serviceInstanceId}, version: ${serviceVersion})`);

// Create the SDK with console output for testing
const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [ATTR_SERVICE_INSTANCE_ID]: serviceInstanceId,
  }),
  traceExporter: new ConsoleSpanExporter(),
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
  console.log('📊 Spans will be output to console for testing');
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