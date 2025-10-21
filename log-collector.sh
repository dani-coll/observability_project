#!/bin/sh
# Log collector script that tails container logs and writes them to the shared volume

# Create log directory if it doesn't exist
mkdir -p /var/log/containers

# Function to collect logs from a container
collect_logs() {
    container_name=$1
    echo "Starting log collection for container: $container_name"
    
    # Tail the container logs and write to file
    # Using podman logs with --follow to stream logs continuously
    podman logs --follow --timestamps "$container_name" 2>&1 | \
    while IFS= read -r line; do
        # Write with container name prefix for parsing
        echo "{\"container\":\"$container_name\",\"log\":\"$line\",\"time\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\"}" >> "/var/log/containers/${container_name}.log"
    done &
}

# Collect logs from all application containers
collect_logs "frontend"
collect_logs "loadbalancer"
collect_logs "backend1"
collect_logs "backend2"
collect_logs "database"

# Keep the script running
echo "Log collector started. Collecting logs from all containers..."
wait
