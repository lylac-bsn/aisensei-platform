#!/bin/bash

# Deployment script for Real-time Gaming Guide
# This script helps deploy both frontend and backend

set -e

echo "🚀 Real-time Gaming Guide Deployment Script"
echo "=========================================="
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud SDK not found. Install it from: https://cloud.google.com/sdk"
    exit 1
fi

# Get project ID from .firebaserc
PROJECT_ID=$(grep -o '"default": "[^"]*"' .firebaserc | cut -d'"' -f4)

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "your-project-id" ]; then
    echo "❌ Please update .firebaserc with your Firebase project ID"
    exit 1
fi

echo "📋 Project ID: $PROJECT_ID"
echo ""

# Ask what to deploy
echo "What would you like to deploy?"
echo "1) Frontend only (Firebase Hosting)"
echo "2) Backend only (Cloud Run)"
echo "3) Both"
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo ""
        echo "🏗️  Building frontend..."
        npm run build
        
        echo ""
        echo "🔥 Deploying to Firebase Hosting..."
        firebase deploy --only hosting
        
        echo ""
        echo "✅ Frontend deployed successfully!"
        echo "🌐 Your app is live at: https://$PROJECT_ID.web.app"
        ;;
    2)
        echo ""
        echo "🐳 Building and deploying backend to Cloud Run..."
        
        # Check if Cloud Build is available
        if [ -f "cloudbuild.yaml" ]; then
            echo "Using Cloud Build..."
            gcloud builds submit --config cloudbuild.yaml --project $PROJECT_ID
        else
            echo "Building Docker image..."
            docker build -t gcr.io/$PROJECT_ID/gemini-proxy .
            
            echo "Pushing to Container Registry..."
            docker push gcr.io/$PROJECT_ID/gemini-proxy
            
            echo "Deploying to Cloud Run..."
            gcloud run deploy gemini-proxy \
                --image gcr.io/$PROJECT_ID/gemini-proxy \
                --region us-central1 \
                --platform managed \
                --allow-unauthenticated \
                --port 8080 \
                --memory 512Mi \
                --cpu 1 \
                --timeout 3600 \
                --project $PROJECT_ID
        fi
        
        echo ""
        echo "✅ Backend deployed successfully!"
        SERVICE_URL=$(gcloud run services describe gemini-proxy --region us-central1 --format 'value(status.url)' --project $PROJECT_ID)
        echo "🔗 Backend URL: $SERVICE_URL"
        echo "⚠️  Remember to enable session affinity in Cloud Run console for WebSocket support"
        ;;
    3)
        echo ""
        echo "🏗️  Building frontend..."
        npm run build
        
        echo ""
        echo "🔥 Deploying frontend to Firebase Hosting..."
        firebase deploy --only hosting
        
        echo ""
        echo "🐳 Building and deploying backend to Cloud Run..."
        
        if [ -f "cloudbuild.yaml" ]; then
            gcloud builds submit --config cloudbuild.yaml --project $PROJECT_ID
        else
            docker build -t gcr.io/$PROJECT_ID/gemini-proxy .
            docker push gcr.io/$PROJECT_ID/gemini-proxy
            gcloud run deploy gemini-proxy \
                --image gcr.io/$PROJECT_ID/gemini-proxy \
                --region us-central1 \
                --platform managed \
                --allow-unauthenticated \
                --port 8080 \
                --memory 512Mi \
                --cpu 1 \
                --timeout 3600 \
                --project $PROJECT_ID
        fi
        
        echo ""
        echo "✅ Deployment complete!"
        SERVICE_URL=$(gcloud run services describe gemini-proxy --region us-central1 --format 'value(status.url)' --project $PROJECT_ID)
        echo "🌐 Frontend: https://$PROJECT_ID.web.app"
        echo "🔗 Backend: $SERVICE_URL"
        echo ""
        echo "⚠️  Next steps:"
        echo "1. Enable session affinity in Cloud Run console"
        echo "2. Update frontend proxy URL to: wss://$(echo $SERVICE_URL | sed 's|https://||')"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✨ Done!"
