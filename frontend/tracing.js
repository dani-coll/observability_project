// OpenTelemetry Web SDK Setup for proper trace instrumentation
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

console.log('🔧 Initializing OpenTelemetry Web SDK...');

// Create resource with service information
const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: import.meta.env.VITE_SERVICE_NAME,
  [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: import.meta.env.VITE_NAMESPACE || 'workshop',
});

// Create tracer provider
const provider = new WebTracerProvider({
  resource: resource,
});

// Configure OTLP exporter to send traces to collector
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
  headers: {},
});

// Add batch span processor for better performance
provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
  scheduledDelayMillis: 1000, // Export every 1 second
  maxQueueSize: 100,
  maxExportBatchSize: 10,
}));

// Register the provider with W3C Trace Context propagation
provider.register({
  contextManager: new ZoneContextManager(),
  propagator: new W3CTraceContextPropagator(),
});

// Register auto-instrumentations
registerInstrumentations({
  instrumentations: [
    // Instrument document load events
    new DocumentLoadInstrumentation(),
    
    // Instrument fetch API calls - THIS IS THE KEY FOR AUTOMATIC TRACING
    new FetchInstrumentation({
      // Add custom attributes to spans
      applyCustomAttributesOnSpan: (span, request, response) => {
        span.setAttribute('http.url', request.url);
        span.setAttribute('http.method', request.method || 'GET');
        if (response) {
          span.setAttribute('http.status_code', response.status);
          span.setAttribute('http.status_text', response.statusText);
        }
      },
      
      // Automatically propagate trace context headers to these URLs
      propagateTraceHeaderCorsUrls: [
        /localhost:8080/,    // Load balancer
        /localhost:4000/,    // Backend 1
        /localhost:4001/,    // Backend 2
        /localhost:4318/,    // OTEL collector
      ],
      
      // Clear timing resources to prevent memory leaks
      clearTimingResources: true,
      
      // Ignore collector requests to avoid infinite loops
      ignoreUrls: [
        /localhost:4318\/v1\/traces/,
      ],
    }),
    
    // Instrument XMLHttpRequest as fallback
    new XMLHttpRequestInstrumentation({
      propagateTraceHeaderCorsUrls: [
        /localhost:8080/,
        /localhost:4000/,
        /localhost:4001/,
      ],
    }),
  ],
});

console.log('✅ OpenTelemetry Web SDK initialized successfully');
console.log('📊 Fetch requests will be automatically traced');
console.log('🔗 Trace context will be propagated via W3C traceparent header');

export default provider;
