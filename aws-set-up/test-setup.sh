#!/bin/bash
set -e

# =============================================================================
# Test K6 ECS Setup
# =============================================================================
# This script runs a simple test to verify your ECS/Fargate setup is working

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Variables
ACCOUNT_ID="983610474809"
REGION="us-east-1"
ECS_CLUSTER="k6-cluster-v3-${ACCOUNT_ID}"
TASK_DEFINITION="k6-task-${ACCOUNT_ID}"
S3_BUCKET="k6-artifacts-${ACCOUNT_ID}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Testing K6 ECS Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

# Test 1: Check S3 bucket
echo -e "${YELLOW}Test 1: Checking S3 bucket${NC}"
if aws s3 ls "s3://${S3_BUCKET}" 2>/dev/null; then
    print_status "S3 bucket exists and is accessible"
else
    print_error "S3 bucket not found or not accessible"
    exit 1
fi

# Test 2: Check IAM role
echo -e "\n${YELLOW}Test 2: Checking IAM role${NC}"
ROLE_NAME="k6-ecs-task-execution-role-${ACCOUNT_ID}"
if aws iam get-role --role-name "${ROLE_NAME}" 2>/dev/null > /dev/null; then
    print_status "IAM role exists: ${ROLE_NAME}"
else
    print_error "IAM role not found: ${ROLE_NAME}"
    exit 1
fi

# Test 3: Check CloudWatch log group
echo -e "\n${YELLOW}Test 3: Checking CloudWatch log group${NC}"
LOG_GROUP="/ecs/k6-logs-${ACCOUNT_ID}"
if aws logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" --region "${REGION}" | grep -q "${LOG_GROUP}"; then
    print_status "CloudWatch log group exists: ${LOG_GROUP}"
else
    print_error "CloudWatch log group not found"
    exit 1
fi

# Test 4: Check ECS cluster
echo -e "\n${YELLOW}Test 4: Checking ECS cluster${NC}"
if aws ecs describe-clusters --clusters "${ECS_CLUSTER}" --region "${REGION}" | grep -q "ACTIVE"; then
    print_status "ECS cluster is active: ${ECS_CLUSTER}"
else
    print_error "ECS cluster not found or not active"
    exit 1
fi

# Test 5: Check task definition
echo -e "\n${YELLOW}Test 5: Checking task definition${NC}"
TASK_DEF_STATUS=$(aws ecs describe-task-definition --task-definition "${TASK_DEFINITION}" --region "${REGION}" --query 'taskDefinition.status' --output text 2>/dev/null || echo "NOT_FOUND")
if [ "${TASK_DEF_STATUS}" = "ACTIVE" ]; then
    TASK_REV=$(aws ecs describe-task-definition --task-definition "${TASK_DEFINITION}" --query 'taskDefinition.revision' --output text)
    print_status "Task definition is active: ${TASK_DEFINITION}:${TASK_REV}"
else
    print_error "Task definition not found or not active"
    exit 1
fi

# Test 6: Check ECR repository
echo -e "\n${YELLOW}Test 6: Checking ECR repository${NC}"
if aws ecr describe-repositories --repository-names "k6-runner" --region "${REGION}" 2>/dev/null > /dev/null; then
    IMAGE_COUNT=$(aws ecr describe-images --repository-name "k6-runner" --query 'length(imageDetails)' --output text)
    print_status "ECR repository exists with ${IMAGE_COUNT} image(s)"
    
    if [ "${IMAGE_COUNT}" -eq 0 ]; then
        print_info "No images found. Run ./build-and-push.sh to build and push the image"
    fi
else
    print_info "ECR repository not found (will be created when you run build-and-push.sh)"
fi

# Test 7: Get VPC information for test run
echo -e "\n${YELLOW}Test 7: Getting VPC information${NC}"
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text 2>/dev/null || echo "NOT_FOUND")

if [ "${VPC_ID}" != "NOT_FOUND" ] && [ "${VPC_ID}" != "None" ]; then
    print_status "Default VPC found: ${VPC_ID}"
    
    SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
    print_status "Subnets: ${SUBNETS}"
    
    SG_ID=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=default" --query 'SecurityGroups[0].GroupId' --output text)
    print_status "Default security group: ${SG_ID}"
else
    print_error "No default VPC found. You'll need to create a VPC and configure networking."
    exit 1
fi

# Optional: Run a test task
echo -e "\n${YELLOW}========================================${NC}"
echo -e "${YELLOW}Run a test task?${NC}"
echo -e "${YELLOW}========================================${NC}"
echo "This will start an ECS Fargate task to verify everything works."
echo "The task will run a simple k6 test and upload results to S3."
echo ""
read -p "Run test task? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}Starting test task...${NC}"
    
    # Get latest task definition ARN
    TASK_DEF_ARN=$(aws ecs describe-task-definition --task-definition "${TASK_DEFINITION}" --query 'taskDefinition.taskDefinitionArn' --output text)
    
    # Generate run ID
    RUN_ID="test-$(date +%Y%m%d-%H%M%S)"
    
    # Run the task
    TASK_ARN=$(aws ecs run-task \
        --cluster "${ECS_CLUSTER}" \
        --task-definition "${TASK_DEF_ARN}" \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={
            subnets=[${SUBNETS}],
            securityGroups=[${SG_ID}],
            assignPublicIp=ENABLED
        }" \
        --overrides '{
            "containerOverrides": [
                {
                    "name": "k6-runner",
                    "environment": [
                        {"name": "APP_FOLDER", "value": "test"},
                        {"name": "SCRIPT_NAME", "value": "simple-test.js"},
                        {"name": "GITHUB_REPO_URL", "value": "https://github.com/grafana/k6.git"},
                        {"name": "GITHUB_BRANCH", "value": "master"},
                        {"name": "S3_BUCKET", "value": "'"${S3_BUCKET}"'"},
                        {"name": "AWS_REGION", "value": "'"${REGION}"'"},
                        {"name": "RUN_ID", "value": "'"${RUN_ID}"'"}
                    ],
                    "command": ["sh", "-c", "echo \"Testing k6 setup...\" && k6 version && echo \"K6 is working!\""]
                }
            ]
        }' \
        --region "${REGION}" \
        --query 'tasks[0].taskArn' \
        --output text)
    
    print_status "Task started: ${TASK_ARN}"
    
    echo ""
    echo "Monitoring task (this may take a few minutes)..."
    
    # Wait for task to complete
    aws ecs wait tasks-stopped --cluster "${ECS_CLUSTER}" --tasks "${TASK_ARN}" --region "${REGION}"
    
    # Get exit code
    EXIT_CODE=$(aws ecs describe-tasks --cluster "${ECS_CLUSTER}" --tasks "${TASK_ARN}" --query 'tasks[0].containers[0].exitCode' --output text)
    
    echo ""
    if [ "${EXIT_CODE}" = "0" ]; then
        print_status "Test task completed successfully!"
    else
        print_error "Test task failed with exit code: ${EXIT_CODE}"
    fi
    
    # Show logs URL
    echo ""
    echo "View logs at:"
    echo "https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/\$252Fecs\$252Fk6-logs-${ACCOUNT_ID}"
fi

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "All core components are configured correctly!"
echo ""
echo "Next steps:"
echo "  1. Run ./build-and-push.sh to build and push your k6 image"
echo "  2. Configure GitHub Actions with AWS credentials"
echo "  3. Add the workflow file to your repository"
echo "  4. Run your first k6 load test!"
echo ""
echo "Resources:"
echo "  S3 Bucket: ${S3_BUCKET}"
echo "  ECS Cluster: ${ECS_CLUSTER}"
echo "  Log Group: ${LOG_GROUP}"
echo ""
