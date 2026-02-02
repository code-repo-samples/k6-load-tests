# Dockerfile for k6 ECS/Fargate Execution
# Base image with k6 runtime
FROM loadimpact/k6:latest

# Switch to root to install tools
USER root

# Install essential tools for GitHub checkout, AWS CLI, and scripting
RUN apk add --no-cache bash curl jq git py3-pip \
    && pip3 install --no-cache-dir awscli

# Set working directory
WORKDIR /k6-run

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

