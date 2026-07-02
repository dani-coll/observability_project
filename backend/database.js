const { Pool } = require('pg');
const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api');

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'observability',
  max: 20, // Maximum number of connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

console.log('🔍 Database Configuration:');
console.log(`  Host: ${dbConfig.host}`);
console.log(`  Port: ${dbConfig.port}`);
console.log(`  Database: ${dbConfig.database}`);
console.log(`  User: ${dbConfig.user}`);

// Create connection pool
const pool = new Pool(dbConfig);

// Test database connection
pool.on('connect', (client) => {
  console.log('✅ New database client connected');
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle database client:', err);
});

async function query(text, params = []) {
  const operation = extractOperation(text);
  const table = extractTableName(text);
  const tracer = trace.getTracer('database');

  return tracer.startActiveSpan(
    `${operation} ${table}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.system': 'postgresql',
        'db.operation': operation,
        'db.sql.table': table,
        'db.statement': text.trim().substring(0, 200),
      },
    },
    async (span) => {
      const client = await pool.connect();
      try {
        const start = Date.now();
        console.log(`📊 Executing query: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

        const result = await client.query(text, params);
        const duration = Date.now() - start;

        console.log(`✅ Query completed in ${duration}ms, ${result.rowCount || 0} rows affected`);
        span.setAttribute('db.rows_affected', result.rowCount || 0);

        return result;
      } catch (error) {
        console.error('❌ Database query error:', error.message);
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        client.release();
        span.end();
      }
    }
  );
}

// Helper function to extract operation from SQL
function extractOperation(sql) {
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('CREATE')) return 'CREATE';
  if (trimmed.startsWith('DROP')) return 'DROP';
  return 'OTHER';
}

// Helper function to extract table name from SQL
function extractTableName(sql) {
  const trimmed = sql.trim().toUpperCase();
  
  // Match common SQL patterns to extract table name
  let match;
  
  // SELECT ... FROM table_name
  match = trimmed.match(/FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (match) return match[1].toLowerCase();
  
  // INSERT INTO table_name
  match = trimmed.match(/INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (match) return match[1].toLowerCase();
  
  // UPDATE table_name
  match = trimmed.match(/UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (match) return match[1].toLowerCase();
  
  // DELETE FROM table_name
  match = trimmed.match(/DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (match) return match[1].toLowerCase();
  
  // CREATE TABLE table_name
  match = trimmed.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (match) return match[1].toLowerCase();
  
  return 'unknown';
}

// Initialize database schema
async function initializeDatabase() {
  try {
    console.log('🔧 Initializing database schema...');
    
    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create data_points table for API data
    await query(`
      CREATE TABLE IF NOT EXISTS data_points (
        id SERIAL PRIMARY KEY,
        value NUMERIC NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB,
        user_id INTEGER REFERENCES users(id)
      )
    `);
    
    // Insert sample data if tables are empty
    const userCount = await query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count) === 0) {
      console.log('📝 Inserting sample data...');
      
      await query(`
        INSERT INTO users (name, email) VALUES 
        ('John Doe', 'john@example.com'),
        ('Jane Smith', 'jane@example.com'),
        ('Bob Johnson', 'bob@example.com')
      `);
      
      await query(`
        INSERT INTO data_points (value, metadata, user_id) VALUES 
        (42.5, '{"type": "sensor", "location": "room1"}', 1),
        (38.2, '{"type": "sensor", "location": "room2"}', 2),
        (45.1, '{"type": "sensor", "location": "room3"}', 3),
        (41.8, '{"type": "sensor", "location": "room1"}', 1),
        (39.6, '{"type": "sensor", "location": "room2"}', 2)
      `);
    }
    
    console.log('✅ Database initialized successfully');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  } finally {
  }
}

// Health check function
async function healthCheck() {
  
  try {
    await query('SELECT 1');
    return { status: 'healthy', database: 'connected' };
  } catch (error) {
    return { status: 'unhealthy', database: 'disconnected', error: error.message };
  } finally {
  }
}

// Graceful shutdown
async function closePool() {
  console.log('🔄 Closing database connection pool...');
  await pool.end();
  console.log('✅ Database pool closed');
}

module.exports = {
  query,
  initializeDatabase,
  healthCheck,
  closePool,
  pool
};