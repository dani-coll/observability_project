const express = require('express');
const os = require('os');
const { trace, SpanStatusCode, metrics } = require('@opentelemetry/api');
const { query, initializeDatabase, healthCheck, closePool } = require('./database');
const app = express();
const port = 4000;

// Debug: Check environment variables
console.log('🔍 Server.js Environment Variables:');
console.log('  SERVICE_INSTANCE_ID:', process.env.SERVICE_INSTANCE_ID);
console.log('  HOSTNAME:', process.env.HOSTNAME);
console.log('  os.hostname():', os.hostname());

// Get service instance identifier
const serviceInstanceId = process.env.SERVICE_INSTANCE_ID || os.hostname();
console.log(`🏷️  Backend Service Instance: ${serviceInstanceId}`);

// Get the tracer and meter
const tracer = trace.getTracer(process.env.SERVICE_NAME, process.env.SERVICE_VERSION);
const meter = metrics.getMeter(process.env.SERVICE_NAME, process.env.SERVICE_VERSION);

// Create metrics instruments using UpDownCounters
const httpRequestsFailuresTotal = meter.createUpDownCounter('http_requests_failures_total', {
  description: 'Current count of failures on an endpoint',
});

const httpRequestsTotal = meter.createUpDownCounter('http_requests_total', {
  description: 'Current count of requests to an endpoint',
});

console.log('📊 Metrics instruments created successfully');

// Middleware for parsing JSON
app.use(express.json());

// Middleware for metrics collection
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Override res.end to capture metrics
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;
    
    originalEnd.call(res, chunk, encoding);
  };
  
  next();
});

// Middleware for logging requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const traceId = req.headers['x-b3-traceid'] || req.headers['traceparent'] || 'no-trace';
  console.log(`${timestamp} - ${req.method} ${req.path} - Instance: ${serviceInstanceId} - TraceID: ${traceId}`);
  next();
});

// Health check endpoint with database status
app.get('/health', async (req, res) => {
  try {
    httpRequestsTotal.add(1, {
      container: os.hostname(),
      endpoint: '/health',
    });

    const dbHealth = await healthCheck();

    res.status(200).json({
      status: 'healthy',
      container: os.hostname(),
      instance: serviceInstanceId,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbHealth
    });
  } catch (error) {
    console.log(error)
    res.status(503).json({
      status: 'unhealthy',
      container: os.hostname(),
      instance: serviceInstanceId,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: { status: 'error', error: error.message }
    });
  }
});

// Basic endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Hello from Backend!',
    container: os.hostname(),
    instance: serviceInstanceId,
    timestamp: new Date().toISOString()
  });
});

// Endpoint that retrieves data from database with observability demo features
app.get('/api/data', async (req, res) => {
  console.log("apiData", process.env.SERVICE_INSTANCE_ID,  os.hostname())

  const container = os.hostname();
  const timestamp = new Date().toISOString();
  
  // Create a custom span for the business logic
  const span = tracer.startSpan('process_data_request', {
    attributes: {
      'business.operation': 'data_retrieval',
      'service.instance.id': serviceInstanceId,
      'service.container.name': container,
    },
  });

  // Record successful request gauge
  httpRequestsTotal.add(1, {
    container: container,
    endpoint: '/api/data',
  });
    
  try {
    // Simulate different failure scenarios (keeping for demo purposes)
    const random = Math.random();
    
    if (random < 0.2) {
      // 20% chance of 500 error
      console.error(`${timestamp} - ERROR: Internal server error in ${container}`);
      span.recordException(new Error('Internal server error'));
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: 'Internal server error' 
      });
      
      httpRequestsFailuresTotal.add(1, {
        failure_type: 'internal_server_error',
        status_code: '500',
        container: container,
        endpoint: '/api/data',
      });
      
      span.end();
      
      return res.status(500).json({
        error: 'Internal Server Error',
        container: container,
        instance: serviceInstanceId,
        timestamp: timestamp
      });
    } else if (random < 0.3) {
      // 10% chance of timeout (simulate slow response)
      console.warn(`${timestamp} - WARNING: Slow response in ${container}`);
      span.addEvent('slow_processing_detected', {
        'processing.delay_ms': 3000,
        'processing.reason': 'simulated_load',
      });
      
      // Record slow response as a failure metric
      httpRequestsFailuresTotal.add(1, {
        failure_type: 'timeout_slow_response',
        status_code: '200',
        container: container,
        endpoint: '/api/data',
      });
      
      // Still execute database query but with delay
      setTimeout(async () => {
        try {
          const result = await query(`
            SELECT dp.id, dp.value, dp.timestamp, dp.metadata, u.name as user_name, u.email
            FROM data_points dp
            LEFT JOIN users u ON dp.user_id = u.id
            ORDER BY dp.timestamp DESC
            LIMIT 10
          `);
          
          span.setAttributes({
            'processing.completed': true,
            'processing.duration_ms': 3000,
            'db.rows_returned': result.rows.length,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          
          res.json({
            message: 'Data retrieved successfully (slow response)',
            container: container,
            instance: serviceInstanceId,
            timestamp: timestamp,
            data: { items: result.rows, count: result.rows.length }
          });
        } catch (dbError) {
          span.recordException(dbError);
          span.setStatus({ code: SpanStatusCode.ERROR, message: dbError.message });
          span.end();
          
          res.status(500).json({
            error: 'Database error during slow response',
            container: container,
            instance: serviceInstanceId,
            timestamp: timestamp
          });
        }
      }, 3000); // 3 second delay
      return;
    } else if (random < 0.35) {
      // 5% chance of 503 Service Unavailable
      console.error(`${timestamp} - ERROR: Service unavailable in ${container}`);
      span.recordException(new Error('Service temporarily unavailable'));
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: 'Service unavailable' 
      });
      
      httpRequestsFailuresTotal.add(1, {
        failure_type: 'service_unavailable',
        status_code: '503',
        container: container,
        endpoint: '/api/data',
      });
      
      span.end();
      
      return res.status(503).json({
        error: 'Service Temporarily Unavailable',
        container: container,
        instance: serviceInstanceId,
        timestamp: timestamp
      });
    }
    
    // 65% chance of success - retrieve actual data from database
    console.log(`${timestamp} - Fetching data from database in ${container}`);
    
    const result = await query(`
      SELECT dp.id, dp.value, dp.timestamp, dp.metadata, u.name as user_name, u.email
      FROM data_points dp
      LEFT JOIN users u ON dp.user_id = u.id
      ORDER BY dp.timestamp DESC
      LIMIT 10
    `);
    
    const itemCount = result.rows.length;
    
    span.addEvent('data_processing_completed', {
      'processing.success': true,
      'data.items_count': itemCount,
      'db.rows_returned': itemCount,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    
    res.json({
      message: 'Data retrieved successfully',
      container: container,
      instance: serviceInstanceId,
      timestamp: timestamp,
      data: { items: result.rows, count: itemCount }
    });
    
  } catch (error) {
    console.error(`${timestamp} - Database error in ${container}:`, error.message);
    span.recordException(error);
    span.setStatus({ 
      code: SpanStatusCode.ERROR, 
      message: error.message 
    });
    
    // Record database failure
    httpRequestsFailuresTotal.add(1, {
      failure_type: 'database_error',
      status_code: '500',
      container: container,
      endpoint: '/api/data',
    });
    
    span.end();
    
    res.status(500).json({
      error: 'Database Error',
      details: error.message,
      container: container,
      instance: serviceInstanceId,
      timestamp: timestamp
    });
  }
});

// Endpoint that always fails on backend2 to demonstrate load balancer behavior
// Force crash on backend1 as well to make users find in the trace how to solve it
app.get('/api/backend-specific', (req, res) => {
  const container = os.hostname();
  if (process.env.SERVICE_INSTANCE_ID === 'backend2') {
    console.error(`ERROR: Backend2 always fails for this endpoint`);
    httpRequestsFailuresTotal.add(1, {
        failure_type: 'backend2_always_fails',
        status_code: '500',
        container: container,
        endpoint: '/api/backend-specific',
    });
    return res.status(500).json({
      error: 'Backend2 is configured to fail for this endpoint',
      container: container,
    });
  }
  
  res.json({
    message: 'Success from backend1',
    container: container,
    data: { specialData: 'Only backend1 can serve this' }
  });
});

// Endpoint to simulate memory leak or high CPU
app.get('/api/stress', (req, res) => {
  const container = os.hostname();
  const timestamp = new Date().toISOString();
  console.warn(`${timestamp} - WARNING: Stress test initiated in ${container}`);
  
  // Simulate CPU intensive task
  const start = Date.now();
  while (Date.now() - start < 2000) {
    // Busy wait for 2 seconds
    Math.random();
  }
  
  res.json({
    message: 'Stress test completed',
    container: container,
    timestamp: timestamp,
    processingTime: '2000ms'
  });
});

// Endpoint for demonstrating various metric types
app.get('/api/metrics-demo', (req, res) => {
  const container = os.hostname();
  const timestamp = new Date().toISOString();
  
  // Create a span for this operation
  const span = tracer.startSpan('metrics_demonstration', {
    attributes: {
      'demo.type': 'metrics_showcase',
      'service.instance.id': container,
    },
  });
  
  // Simulate different metric scenarios
  const operationType = req.query.type || 'default';
  const processingTime = Math.floor(Math.random() * 1000) + 100; // 100-1100ms
  
  // Business logic metrics using gauges
  const itemsProcessed = Math.floor(Math.random() * 50) + 1;
  
  span.addEvent('metrics_recorded', {
    'metrics.items_processed': itemsProcessed,
    'metrics.processing_time_ms': processingTime,
    'metrics.operation_type': operationType,
  });
  
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
  
  res.json({
    message: 'Metrics demonstration completed',
    container: container,
    timestamp: timestamp,
    metrics: {
      itemsProcessed: itemsProcessed,
      processingTimeMs: processingTime,
      operationType: operationType,
    }
  });
});

// Endpoint to kill a specific backend (for demonstration)
app.post('/api/kill', (req, res) => {
  const container = os.hostname();
  const timestamp = new Date().toISOString();
  
  console.error(`${timestamp} - CRITICAL: Kill signal received in ${container}`);
  res.json({
    message: `${container} will shutdown in 3 seconds`,
    container: container,
    timestamp: timestamp
  });
  
  setTimeout(() => {
    process.exit(1);
  }, 3000);
});

// Database endpoints for demonstrating database tracing

// Get all users
app.get('/api/users', async (req, res) => {
  const container = os.hostname();
  const timestamp = new Date().toISOString();
  
  const span = tracer.startSpan('get_users', {
    attributes: {
      'business.operation': 'user_retrieval',
      'service.instance.id': serviceInstanceId,
      'service.container.name': container,
    },
  });
  
  try {
    console.log(`${timestamp} - Fetching all users from database in ${container}`);
    
    const result = await query('SELECT id, name, email, created_at FROM users ORDER BY created_at DESC');
    
    span.setAttributes({
      'db.rows_returned': result.rows.length,
      'business.users_count': result.rows.length,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    
    res.json({
      message: 'Users retrieved successfully',
      container: container,
      instance: serviceInstanceId,
      timestamp: timestamp,
      data: { users: result.rows, count: result.rows.length }
    });
    
  } catch (error) {
    console.error(`${timestamp} - Database error fetching users in ${container}:`, error.message);
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
    
    res.status(500).json({
      error: 'Database Error',
      details: error.message,
      container: container,
      instance: serviceInstanceId,
      timestamp: timestamp
    });
  }
});

// Create a new user
app.post('/api/users', async (req, res) => {
  const container = os.hostname();
  const timestamp = new Date().toISOString();
  const { name, email } = req.body;
  
  const span = tracer.startSpan('create_user', {
    attributes: {
      'business.operation': 'user_creation',
      'service.instance.id': serviceInstanceId,
      'service.container.name': container,
      'user.email': email,
    },
  });
  
  try {
    if (!name || !email) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required fields' });
      span.end();
      return res.status(400).json({
        error: 'Name and email are required',
        container: container,
        timestamp: timestamp
      });
    }
    
    console.log(`${timestamp} - Creating new user: ${email} in ${container}`);
    
    const result = await query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at',
      [name, email]
    );
    
    span.setAttributes({
      'business.user_created': true,
      'user.id': result.rows[0].id,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    
    res.status(201).json({
      message: 'User created successfully',
      container: container,
      instance: serviceInstanceId,
      timestamp: timestamp,
      data: { user: result.rows[0] }
    });
    
  } catch (error) {
    console.error(`${timestamp} - Database error creating user in ${container}:`, error.message);
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      res.status(409).json({
        error: 'User with this email already exists',
        container: container,
        instance: serviceInstanceId,
        timestamp: timestamp
      });
    } else {
      res.status(500).json({
        error: 'Database Error',
        details: error.message,
        container: container,
        instance: serviceInstanceId,
        timestamp: timestamp
      });
    }
  }
});

// Create a new data point
app.post('/api/data', async (req, res) => {
  const container = os.hostname();
  const timestamp = new Date().toISOString();
  const { value, metadata, user_id } = req.body;
  
  const span = tracer.startSpan('create_data_point', {
    attributes: {
      'business.operation': 'data_creation',
      'service.instance.id': serviceInstanceId,
      'service.container.name': container,
      'data.value': value,
    },
  });
  
  try {
    if (value === undefined || value === null) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required value field' });
      span.end();
      return res.status(400).json({
        error: 'Value is required',
        container: container,
        timestamp: timestamp
      });
    }
    
    console.log(`${timestamp} - Creating new data point: ${value} in ${container}`);
    
    const result = await query(
      'INSERT INTO data_points (value, metadata, user_id) VALUES ($1, $2, $3) RETURNING id, value, timestamp, metadata, user_id',
      [value, metadata || {}, user_id || null]
    );
    
    span.setAttributes({
      'business.data_point_created': true,
      'data.id': result.rows[0].id,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    
    // Record successful data creation metric
    dataItemsGauge.add(1, {
      operation: 'data_creation',
      container: container,
      status: 'success',
    });
    
    span.end();
    
    res.status(201).json({
      message: 'Data point created successfully',
      container: container,
      instance: serviceInstanceId,
      timestamp: timestamp,
      data: { dataPoint: result.rows[0] }
    });
    
  } catch (error) {
    console.error(`${timestamp} - Database error creating data point in ${container}:`, error.message);
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    
    // Record failure metric
    httpRequestsFailuresTotal.add(1, {
      failure_type: 'database_error',
      status_code: '500',
      container: container,
      endpoint: '/api/data',
    });
    
    span.end();
    
    res.status(500).json({
      error: 'Database Error',
      details: error.message,
      container: container,
      instance: serviceInstanceId,
      timestamp: timestamp
    });
  }
});

app.listen(port, async () => {
  console.log(`Backend listening on port ${port} - Container: ${os.hostname()}`);
  
  // Initialize database schema
  try {
    await initializeDatabase();
    console.log('✅ Database initialization completed');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.log('🔄 Server will continue running, but database operations may fail');
  }
  
  // Graceful shutdown handler
  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM signal, shutting down gracefully...');
    try {
      await closePool();
      console.log('✅ Database connections closed');
    } catch (error) {
      console.error('❌ Error closing database connections:', error.message);
    }
    process.exit(0);
  });
});