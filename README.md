# PERN Stack Observability Demo with Load Balancer

This project demonstrates a PERN stack (Postgres, Express, React, Node) with a load balancer, multiple backend instances, and intentional failure scenarios for educational purposes. All observability instrumentation has been removed for simplicity.

## 🏗️ Architecture

```
Frontend (React) → Load Balancer (Node.js) → Backend Instances (Node.js) → Database (PostgreSQL)
```

## 🚀 Services

- **frontend**: React app with testing interface (Port 3737)
- **loadbalancer**: Node.js load balancer (Port 8642)
- **backend1**: Express API instance 1 (Port 4931)
- **backend2**: Express API instance 2 (Port 4932)
- **database**: PostgreSQL database (Port 5942)

## 🎯 Key Features for Observability Learning

### Load Balancer Capabilities
- **Round-robin load balancing** between backend instances
- **Health check monitoring** with automatic failover
- **Service identification** for request attribution

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



3. **Start the application**:
   ```bash
   docker-compose up -d
   # or for Podman users:
   podman-compose up -d
   ```

4. **Access the services**:
   - **Frontend**: [http://localhost:3737](http://localhost:3737) - Interactive testing interface
   - **Load Balancer**: [http://localhost:8642](http://localhost:8642) - Backend services via LB
   - **Direct Backend Access**: [http://localhost:4931](http://localhost:4931) and [http://localhost:4932](http://localhost:4932)

## 🧪 Testing Failure Scenarios

### Option 1: Web Interface
Visit [http://localhost:3737](http://localhost:3737) for an interactive interface with buttons to test:
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

This provides comprehensive testing scenarios:
1. Health Check All Services
2. Load Balancer Distribution Test
3. Simulate Backend Failures
4. Timeout and Latency Test
5. Backend-Specific Failure Test
6. Kill Backend Instance (Failover Demo)
7. Stress Test (CPU Load)
8. Continuous Load Test
9. Monitor Container Distribution

### Option 3: Manual API Testing
```bash
# Test health checks
curl http://localhost:8642/health
curl http://localhost:8642/lb-health

# Test failure scenarios
curl http://localhost:8642/api/data
curl http://localhost:8642/api/backend-specific
curl http://localhost:8642/api/stress

# Simulate backend failure
curl -X POST http://localhost:8642/api/kill
```












---

This setup provides a foundation for learning about load balancing, failure handling, and distributed systems using a simple PERN stack. 🚀
