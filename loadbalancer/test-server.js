// Initialize OpenTelemetry BEFORE importing any other modules
require('./test-tracing');

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'traceparent', 'tracestate', 'X-B3-TraceId', 'X-B3-SpanId', 'X-B3-Sampled'],
  exposedHeaders: ['traceparent', 'tracestate']
}));

// For local testing, we'll use mock backends or localhost
const backends = [
  { url: 'http://localhost:4000', name: 'backend1' },
  { url: 'http://localhost:4001', name: 'backend2' }
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
  console.log('🔍 Load balancer health check');
  res.status(200).json({ 
    status: 'healthy', 
    service: 'loadbalancer-service',
    timestamp: new Date().toISOString(),
    backends: backends.map(b => b.name),
    tracing: {
      headers: {
        traceparent: req.headers.traceparent || 'none',
        tracestate: req.headers.tracestate || 'none'
      }
    }
  });
});

// Simple mock backend endpoint for testing
app.get('/mock-backend', (req, res) => {
  console.log('🎭 Mock backend response with trace headers:', {
    traceparent: req.headers.traceparent,
    tracestate: req.headers.tracestate
  });
  
  res.status(200).json({
    message: 'Mock backend response',
    service: 'loadbalancer-service',
    timestamp: new Date().toISOString(),
    headers: {
      traceparent: req.headers.traceparent,
      tracestate: req.headers.tracestate
    }
  });
});

// Proxy middleware with dynamic target selection
const dynamicProxy = (req, res, next) => {
  const backend = getNextBackend();
  console.log(`🔄 Routing request ${req.method} ${req.path} to ${backend.name} (${backend.url})`);
  
  // Add custom headers to track load balancer routing
  req.headers['x-loadbalancer-target'] = backend.name;
  req.headers['x-loadbalancer-service'] = 'loadbalancer-service';
  
  // Log trace headers
  console.log('📊 Trace headers received:', {
    traceparent: req.headers.traceparent,
    tracestate: req.headers.tracestate,
    'x-b3-traceid': req.headers['x-b3-traceid'],
    'x-b3-spanid': req.headers['x-b3-spanid']
  });
  
  const proxy = createProxyMiddleware({
    target: backend.url,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
      console.log(`📤 Proxying to ${backend.name}: ${req.method} ${req.path}`);
      
      // Ensure tracing headers are forwarded
      if (req.headers.traceparent) {
        proxyReq.setHeader('traceparent', req.headers.traceparent);
        console.log('✅ Forwarded traceparent:', req.headers.traceparent);
      }
      if (req.headers.tracestate) {
        proxyReq.setHeader('tracestate', req.headers.tracestate);
        console.log('✅ Forwarded tracestate:', req.headers.tracestate);
      }
      
      // Forward B3 headers as well
      const b3Headers = ['x-b3-traceid', 'x-b3-spanid', 'x-b3-sampled', 'x-b3-flags'];
      b3Headers.forEach(header => {
        if (req.headers[header]) {
          proxyReq.setHeader(header, req.headers[header]);
          console.log(`✅ Forwarded ${header}:`, req.headers[header]);
        }
      });
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`📥 Response from ${backend.name}: ${proxyRes.statusCode}`);
      
      // Add CORS headers to response
      proxyRes.headers['access-control-allow-origin'] = '*';
      proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization, X-Requested-With, traceparent, tracestate, X-B3-TraceId, X-B3-SpanId, X-B3-Sampled';
    },
    onError: (err, req, res) => {
      console.error(`❌ Proxy error for ${backend.name}:`, err.message);
      console.log('🎭 Falling back to mock response due to proxy error');
      
      // Return a mock response instead of failing
      res.status(200).json({
        message: `Mock response - ${backend.name} unavailable`,
        backend: backend.name,
        timestamp: new Date().toISOString(),
        trace_info: {
          traceparent: req.headers.traceparent,
          tracestate: req.headers.tracestate
        },
        note: 'This is a mock response because backend is not running'
      });
    }
  });
  
  proxy(req, res, next);
};

// Apply proxy to specific routes, but not health checks
app.use((req, res, next) => {
  if (req.path === '/lb-health' || req.path === '/mock-backend') {
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
    timestamp: new Date().toISOString(),
    trace_info: {
      traceparent: req.headers.traceparent,
      tracestate: req.headers.tracestate
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Load balancer service running on port ${PORT}`);
  console.log(`📊 Available backends: ${backends.map(b => b.name).join(', ')}`);
  console.log(`🔍 Health check available at http://localhost:${PORT}/lb-health`);
  console.log(`🎭 Mock backend available at http://localhost:${PORT}/mock-backend`);
  console.log(`🏷️  Service: loadbalancer-service`);
});