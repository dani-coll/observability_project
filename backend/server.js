const express = require('express');
const os = require('os');
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
 
  try {
    // Simulate different failure scenarios (keeping for demo purposes)
    const random = Math.random();
    
    if (random < 0.2) {
      // 20% chance of 500 error
      console.error(`${timestamp} - ERROR: Internal server error in ${container}`);
      
      return res.status(500).json({
        error: 'Internal Server Error',
        container: container,
        instance: serviceInstanceId,
        timestamp: timestamp
      });
    } else if (random < 0.3) {
      // 10% chance of timeout (simulate slow response)
      console.warn(`${timestamp} - WARNING: Slow response in ${container}`);

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
          
          res.json({
            message: 'Data retrieved successfully (slow response)',
            container: container,
            instance: serviceInstanceId,
            timestamp: timestamp,
            data: { items: result.rows, count: result.rows.length }
          });
        } catch (dbError) {
          
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
    
    res.json({
      message: 'Data retrieved successfully',
      container: container,
      instance: serviceInstanceId,
      timestamp: timestamp,
      data: { items: result.rows, count: itemCount }
    });
    
  } catch (error) {
    console.error(`${timestamp} - Database error in ${container}:`, error.message);
    
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
app.get('/api/backend-specific', (req, res) => {
  const container = os.hostname();
  if (process.env.SERVICE_INSTANCE_ID === 'backend2') {
    console.error(`ERROR: Backend2 always fails for this endpoint`);
    return res.status(500).json({
      error: 'Backend2 is configured to fail for this endpoint',
      container: container,
    });
  }
  
  res.json({
    message: 'Success from backend1',
    container,
    timestamp,
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