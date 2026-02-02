#!/bin/bash

# =============================================================================
# Complete Cleanup Script - K6 ECS Setup
# =============================================================================
# WARNING: This script will DELETE ALL resources created by k6-ecs-setup.sh
# This includes: S3 bucket, ECS cluster, ECR repository, IAM roles, etc.
# =============================================================================

# Disable AWS CLI pager
export AWS_PAGER=""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables
ACCOUNT_ID="983610474809"
REGION="us-east-1"
S3_BUCKET="k6-artifacts-${ACCOUNT_ID}"
ECS_CLUSTER="k6-cluster-${ACCOUNT_ID}"
TASK_DEFINITION="k6-task-${ACCOUNT_ID}"
TASK_EXECUTION_ROLE="k6-ecs-task-execution-role-${ACCOUNT_ID}"
LOG_GROUP="/ecs/k6-logs-${ACCOUNT_ID}"
IAM_USER="k6-ecs-manager"
ECR_REPO="k6-runner"

echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                  ⚠️  WARNING - CLEANUP SCRIPT  ⚠️          ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}This script will DELETE the following AWS resources:${NC}"
echo ""
echo "  • S3 Bucket:           ${S3_BUCKET}"
echo "  • ECS Cluster:         ${ECS_CLUSTER}"
echo "  • ECR Repository:      ${ECR_REPO}"
echo "  • Task Definition:     ${TASK_DEFINITION}"
echo "  • IAM Role:            ${TASK_EXECUTION_ROLE}"
echo "  • IAM User:            ${IAM_USER}"
echo "  • CloudWatch Logs:     ${LOG_GROUP}"
echo "  • All associated IAM policies"
echo ""
echo -e "${RED}⚠️  This action CANNOT be undone!${NC}"
echo -e "${RED}⚠️  All test results and data will be permanently deleted!${NC}"
echo ""
echo -e "${YELLOW}Are you sure you want to continue?${NC}"
read -p "Type 'DELETE' in all caps to confirm: " CONFIRMATION

if [ "$CONFIRMATION" != "DELETE" ]; then
    echo -e "${GREEN}Cleanup cancelled. No resources were deleted.${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}Starting cleanup process...${NC}"
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

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Error counter
ERRORS=0

# =============================================================================
# 1. STOP AND DELETE ALL RUNNING ECS TASKS
# =============================================================================
echo -e "${YELLOW}Step 1: Stopping all running ECS tasks${NC}"

RUNNING_TASKS=$(aws ecs list-tasks --cluster "${ECS_CLUSTER}" --region "${REGION}" --query 'taskArns[]' --output text 2>/dev/null || echo "")

if [ -n "$RUNNING_TASKS" ]; then
    for TASK_ARN in $RUNNING_TASKS; do
        echo "  Stopping task: $(basename ${TASK_ARN})"
        aws ecs stop-task --cluster "${ECS_CLUSTER}" --task "${TASK_ARN}" --region "${REGION}" --no-cli-pager 2>/dev/null || true
    done
    print_status "All running tasks stopped"
    sleep 5  # Wait for tasks to stop
else
    print_info "No running tasks found"
fi

# =============================================================================
# 2. DEREGISTER ALL TASK DEFINITIONS
# =============================================================================
echo -e "\n${YELLOW}Step 2: Deregistering task definitions${NC}"

TASK_DEFS=$(aws ecs list-task-definitions --family-prefix "${TASK_DEFINITION}" --region "${REGION}" --query 'taskDefinitionArns[]' --output text 2>/dev/null || echo "")

if [ -n "$TASK_DEFS" ]; then
    for TASK_DEF_ARN in $TASK_DEFS; do
        echo "  Deregistering: $(basename ${TASK_DEF_ARN})"
        aws ecs deregister-task-definition --task-definition "${TASK_DEF_ARN}" --region "${REGION}" --no-cli-pager 2>/dev/null || true
    done
    print_status "All task definitions deregistered"
else
    print_info "No task definitions found"
fi

# =============================================================================
# 3. DELETE ECS CLUSTER
# =============================================================================
echo -e "\n${YELLOW}Step 3: Deleting ECS cluster${NC}"

if aws ecs describe-clusters --clusters "${ECS_CLUSTER}" --region "${REGION}" --query 'clusters[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
    aws ecs delete-cluster --cluster "${ECS_CLUSTER}" --region "${REGION}" --no-cli-pager 2>/dev/null
    if [ $? -eq 0 ]; then
        print_status "ECS cluster deleted: ${ECS_CLUSTER}"
    else
        print_error "Failed to delete ECS cluster"
        ((ERRORS++))
    fi
else
    print_info "ECS cluster not found or already deleted"
fi

# =============================================================================
# 4. DELETE ECR REPOSITORY
# =============================================================================
echo -e "\n${YELLOW}Step 4: Deleting ECR repository${NC}"

if aws ecr describe-repositories --repository-names "${ECR_REPO}" --region "${REGION}" 2>/dev/null > /dev/null; then
    aws ecr delete-repository --repository-name "${ECR_REPO}" --force --region "${REGION}" --no-cli-pager 2>/dev/null
    if [ $? -eq 0 ]; then
        print_status "ECR repository deleted: ${ECR_REPO}"
    else
        print_error "Failed to delete ECR repository"
        ((ERRORS++))
    fi
else
    print_info "ECR repository not found or already deleted"
fi

# =============================================================================
# 5. DELETE S3 BUCKET (AND ALL CONTENTS)
# =============================================================================
echo -e "\n${YELLOW}Step 5: Deleting S3 bucket and all contents${NC}"

if aws s3 ls "s3://${S3_BUCKET}" 2>/dev/null; then
    # Count objects
    OBJECT_COUNT=$(aws s3 ls "s3://${S3_BUCKET}" --recursive | wc -l)
    print_info "Found ${OBJECT_COUNT} objects in S3 bucket"
    
    # Delete all object versions and delete markers (for versioned buckets)
    echo "  Deleting all object versions..."
    aws s3api list-object-versions --bucket "${S3_BUCKET}" --output json | \
        jq -r '.Versions[]?, .DeleteMarkers[]? | "\(.Key)\t\(.VersionId)"' | \
        while IFS=$'\t' read -r key versionId; do
            if [ -n "$key" ] && [ -n "$versionId" ]; then
                aws s3api delete-object --bucket "${S3_BUCKET}" --key "$key" --version-id "$versionId" 2>/dev/null
            fi
        done
    
    # Delete all current objects
    echo "  Deleting all objects..."
    aws s3 rm "s3://${S3_BUCKET}" --recursive --no-cli-pager 2>/dev/null
    
    # Verify bucket is empty
    REMAINING=$(aws s3 ls "s3://${S3_BUCKET}" --recursive | wc -l)
    if [ "$REMAINING" -gt 0 ]; then
        print_warning "Bucket still has ${REMAINING} objects, forcing deletion..."
        # Force delete any remaining objects
        aws s3api list-objects-v2 --bucket "${S3_BUCKET}" --query 'Contents[].Key' --output text | \
            xargs -I {} aws s3api delete-object --bucket "${S3_BUCKET}" --key "{}"
    fi
    
    # Now delete the empty bucket
    aws s3api delete-bucket --bucket "${S3_BUCKET}" --region "${REGION}" 2>/dev/null
    if [ $? -eq 0 ]; then
        print_status "S3 bucket deleted: ${S3_BUCKET}"
    else
        print_error "Failed to delete S3 bucket (may not be empty)"
        echo "  Try manually: aws s3 rb s3://${S3_BUCKET} --force"
        ((ERRORS++))
    fi
else
    print_info "S3 bucket not found or already deleted"
fi

# =============================================================================
# 6. DELETE CLOUDWATCH LOG GROUP
# =============================================================================
echo -e "\n${YELLOW}Step 6: Deleting CloudWatch log group${NC}"

if aws logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" --region "${REGION}" 2>/dev/null | grep -q "${LOG_GROUP}"; then
    aws logs delete-log-group --log-group-name "${LOG_GROUP}" --region "${REGION}" 2>/dev/null
    if [ $? -eq 0 ]; then
        print_status "CloudWatch log group deleted: ${LOG_GROUP}"
    else
        print_error "Failed to delete CloudWatch log group"
        ((ERRORS++))
    fi
else
    print_info "CloudWatch log group not found or already deleted"
fi

# =============================================================================
# 7. DELETE IAM POLICIES FROM TASK EXECUTION ROLE
# =============================================================================
echo -e "\n${YELLOW}Step 7: Detaching policies from task execution role${NC}"

if aws iam get-role --role-name "${TASK_EXECUTION_ROLE}" 2>/dev/null > /dev/null; then
    # Detach AWS managed policy
    aws iam detach-role-policy \
        --role-name "${TASK_EXECUTION_ROLE}" \
        --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" 2>/dev/null || true
    print_status "Detached AmazonECSTaskExecutionRolePolicy"
    
    # Detach custom policies
    S3_POLICY_NAME="k6-s3-write-policy-${ACCOUNT_ID}"
    CW_POLICY_NAME="k6-cloudwatch-logs-policy-${ACCOUNT_ID}"
    
    aws iam detach-role-policy \
        --role-name "${TASK_EXECUTION_ROLE}" \
        --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${S3_POLICY_NAME}" 2>/dev/null || true
    print_status "Detached S3 write policy"
    
    aws iam detach-role-policy \
        --role-name "${TASK_EXECUTION_ROLE}" \
        --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CW_POLICY_NAME}" 2>/dev/null || true
    print_status "Detached CloudWatch logs policy"
else
    print_info "Task execution role not found"
fi

# =============================================================================
# 8. DELETE IAM TASK EXECUTION ROLE
# =============================================================================
echo -e "\n${YELLOW}Step 8: Deleting IAM task execution role${NC}"

if aws iam get-role --role-name "${TASK_EXECUTION_ROLE}" 2>/dev/null > /dev/null; then
    aws iam delete-role --role-name "${TASK_EXECUTION_ROLE}" 2>/dev/null
    if [ $? -eq 0 ]; then
        print_status "IAM role deleted: ${TASK_EXECUTION_ROLE}"
    else
        print_error "Failed to delete IAM role (may have attached policies)"
        ((ERRORS++))
    fi
else
    print_info "IAM role not found or already deleted"
fi

# =============================================================================
# 9. DELETE CUSTOM IAM POLICIES
# =============================================================================
echo -e "\n${YELLOW}Step 9: Deleting custom IAM policies${NC}"

S3_POLICY_NAME="k6-s3-write-policy-${ACCOUNT_ID}"
CW_POLICY_NAME="k6-cloudwatch-logs-policy-${ACCOUNT_ID}"
ECS_POLICY_NAME="k6-ecs-management-policy-${ACCOUNT_ID}"

# Delete S3 policy
if aws iam get-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${S3_POLICY_NAME}" 2>/dev/null > /dev/null; then
    aws iam delete-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${S3_POLICY_NAME}" 2>/dev/null
    print_status "Deleted policy: ${S3_POLICY_NAME}"
else
    print_info "S3 policy not found or already deleted"
fi

# Delete CloudWatch policy
if aws iam get-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CW_POLICY_NAME}" 2>/dev/null > /dev/null; then
    aws iam delete-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${CW_POLICY_NAME}" 2>/dev/null
    print_status "Deleted policy: ${CW_POLICY_NAME}"
else
    print_info "CloudWatch policy not found or already deleted"
fi

# Delete ECS management policy
if aws iam get-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${ECS_POLICY_NAME}" 2>/dev/null > /dev/null; then
    aws iam delete-policy --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/${ECS_POLICY_NAME}" 2>/dev/null
    print_status "Deleted policy: ${ECS_POLICY_NAME}"
else
    print_info "ECS management policy not found or already deleted"
fi

# =============================================================================
# 10. DELETE IAM USER ACCESS KEYS
# =============================================================================
echo -e "\n${YELLOW}Step 10: Deleting IAM user access keys${NC}"

if aws iam get-user --user-name "${IAM_USER}" 2>/dev/null > /dev/null; then
    # List and delete all access keys
    ACCESS_KEYS=$(aws iam list-access-keys --user-name "${IAM_USER}" --query 'AccessKeyMetadata[].AccessKeyId' --output text 2>/dev/null || echo "")
    
    if [ -n "$ACCESS_KEYS" ]; then
        for KEY_ID in $ACCESS_KEYS; do
            aws iam delete-access-key --user-name "${IAM_USER}" --access-key-id "${KEY_ID}" 2>/dev/null
            print_status "Deleted access key: ${KEY_ID:0:10}..."
        done
    else
        print_info "No access keys found for user"
    fi
else
    print_info "IAM user not found"
fi

# =============================================================================
# 11. DETACH POLICIES FROM IAM USER
# =============================================================================
echo -e "\n${YELLOW}Step 11: Detaching policies from IAM user${NC}"

if aws iam get-user --user-name "${IAM_USER}" 2>/dev/null > /dev/null; then
    # List attached policies
    ATTACHED_POLICIES=$(aws iam list-attached-user-policies --user-name "${IAM_USER}" --query 'AttachedPolicies[].PolicyArn' --output text 2>/dev/null || echo "")
    
    if [ -n "$ATTACHED_POLICIES" ]; then
        for POLICY_ARN in $ATTACHED_POLICIES; do
            aws iam detach-user-policy --user-name "${IAM_USER}" --policy-arn "${POLICY_ARN}" 2>/dev/null
            print_status "Detached policy: $(basename ${POLICY_ARN})"
        done
    else
        print_info "No policies attached to user"
    fi
else
    print_info "IAM user not found"
fi

# =============================================================================
# 12. DELETE IAM USER
# =============================================================================
echo -e "\n${YELLOW}Step 12: Deleting IAM user${NC}"

if aws iam get-user --user-name "${IAM_USER}" 2>/dev/null > /dev/null; then
    aws iam delete-user --user-name "${IAM_USER}" 2>/dev/null
    if [ $? -eq 0 ]; then
        print_status "IAM user deleted: ${IAM_USER}"
    else
        print_error "Failed to delete IAM user (may have attached policies or access keys)"
        ((ERRORS++))
    fi
else
    print_info "IAM user not found or already deleted"
fi

# =============================================================================
# CLEANUP SUMMARY
# =============================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    CLEANUP COMPLETE                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All resources deleted successfully!${NC}"
else
    echo -e "${YELLOW}⚠ Cleanup completed with ${ERRORS} error(s)${NC}"
    echo ""
    echo "Some resources may still exist. Run the verification commands below:"
    echo ""
    echo "  aws s3 ls s3://${S3_BUCKET} 2>/dev/null && echo 'S3 bucket still exists'"
    echo "  aws ecs describe-clusters --clusters ${ECS_CLUSTER} 2>/dev/null && echo 'ECS cluster still exists'"
    echo "  aws iam get-role --role-name ${TASK_EXECUTION_ROLE} 2>/dev/null && echo 'IAM role still exists'"
fi

echo ""
echo "Deleted resources:"
echo "  ✓ S3 Bucket: ${S3_BUCKET}"
echo "  ✓ ECS Cluster: ${ECS_CLUSTER}"
echo "  ✓ ECR Repository: ${ECR_REPO}"
echo "  ✓ Task Definitions: ${TASK_DEFINITION}"
echo "  ✓ IAM Role: ${TASK_EXECUTION_ROLE}"
echo "  ✓ IAM User: ${IAM_USER}"
echo "  ✓ CloudWatch Logs: ${LOG_GROUP}"
echo "  ✓ Custom IAM Policies"
echo ""
echo -e "${BLUE}To recreate the setup, run:${NC}"
echo "  ./k6-ecs-setup.sh"
echo ""
