#!/bin/bash
set -e

# AWS DevOps Setup Script for k6 ECS/Fargate Execution
# Account ID: 983610474809
# Region: us-east-1

# Disable AWS CLI pager to prevent getting stuck
export AWS_PAGER=""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
ACCOUNT_ID="983610474809"
REGION="us-east-1"
S3_BUCKET="k6-artifacts-${ACCOUNT_ID}"
ECS_CLUSTER="k6-cluster-v3-${ACCOUNT_ID}"
TASK_EXECUTION_ROLE="k6-ecs-task-execution-role-${ACCOUNT_ID}"
TASK_DEFINITION_NAME="k6-task-${ACCOUNT_ID}"
LOG_GROUP="/ecs/k6-logs-${ACCOUNT_ID}"
IAM_USER="k6-ecs-manager"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AWS k6 ECS/Fargate Setup Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Account ID: $ACCOUNT_ID"
echo "Region: $REGION"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# ==========================================
# 1. CREATE S3 BUCKET FOR ARTIFACTS
# ==========================================
echo -e "${YELLOW}Step 1: Creating S3 Bucket${NC}"

if aws s3 ls "s3://${S3_BUCKET}" 2>&1 | grep -q 'NoSuchBucket'; then
    aws s3api create-bucket \
        --bucket "${S3_BUCKET}" \
        --region "${REGION}" \
        --create-bucket-configuration LocationConstraint="${REGION}" 2>/dev/null || \
    aws s3api create-bucket \
        --bucket "${S3_BUCKET}" \
        --region "${REGION}"
    
    print_status "S3 bucket created: ${S3_BUCKET}"
else
    print_warning "S3 bucket already exists: ${S3_BUCKET}"
fi

# Enable versioning (optional)
aws s3api put-bucket-versioning \
    --bucket "${S3_BUCKET}" \
    --versioning-configuration Status=Enabled

print_status "S3 bucket versioning enabled"

# Enable server-side encryption
aws s3api put-bucket-encryption \
    --bucket "${S3_BUCKET}" \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            }
        }]
    }'

print_status "S3 bucket encryption enabled (SSE-S3)"

# Block public access
aws s3api put-public-access-block \
    --bucket "${S3_BUCKET}" \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

print_status "S3 bucket public access blocked"

# ==========================================
# 2. CREATE IAM TASK EXECUTION ROLE
# ==========================================
echo -e "\n${YELLOW}Step 2: Creating IAM Task Execution Role${NC}"

# Create trust policy document
cat > /tmp/ecs-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the role
if aws iam get-role --role-name "${TASK_EXECUTION_ROLE}" 2>/dev/null; then
    print_warning "IAM role already exists: ${TASK_EXECUTION_ROLE}"
else
    aws iam create-role \
        --role-name "${TASK_EXECUTION_ROLE}" \
        --assume-role-policy-document file:///tmp/ecs-trust-policy.json \
        --description "ECS Task Execution Role for k6 load testing"
    
    print_status "IAM role created: ${TASK_EXECUTION_ROLE}"
fi

# Attach AWS managed policy for ECS task execution
aws iam attach-role-policy \
    --role-name "${TASK_EXECUTION_ROLE}" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"

print_status "Attached AmazonECSTaskExecutionRolePolicy"

# Create custom S3 write policy
cat > /tmp/s3-write-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    }
  ]
}
EOF

# Create and attach S3 write policy
S3_POLICY_NAME="k6-s3-write-policy-${ACCOUNT_ID}"

if aws iam get-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${S3_POLICY_NAME}" 2>/dev/null; then
    print_warning "S3 policy already exists: ${S3_POLICY_NAME}"
else
    aws iam create-policy \
        --policy-name "${S3_POLICY_NAME}" \
        --policy-document file:///tmp/s3-write-policy.json \
        --description "Write access to k6 artifacts S3 bucket"
    
    print_status "Created S3 write policy: ${S3_POLICY_NAME}"
fi

aws iam attach-role-policy \
    --role-name "${TASK_EXECUTION_ROLE}" \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${S3_POLICY_NAME}"

print_status "Attached S3 write policy to task execution role"

# Create CloudWatch Logs policy
cat > /tmp/cloudwatch-logs-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:${LOG_GROUP}:*"
    }
  ]
}
EOF

CW_POLICY_NAME="k6-cloudwatch-logs-policy-${ACCOUNT_ID}"

if aws iam get-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CW_POLICY_NAME}" 2>/dev/null; then
    print_warning "CloudWatch Logs policy already exists: ${CW_POLICY_NAME}"
else
    aws iam create-policy \
        --policy-name "${CW_POLICY_NAME}" \
        --policy-document file:///tmp/cloudwatch-logs-policy.json \
        --description "CloudWatch Logs access for k6 ECS tasks"
    
    print_status "Created CloudWatch Logs policy: ${CW_POLICY_NAME}"
fi

aws iam attach-role-policy \
    --role-name "${TASK_EXECUTION_ROLE}" \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CW_POLICY_NAME}"

print_status "Attached CloudWatch Logs policy to task execution role"

# ==========================================
# 3. CREATE IAM USER FOR ECS MANAGEMENT
# ==========================================
echo -e "\n${YELLOW}Step 3: Creating IAM User for ECS Management${NC}"

if aws iam get-user --user-name "${IAM_USER}" 2>/dev/null; then
    print_warning "IAM user already exists: ${IAM_USER}"
else
    aws iam create-user \
        --user-name "${IAM_USER}" \
        --tags Key=Purpose,Value=K6LoadTesting Key=Component,Value=ECS
    
    print_status "IAM user created: ${IAM_USER}"
fi

# Create custom ECS management policy
cat > /tmp/ecs-management-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:*"
      ],
      "Resource": [
        "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${ECS_CLUSTER}",
        "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/${TASK_DEFINITION_NAME}:*",
        "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task/${ECS_CLUSTER}/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
      	"ecs:RunTask",
        "ecs:DescribeTasks",
        "ecs:ListTasks",
        "ecs:StopTask",
        "ecs:DescribeClusters",
        "ecs:DescribeTaskDefinition",
        "ecs:ListClusters",
        "ecs:ListTaskDefinitions"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::${ACCOUNT_ID}:role/${TASK_EXECUTION_ROLE}"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs"
      ],
      "Resource": "*"
    }
  ]
}
EOF

ECS_MGMT_POLICY_NAME="k6-ecs-management-policy-${ACCOUNT_ID}"

if aws iam get-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${ECS_MGMT_POLICY_NAME}" 2>/dev/null; then
    print_warning "ECS management policy already exists: ${ECS_MGMT_POLICY_NAME}"
else
    aws iam create-policy \
        --policy-name "${ECS_MGMT_POLICY_NAME}" \
        --policy-document file:///tmp/ecs-management-policy.json \
        --description "ECS management permissions for k6 cluster"
    
    print_status "Created ECS management policy: ${ECS_MGMT_POLICY_NAME}"
fi

aws iam attach-user-policy \
    --user-name "${IAM_USER}" \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${ECS_MGMT_POLICY_NAME}"

print_status "Attached ECS management policy to user"

# Attach S3 access for artifacts
aws iam attach-user-policy \
    --user-name "${IAM_USER}" \
    --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${S3_POLICY_NAME}"

print_status "Attached S3 access policy to user"

# ==========================================
# 4. CREATE CLOUDWATCH LOG GROUP
# ==========================================
echo -e "\n${YELLOW}Step 4: Creating CloudWatch Log Group${NC}"

if aws logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" --region "${REGION}" | grep -q "${LOG_GROUP}"; then
    print_warning "CloudWatch Log Group already exists: ${LOG_GROUP}"
else
    aws logs create-log-group \
        --log-group-name "${LOG_GROUP}" \
        --region "${REGION}"
    
    print_status "CloudWatch Log Group created: ${LOG_GROUP}"
fi

# Set retention policy (30 days)
aws logs put-retention-policy \
    --log-group-name "${LOG_GROUP}" \
    --retention-in-days 30 \
    --region "${REGION}"

print_status "Log retention set to 30 days"

# ==========================================
# 5. CREATE ECS CLUSTER
# ==========================================
echo -e "\n${YELLOW}Step 5: Creating ECS Cluster${NC}"

if aws ecs describe-clusters --clusters "${ECS_CLUSTER}" --region "${REGION}" | grep -q "ACTIVE"; then
    print_warning "ECS Cluster already exists: ${ECS_CLUSTER}"
else
    aws ecs create-cluster \
        --cluster-name "${ECS_CLUSTER}" \
        --region "${REGION}" \
        --tags key=Purpose,value=K6LoadTesting key=LaunchType,value=Fargate
    
    print_status "ECS Cluster created: ${ECS_CLUSTER}"
fi

# Enable Container Insights
aws ecs update-cluster-settings \
    --cluster "${ECS_CLUSTER}" \
    --settings name=containerInsights,value=enabled \
    --region "${REGION}"

print_status "Container Insights enabled for cluster"

# ==========================================
# 6. CREATE ECS TASK DEFINITION
# ==========================================
echo -e "\n${YELLOW}Step 6: Creating ECS Task Definition${NC}"

# Note: You need to replace YOUR_ECR_REPOSITORY with your actual ECR repository URL
# Example: 983610474809.dkr.ecr.us-east-1.amazonaws.com/k6-runner:latest

cat > /tmp/task-definition.json <<EOF
{
  "family": "${TASK_DEFINITION_NAME}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/${TASK_EXECUTION_ROLE}",
  "taskRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/${TASK_EXECUTION_ROLE}",
  "containerDefinitions": [
    {
      "name": "k6-runner",
      "image": "loadimpact/k6:latest",
      "essential": true,
      "environment": [
        {
          "name": "AWS_DEFAULT_REGION",
          "value": "${REGION}"
        },
        {
          "name": "S3_BUCKET",
          "value": "${S3_BUCKET}"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "k6"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition \
    --cli-input-json file:///tmp/task-definition.json \
    --region "${REGION}"

print_status "ECS Task Definition registered: ${TASK_DEFINITION_NAME}"

# ==========================================
# 7. CREATE ACCESS KEYS FOR IAM USER (OPTIONAL)
# ==========================================
echo -e "\n${YELLOW}Step 7: Access Keys${NC}"
echo -e "${YELLOW}Would you like to create access keys for the IAM user ${IAM_USER}?${NC}"
echo -e "${YELLOW}These will be needed for GitHub Actions to deploy ECS tasks.${NC}"
echo ""
read -p "Create access keys? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    ACCESS_KEYS=$(aws iam create-access-key --user-name "${IAM_USER}")
    
    ACCESS_KEY_ID=$(echo $ACCESS_KEYS | jq -r '.AccessKey.AccessKeyId')
    SECRET_ACCESS_KEY=$(echo $ACCESS_KEYS | jq -r '.AccessKey.SecretAccessKey')
    
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}Access Keys Created${NC}"
    echo -e "${GREEN}================================${NC}"
    echo "Access Key ID: ${ACCESS_KEY_ID}"
    echo "Secret Access Key: ${SECRET_ACCESS_KEY}"
    echo ""
    echo -e "${RED}IMPORTANT: Save these credentials securely!${NC}"
    echo -e "${RED}They will not be shown again.${NC}"
    echo ""
    echo "Add these as secrets in your GitHub repository:"
    echo "  AWS_ACCESS_KEY_ID: ${ACCESS_KEY_ID}"
    echo "  AWS_SECRET_ACCESS_KEY: ${SECRET_ACCESS_KEY}"
    echo "  AWS_REGION: ${REGION}"
    echo "  AWS_ACCOUNT_ID: ${ACCOUNT_ID}"
    echo ""
fi

# ==========================================
# CLEANUP TEMP FILES
# ==========================================
rm -f /tmp/ecs-trust-policy.json
rm -f /tmp/s3-write-policy.json
rm -f /tmp/cloudwatch-logs-policy.json
rm -f /tmp/ecs-management-policy.json
rm -f /tmp/task-definition.json

# ==========================================
# SUMMARY
# ==========================================
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Created Resources:"
echo "  ✓ S3 Bucket: ${S3_BUCKET}"
echo "  ✓ IAM Task Execution Role: ${TASK_EXECUTION_ROLE}"
echo "  ✓ IAM User: ${IAM_USER}"
echo "  ✓ CloudWatch Log Group: ${LOG_GROUP}"
echo "  ✓ ECS Cluster: ${ECS_CLUSTER}"
echo "  ✓ ECS Task Definition: ${TASK_DEFINITION_NAME}"
echo ""
echo "Next Steps:"
echo "  1. Build and push your Docker image to ECR"
echo "  2. Update the task definition with your ECR image URI"
echo "  3. Configure GitHub Actions with the IAM user credentials"
echo "  4. Set up VPC, subnets, and security groups for Fargate tasks"
echo ""
echo -e "${YELLOW}Note: Task definition uses default k6 image.${NC}"
echo -e "${YELLOW}Update it with your custom image containing entrypoint.sh${NC}"
echo ""

