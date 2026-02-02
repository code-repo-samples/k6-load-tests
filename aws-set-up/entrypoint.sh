#!/bin/bash
set -e

# =============================================================================
# K6 ECS/Fargate Entrypoint Script
# =============================================================================
# This script runs inside the ECS Fargate container to execute k6 load tests.
# Variables are passed from GitHub Actions as environment variables.
#
# Enhancements included:
# - Enable K6 Web Dashboard and export HTML report
# - Preserve live console logs while also saving stdout/stderr to files
# =============================================================================

echo "========================================="
echo "K6 Load Test Execution"
echo "========================================="

# --- Variables passed from GitHub Actions ---
APP_FOLDER=${APP_FOLDER:-app1}            # folder to execute
SCRIPT_NAME=${SCRIPT_NAME:-test1.js}      # script to run
GITHUB_REPO_URL=${GITHUB_REPO_URL:-https://github.com/my-org/my-repo.git}
GITHUB_BRANCH=${GITHUB_BRANCH:-main}      # branch to checkout
S3_BUCKET=${S3_BUCKET:-k6-artifacts-983610474809}
AWS_REGION=${AWS_REGION:-us-east-1}
RUN_ID=${RUN_ID:-$(date +%Y%m%d-%H%M%S)}  # unique identifier for this run

echo "Configuration:"
echo "  App Folder: ${APP_FOLDER}"
echo "  Script: ${SCRIPT_NAME}"
echo "  Repository: ${GITHUB_REPO_URL}"
echo "  Branch: ${GITHUB_BRANCH}"
echo "  S3 Bucket: ${S3_BUCKET}"
echo "  Run ID: ${RUN_ID}"
echo ""

# --- Prepare workspace ---
echo "[1/6] Preparing workspace..."
mkdir -p /k6-run/$APP_FOLDER
cd /k6-run

# --- Clone repository ---
echo "[2/6] Cloning repository..."

# Extract repo path from URL
REPO_PATH=$(echo $GITHUB_REPO_URL | sed 's|https://github.com/||' | sed 's|\.git$||')

if [ -n "${GITHUB_TOKEN}" ]; then
    # Private repo - use token authentication
    echo "Using GitHub token for authentication"
    CLONE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_PATH}.git"
    
    git clone --branch ${GITHUB_BRANCH} --single-branch --depth 1 ${CLONE_URL} repo 2>&1 | grep -v "x-access-token" || {
        echo "✗ Failed to clone with token. Error code: $?"
        exit 1
    }
else
    # Public repo - no authentication
    echo "No GitHub token provided - attempting public clone"
    CLONE_URL="https://github.com/${REPO_PATH}.git"
    
    git clone --branch ${GITHUB_BRANCH} --single-branch --depth 1 ${CLONE_URL} repo || {
        echo "✗ Failed to clone repository"
        echo "If this is a private repo, ensure GITHUB_TOKEN is set"
        exit 1
    }
fi

echo "Repository cloned successfully"

# --- Copy required folders ---
echo "[3/6] Copying test files..."

if [ -d "repo/${APP_FOLDER}/scripts" ]; then
    cp -r repo/${APP_FOLDER}/scripts ./
    echo "  ✓ Copied scripts/"
else
    echo "  ✗ Warning: scripts/ folder not found in ${APP_FOLDER}"
fi

if [ -d "repo/${APP_FOLDER}/data" ]; then
    cp -r repo/${APP_FOLDER}/data ./
    echo "  ✓ Copied data/"
else
    echo "  ! Note: data/ folder not found (may not be required)"
fi

if [ -d "repo/k6-custom-processor-utilities" ]; then
    cp -r repo/k6-custom-processor-utilities ./k6-custom-processor-utilities
    echo "  ✓ Copied k6-custom-processor-utilities/"
else
    echo "  ! Note: k6-custom-processor-utilities/ not found (may not be required)"
fi

# List the working directory
echo ""
echo "Working directory structure:"
ls -la /k6-run/
echo ""

# --- Create results directory ---
echo "[4/6] Creating results directory..."
mkdir -p /k6-run/results

# --- Run k6 script ---
echo "[5/6] Running k6 test: ${SCRIPT_NAME}..."
echo "========================================="

# Set start time
START_TIME=$(date +%s)

# -----------------------------------------------------------------------------
# Enable K6 Web Dashboard and export HTML report
# -----------------------------------------------------------------------------
export K6_WEB_DASHBOARD=true
export K6_WEB_DASHBOARD_EXPORT=/k6-run/results/html-report.html

# -----------------------------------------------------------------------------
# Run k6
# - stdout is streamed to console AND saved to k6.log
# - stderr is streamed to console AND saved to error.log
# - JSON metrics and summary are exported as files
# -----------------------------------------------------------------------------
k6 run scripts/${SCRIPT_NAME} \
    --out json=/k6-run/results/results.json \
    --summary-export=/k6-run/results/summary.json \
    > >(tee /k6-run/results/k6.log) \
    2> >(tee /k6-run/results/error.log >&2)

# Capture exit code
K6_EXIT_CODE=$?

# Calculate duration
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "========================================="
echo "K6 test completed with exit code: ${K6_EXIT_CODE}"
echo "Duration: ${DURATION} seconds"

# --- Create metadata file ---
cat > /k6-run/results/metadata.json <<EOF
{
  "run_id": "${RUN_ID}",
  "app_folder": "${APP_FOLDER}",
  "script_name": "${SCRIPT_NAME}",
  "repository": "${GITHUB_REPO_URL}",
  "branch": "${GITHUB_BRANCH}",
  "start_time": "${START_TIME}",
  "end_time": "${END_TIME}",
  "duration_seconds": ${DURATION},
  "exit_code": ${K6_EXIT_CODE},
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Metadata file created"

# --- Upload artifacts to S3 ---
echo "[6/6] Uploading artifacts to S3..."

# Create a unique path in S3 for this run
S3_PATH="s3://${S3_BUCKET}/${APP_FOLDER}/${RUN_ID}/"

# Upload all results
aws s3 cp /k6-run/results ${S3_PATH} --recursive --region ${AWS_REGION}

echo "Artifacts uploaded to: ${S3_PATH}"
echo ""

# --- Final summary ---
echo "========================================="
echo "Execution Summary"
echo "========================================="
echo "Status: $([ ${K6_EXIT_CODE} -eq 0 ] && echo 'SUCCESS ✓' || echo 'FAILED ✗')"
echo "Results Location: ${S3_PATH}"
echo "Run ID: ${RUN_ID}"
echo "Duration: ${DURATION}s"
echo "========================================="

# Exit with k6's exit code
exit ${K6_EXIT_CODE}

