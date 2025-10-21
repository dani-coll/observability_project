// Initialize OpenTelemetry BEFORE importing any other modules
require('./tracing');

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const { trace, context } = require('@opentelemetry/api');

const app = express();
const PORT = process.env.PORT || 8080;

// Get tracer using service name and version from environment
const tracer = trace.getTracer(
  process.env.SERVICE_NAME,
  process.env.SERVICE_VERSION
);

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'traceparent', 'tracestate', 'X-B3-TraceId', 'X-B3-SpanId', 'X-B3-Sampled'],
  exposedHeaders: ['traceparent', 'tracestate']
}));

// Backend servers configuration
const backends = [
  { url: 'http://backend1:4000', name: 'backend1' },
  { url: 'http://backend2:4000', name: 'backend2' }
];

let currentBackendIndex = 0;

// Simple round-robin load balancing
function getNextBackend() {
  const backend = backends[currentBackendIndex];
  currentBackendIndex = (currentBackendIndex + 1) % backends.length;
  return backend;
}

// Health check endpoint for the load balancer
app.get('/lb-health', (req, res) => {
  const span = tracer.startSpan('loadbalancer_health_check');
  
  console.log('🔍 Load balancer health check');
  
  span.setAttributes({
    'http.method': 'GET',
    'http.route': '/lb-health',
    'service.name': 'loadbalancer-service'
  });
  
  res.status(200).json({ 
    status: 'healthy', 
    service: 'loadbalancer-service',
    timestamp: new Date().toISOString(),
    backends: backends.map(b => b.name)
  });
  
  span.setStatus({ code: 1 }); // OK
  span.end();
});

// Proxy middleware with dynamic target selection and proper tracing
const dynamicProxy = (req, res, next) => {
  const backend = getNextBackend();
  console.log(`🔄 Routing request ${req.method} ${req.path} to ${backend.name} (${backend.url})`);
  
  // Create a span for the load balancer operation
  const span = tracer.startSpan(`proxy_to_${backend.name}`, {
    kind: 1, // CLIENT span kind
    attributes: {
      'http.method': req.method,
      'http.url': req.url,
      'http.target': req.path,
      'loadbalancer.backend': backend.name,
      'loadbalancer.backend.url': backend.url,
      'service.name': 'loadbalancer-service'
    }
  });

  // Add custom headers to track load balancer routing
  req.headers['x-loadbalancer-target'] = backend.name;
  req.headers['x-loadbalancer-service'] = 'loadbalancer-service';
  
  // Run the proxy operation within the span context
  context.with(trace.setSpan(context.active(), span), () => {
    const proxy = createProxyMiddleware({
      target: backend.url,
      changeOrigin: true,
      onProxyReq: (proxyReq, req, res) => {
        console.log(`📤 Proxying to ${backend.name}: ${req.method} ${req.path}`);
        
        // Inject the current trace context into outgoing headers
        // This will create a proper parent-child relationship
        const headers = {};
        trace.getActiveSpan()?.spanContext && 
          trace.setSpanContext(context.active(), trace.getActiveSpan().spanContext());
        
        // Get the current span context and inject it
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          const spanContext = activeSpan.spanContext();
          if (spanContext && spanContext.traceId && spanContext.spanId) {
            // Create traceparent header with current span as parent
            const traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-${spanContext.traceFlags?.toString(16).padStart(2, '0') || '01'}`;
            proxyReq.setHeader('traceparent', traceparent);
            console.log(`📊 Injected traceparent: ${traceparent}`);
            
            if (req.headers.tracestate) {
              proxyReq.setHeader('tracestate', req.headers.tracestate);
            }
          }
        }
        
        // Forward B3 headers as well for compatibility
        const b3Headers = ['x-b3-traceid', 'x-b3-spanid', 'x-b3-sampled', 'x-b3-flags'];
        b3Headers.forEach(header => {
          if (req.headers[header]) {
            proxyReq.setHeader(header, req.headers[header]);
          }
        });
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log(`📥 Response from ${backend.name}: ${proxyRes.statusCode}`);
        
        // Set span attributes based on response
        span.setAttributes({
          'http.status_code': proxyRes.statusCode,
          'http.response.size': proxyRes.headers['content-length'] || 0
        });
        
        // Set span status based on HTTP status code
        if (proxyRes.statusCode >= 400) {
          span.recordException(new Error(`HTTP ${proxyRes.statusCode}`));
          span.setStatus({ code: 2, message: `HTTP ${proxyRes.statusCode}` }); // ERROR
        } else {
          span.setStatus({ code: 1 }); // OK
        }
        
        // Add CORS headers to response
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, X-Requested-With, traceparent, tracestate, X-B3-TraceId, X-B3-SpanId, X-B3-Sampled';
      },
      onError: (err, req, res) => {
        console.error(`❌ Proxy error for ${backend.name}:`, err.message);
        
        // Record the error in the span
        span.recordException(err);
        span.setStatus({ code: 2, message: err.message }); // ERROR
        
        res.status(503).json({
          error: 'Service Temporarily Unavailable',
          backend: backend.name,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Ensure span is ended when the response finishes
    res.on('finish', () => {
      span.end();
    });
    
    proxy(req, res, next);
  });
};

// Apply proxy to all routes except health checks
app.use((req, res, next) => {
  if (req.path === '/lb-health') {
    next();
  } else {
    dynamicProxy(req, res, next);
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Loadbalancer error:', error);
  res.status(500).json({
    error: 'Internal Load Balancer Error',
    timestamp: new Date().toISOString()
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Load balancer service running on port ${PORT}`);
  console.log(`📊 Available backends: ${backends.map(b => b.name).join(', ')}`);
  console.log(`🔍 Health check available at http://localhost:${PORT}/lb-health`);
});