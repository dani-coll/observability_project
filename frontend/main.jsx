import './tracing.js';

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

console.log('🚀 Frontend application starting...');

function App() {
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const addLog = (log) => {
    setLogs(prev => [...prev.slice(-9), log]); // Keep last 10 logs
  };
  
  const makeRequest = async (endpoint, description) => {
    setIsLoading(true);
    const startTime = Date.now();
    
    console.log('🔗 Making request to:', endpoint, '- OpenTelemetry will auto-instrument this');
    
    try {
      const response = await fetch(`http://localhost:8642${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          // No need to manually add trace headers - FetchInstrumentation handles it!
        },
      });
      const data = await response.json();
      const duration = Date.now() - startTime;
      
      addLog({
        time: new Date().toLocaleTimeString(),
        description,
        status: response.status,
        duration: `${duration}ms`,
        container: data.container || 'unknown',
        success: response.ok
      });
      
      if (response.ok) {
        setMessage(JSON.stringify(data, null, 2));
      } else {
        setMessage(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      addLog({
        time: new Date().toLocaleTimeString(),
        description,
        status: 'Network Error',
        duration: `${duration}ms`,
        container: 'N/A',
        success: false
      });
      setMessage(`Network Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    makeRequest('/', 'Initial load');
  }, []);
  
  // Centralized button styles
  const baseButtonStyle = {
    padding: '10px',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Observability Demo - Load Balancer Testing</h1>
      <div style={{ marginBottom: '20px' }}>
        <h2>Test Scenarios</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button
            onClick={() => makeRequest('/', 'Basic request')}
            disabled={isLoading}
            style={{ ...baseButtonStyle, backgroundColor: '#4CAF50' }}
          >
            Basic Request
          </button>
          <button
            onClick={() => makeRequest('/health', 'Health check')}
            disabled={isLoading}
            style={{ ...baseButtonStyle, backgroundColor: '#2196F3' }}
          >
            Health Check
          </button>
          <button
            onClick={() => makeRequest('/api/data', 'Random failures (20% error rate)')}
            disabled={isLoading}
            style={{ ...baseButtonStyle, backgroundColor: '#FF9800' }}
          >
            Random Failures
          </button>
          <button
            onClick={() => makeRequest('/api/backend-specific', 'Backend-specific endpoint called')}
            disabled={isLoading}
            style={{ ...baseButtonStyle, backgroundColor: '#f44336' }}
          >
            Backend-Specific Failure
          </button>
          <button
            onClick={() => makeRequest('/api/stress', 'CPU stress test')}
            disabled={isLoading}
            style={{ ...baseButtonStyle, backgroundColor: '#9C27B0' }}
          >
            Stress Test
          </button>
          <button
            onClick={() => makeRequest('/lb-health', 'Load balancer health')}
            disabled={isLoading}
            style={{ ...baseButtonStyle, backgroundColor: '#607D8B' }}
          >
            LB Health
          </button>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h3>Latest Response</h3>
          <pre style={{ 
            background: '#f5f5f5', 
            padding: '15px', 
            borderRadius: '4px',
            minHeight: '200px',
            overflow: 'auto'
          }}>
            {isLoading ? 'Loading...' : message}
          </pre>
        </div>
        
        <div style={{ flex: 1 }}>
          <h3>Request Log</h3>
          <div style={{ 
            background: '#f5f5f5', 
            padding: '15px', 
            borderRadius: '4px',
            minHeight: '200px',
            overflow: 'auto'
          }}>
            {logs.map((log, index) => (
              <div 
                key={index} 
                style={{ 
                  padding: '5px',
                  backgroundColor: log.success ? '#e8f5e8' : '#ffeaea',
                  borderRadius: '3px',
                  fontSize: '12px'
                }}
              >
                <strong>{log.time}</strong> - {log.description}<br/>
                Status: {log.status} | Duration: {log.duration} | Container: {log.container}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div style={{ marginTop: '20px' }}>
        <h3>Observability Scenarios to Test:</h3>
        <ul>
          <li><strong>Random Failures:</strong> Click multiple times to see how the load balancer handles 500 errors and timeouts</li>
          <li><strong>Backend-Specific Failure:</strong> Shows how nginx routes around consistently failing backends</li>
          <li><strong>Stress Test:</strong> Demonstrates high latency scenarios and timeout handling</li>
          <li><strong>Health Checks:</strong> Monitor individual backend health vs load balancer health</li>
        </ul>
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <p><strong>Advanced Testing:</strong> Open browser dev tools to see network timing and errors</p>
        <p><strong>Distributed Tracing:</strong> OpenTelemetry automatically instruments all fetch requests with traceparent headers</p>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
