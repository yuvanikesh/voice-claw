#!/bin/bash

# Azure Deployment Automation Script for VoiceClaw (Unified Container)
# Exit immediately if any command fails
set -e

# --- Configuration (Update these values) ---
RESOURCE_GROUP="voiceclaw-india-rg"
LOCATION="centralindia" # Location for Resource Group and ACR
PLAN_LOCATION="eastasia" # Location for App Service Plan
APP_SERVICE_PLAN="voiceclaw-plan-eastasia"
WEB_APP_NAME="voiceclaw-app" # Must be globally unique in Azure
ACR_NAME="voiceclawregistry" # Must be globally unique (letters & numbers only)
IMAGE_NAME="voiceclaw"
IMAGE_TAG="latest"

# Helper for colored output
info() { echo -e "\033[1;34m[INFO]\033[0m $1"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $1"; exit 1; }

# 1. Prerequisite checks
info "Checking prerequisites..."

if ! command -v az &> /dev/null; then
    error "Azure CLI ('az') is not installed. Install it using:\n  brew install azure-cli\nThen run 'az login' and retry this script."
fi

if ! docker info &> /dev/null; then
    error "Docker daemon is not running. Please start Docker Desktop and retry."
fi

# 2. Azure Login
info "Checking Azure login state..."
az account show &> /dev/null || {
    info "Not logged in. Initiating Azure login..."
    az login
}

# 3. Create Resource Group (if it doesn't exist)
info "Ensuring Resource Group '$RESOURCE_GROUP' exists in '$LOCATION'..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output table

# 4. Create Azure Container Registry (if it doesn't exist)
info "Ensuring Azure Container Registry '$ACR_NAME' exists..."
if ! az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    info "Creating Azure Container Registry..."
    az acr create --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" --sku Basic --admin-enabled true --output table
else
    info "Azure Container Registry already exists."
fi

# Get ACR credentials
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer --output tsv)
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" --output tsv)

# 5. Build and Push Container Image
info "Logging into ACR via Docker..."
docker login "$ACR_LOGIN_SERVER" --username "$ACR_USERNAME" --password "$ACR_PASSWORD"

FULL_IMAGE_NAME="$ACR_LOGIN_SERVER/$IMAGE_NAME:$IMAGE_TAG"
info "Building Docker image: $FULL_IMAGE_NAME..."
docker build -t "$FULL_IMAGE_NAME" .

info "Pushing Docker image to registry..."
docker push "$FULL_IMAGE_NAME"

# 6. Create App Service Plan (if it doesn't exist)
info "Ensuring App Service Plan '$APP_SERVICE_PLAN' exists..."
if ! az appservice plan show --name "$APP_SERVICE_PLAN" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    info "Creating Linux App Service Plan (B1 basic tier)..."
    az appservice plan create --name "$APP_SERVICE_PLAN" --resource-group "$RESOURCE_GROUP" --sku B1 --is-linux --location "$PLAN_LOCATION" --output table
else
    info "App Service Plan already exists."
fi

# 7. Create Web App (if it doesn't exist)
info "Ensuring App Service Web App '$WEB_APP_NAME' exists..."
if ! az webapp show --name "$WEB_APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    info "Creating Web App for Containers..."
    az webapp create --resource-group "$RESOURCE_GROUP" --plan "$APP_SERVICE_PLAN" --name "$WEB_APP_NAME" \
        --role "$FULL_IMAGE_NAME" --acr-user-name "$ACR_USERNAME" --acr-password "$ACR_PASSWORD" --output table
else
    info "Web App already exists. Updating deployment image..."
    az webapp config container set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" \
        --container-image-name "$FULL_IMAGE_NAME" --container-registry-url "https://$ACR_LOGIN_SERVER" \
        --container-registry-user "$ACR_USERNAME" --container-registry-password "$ACR_PASSWORD"
fi

# 8. Configure Environment Variables and Data Persistence
info "Configuring App Settings and Persistence..."
# We map the persistent storage directory (/home) for SQLite DB, ChromaDB, and Uploads.
# Web Apps on Linux mount the /home folder to persistent storage if WEBSITES_ENABLE_APP_SERVICE_STORAGE is true.
az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --settings \
    WEBSITES_PORT=3000 \
    WEBSITES_ENABLE_APP_SERVICE_STORAGE=true \
    DATABASE_URL="sqlite:////home/voiceclaw.db" \
    CHROMA_PERSIST_DIR="/home/chroma_db" \
    UPLOAD_DIR="/home/uploads" \
    NODE_ENV=production \
    BACKEND_URL="http://127.0.0.1:8000" \
    PORT=3000 \
    --output none

# Prompt for API Keys (if not set in current shell environment)
if [ -z "$GEMINI_API_KEY" ]; then
    read -p "Enter GEMINI_API_KEY (Leave empty to configure later in Azure Portal): " USER_GEMINI_KEY
    if [ ! -z "$USER_GEMINI_KEY" ]; then
        az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --settings GEMINI_API_KEY="$USER_GEMINI_KEY" --output none
    fi
else
    az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --settings GEMINI_API_KEY="$GEMINI_API_KEY" --output none
fi

if [ -z "$SARVAM_API_KEY" ]; then
    read -p "Enter SARVAM_API_KEY (Leave empty to configure later in Azure Portal): " USER_SARVAM_KEY
    if [ ! -z "$USER_SARVAM_KEY" ]; then
        az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --settings SARVAM_API_KEY="$USER_SARVAM_KEY" --output none
    fi
else
    az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --settings SARVAM_API_KEY="$SARVAM_API_KEY" --output none
fi

if [ -z "$FIRECRAWL_API_KEY" ]; then
    read -p "Enter FIRECRAWL_API_KEY (Leave empty to configure later in Azure Portal): " USER_FIRECRAWL_KEY
    if [ ! -z "$USER_FIRECRAWL_KEY" ]; then
        az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --settings FIRECRAWL_API_KEY="$USER_FIRECRAWL_KEY" --output none
    fi
else
    az webapp config appsettings set --resource-group "$RESOURCE_GROUP" --name "$WEB_APP_NAME" --settings FIRECRAWL_API_KEY="$FIRECRAWL_API_KEY" --output none
fi

# 9. Finished
WEB_APP_URL="https://$(az webapp show --name "$WEB_APP_NAME" --resource-group "$RESOURCE_GROUP" --query defaultHostName --output tsv)"
info "Deployment complete!"
info "Your app is available at: $WEB_APP_URL"
info "Note: It might take a few minutes for the container to start up and download model embeddings on its very first run."
