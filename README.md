# PERN Stack Observability Demo with Load Balancer

This project demonstrates a comprehensive observability setup using a PERN stack (Postgres, Express, React, Node) with a load balancer, multiple backend instances, and intentional failure scenarios for educational purposes. The application is instrumented with OpenTelemetry and exports observability data to Dynatrace.

## 🏗️ Architecture

```
Frontend (React) → Load Balancer (Node.js + OpenTelemetry) → Backend Instances (Node.js) → Database (PostgreSQL)
                                       ↓
                               OpenTelemetry Collector → Dynatrace
```

## 🚀 Services

- **frontend**: React app with observability testing interface (Port 3000) + **Distributed Tracing**
- **loadbalancer**: Node.js load balancer with OpenTelemetry instrumentation (Port 8080) + **Full Trace Participation**
- **backend1**: Express API instance 1 (Port 4000) + **Auto-instrumented Tracing**
- **backend2**: Express API instance 2 (Port 4001) + **Auto-instrumented Tracing**
- **database**: PostgreSQL database (Port 5432)
- **otel-collector**: OpenTelemetry Collector for metrics and traces (Ports 4317, 4318)

## 🎯 Key Features for Observability Learning

### Load Balancer Capabilities
- **OpenTelemetry Instrumented**: Creates spans and participates in distributed traces
- **Round-robin load balancing** between backend instances with trace visibility
- **Health check monitoring** with automatic failover
- **Complete trace propagation** from frontend through load balancer to backend
- **Service identification** in traces for precise request attribution

### Failure Scenarios for Education
1. **Random Backend Failures** (20% error rate on `/api/data`)
2. **Backend-Specific Failures** (Backend2 always fails on specific endpoints)
3. **CPU Stress Testing** (High latency simulation)
4. **Controlled Instance Termination** (Failover demonstration)
5. **Timeout and Network Issues** (Various timeout scenarios)

## 🚀 Quick Start

1. **Clone and configure**:
   ```bash
   git clone <repo-url>
   cd observability_project
   ```

2. **Set up Dynatrace credentials** (optional):
   - Update `<your-dynatrace-endpoint>` and `<your-dynatrace-api-token>` in:
     - `docker-compose.yml`
     - `otel-collector-config.yaml`

3. **Start the application**:
   ```bash
   docker-compose up -d
   # or for Podman users:
   podman-compose up -d
   ```

4. **Access the services**:
   - **Frontend**: [http://localhost:3000](http://localhost:3000) - Interactive testing interface
   - **Load Balancer**: [http://localhost:8080](http://localhost:8080) - Backend services via LB
   - **Direct Backend Access**: [http://localhost:4000](http://localhost:4000) and [http://localhost:4001](http://localhost:4001)

## 🧪 Testing Observability Scenarios

### Testing Distributed Tracing 🔍
```bash
# Run the distributed tracing test script
./test-tracing.sh

# This will:
# - Generate trace IDs and span IDs
# - Send requests with trace headers through the stack
# - Verify trace propagation in logs
# - Check trace collection in OpenTelemetry Collector
# - Provide trace IDs for Dynatrace lookup
```

Open the browser console at [http://localhost:3000](http://localhost:3000) to see:
- Trace IDs being generated
- Span IDs for each request
- Trace headers being sent to the backend
- End-to-end trace correlation

### Option 1: Web Interface
Visit [http://localhost:3000](http://localhost:3000) for an interactive interface with buttons to test:
- Basic load balancing distribution
- Health checks for all services
- Random failure scenarios
- Backend-specific failures
- CPU stress testing
- Load balancer health monitoring

### Option 2: Command Line Testing
Use the interactive testing script:
```bash
./test-scenarios.sh
```

This provides 9 comprehensive testing scenarios:
1. Health Check All Services
2. Load Balancer Distribution Test  
3. Simulate Backend Failures
4. Timeout and Latency Test
5. Backend-Specific Failure Test
6. Kill Backend Instance (Failover Demo)
7. Stress Test (CPU Load)
8. Continuous Load Test
9. Monitor Container Distribution

### Option 3: Load Balancer Tracing Test
Test the complete trace flow from frontend through load balancer to backend:
```bash
./test-loadbalancer-tracing.sh
```

This specific test verifies:
- Load balancer span creation
- Trace context propagation through all layers
- Service identification in traces
- Round-robin load balancing with tracing visibility

### Option 4: Manual API Testing
```bash
# Test load balancing with trace headers
TRACE_ID=$(openssl rand -hex 16)
curl -H "traceparent: 00-${TRACE_ID}-$(openssl rand -hex 8)-01" \
     http://localhost:8080/

# Test health checks
curl http://localhost:8080/health
curl http://localhost:8080/lb-health

# Test failure scenarios with tracing
curl -H "traceparent: 00-${TRACE_ID}-$(openssl rand -hex 8)-01" \
     http://localhost:8080/api/data
curl http://localhost:8080/api/backend-specific
curl http://localhost:8080/api/stress

# Simulate backend failure
curl -X POST http://localhost:8080/api/kill
```

## 📊 Observability Features

### Distributed Tracing 🔍
- **End-to-End Tracing**: Follow requests from browser → nginx → backend → database
- **W3C Trace Context**: Standards-compliant trace propagation using `traceparent` headers
- **B3 Propagation**: Zipkin-style trace headers for compatibility
- **Context Propagation**: Nginx automatically forwards trace headers to backends
- **Trace Correlation**: Connect frontend, load balancer, and backend operations in a single trace
- **See [DISTRIBUTED_TRACING.md](./DISTRIBUTED_TRACING.md) for detailed implementation**

### Metrics and Monitoring
- **Request Distribution**: Track how load balancer distributes requests
- **Error Rates**: Monitor HTTP 4xx/5xx responses across instances
- **Response Times**: Measure latency for different endpoints
- **Health Status**: Monitor individual backend and load balancer health
- **Resource Utilization**: Track CPU, memory, and network usage

### OpenTelemetry Integration
- **Distributed Tracing**: Follow requests across load balancer and backends
- **Custom Metrics**: Business and technical metrics collection
- **Log Correlation**: Correlate logs with traces and metrics
- **Dynatrace Export**: Full observability data export to Dynatrace

### Educational Scenarios
- **Circuit Breaker Patterns**: See how services route around failures
- **Retry Logic**: Observe automatic retry mechanisms
- **Failover Behavior**: Test high availability scenarios
- **Performance Bottlenecks**: Identify and monitor slow services
- **Error Budgets**: Calculate and track acceptable error rates

## 📚 Learning Resources

- **[DISTRIBUTED_TRACING.md](./DISTRIBUTED_TRACING.md)**: Complete guide to distributed tracing implementation
- **[OBSERVABILITY_GUIDE.md](./OBSERVABILITY_GUIDE.md)**: Comprehensive guide to all observability scenarios
- **[test-scenarios.sh](./test-scenarios.sh)**: Interactive testing script
- **[test-tracing.sh](./test-tracing.sh)**: Distributed tracing test script
- **[nginx.conf](./nginx.conf)**: Load balancer configuration with comments
- **[backend/server.js](./backend/server.js)**: Backend with failure simulation endpoints

## 🔧 Customization

### Modify Failure Rates
Edit `backend/server.js` to adjust failure probabilities:
```javascript
if (random < 0.2) {  // Change this value to adjust failure rate
    // 500 error scenario
}
```

### Configure Load Balancer
Edit `nginx.conf` to modify:
- Load balancing algorithms (round_robin, ip_hash, least_conn)
- Health check intervals and thresholds
- Timeout values for different endpoints
- Retry policies and failure criteria

### Add New Scenarios
Extend `backend/server.js` with additional endpoints:
- Database connection failures
- Memory leak simulations
- Network partitioning scenarios
- Cache failures

## 🐛 Troubleshooting

### Common Issues
1. **Services not starting**: Check `docker-compose ps` and `docker-compose logs`
2. **Load balancer errors**: Verify backend health with `curl http://localhost:8080/health`
3. **Database connectivity**: Check database logs and connection strings
4. **High error rates**: Monitor individual backend logs for specific errors

### Monitoring Commands
```bash
# Check all service status
docker-compose ps

# View logs for specific service
docker-compose logs -f backend1
docker-compose logs -f loadbalancer

# Monitor real-time load distribution
watch -n 1 'curl -s http://localhost:8080/ | jq .container'
```

## 🎓 Educational Use Cases

This project is perfect for teaching:
- **Load balancer configuration and behavior**
- **High availability and failover patterns**
- **Observability best practices**
- **Error handling and retry logic**
- **Performance monitoring and debugging**
- **Circuit breaker and bulkhead patterns**
- **Distributed systems failure modes**

## 🔄 Next Steps

Extend the project with:
- Prometheus metrics collection
- Grafana dashboards
- Jaeger distributed tracing
- Chaos engineering with random failures
- Auto-scaling based on load
- Service mesh integration (Istio/Linkerd)

---

This setup provides a comprehensive foundation for learning observability, load balancing, and failure handling in distributed systems. 🚀
