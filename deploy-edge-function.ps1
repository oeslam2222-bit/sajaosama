# Captain Ezz - Edge Function Deployment Script (PowerShell)
# This script deploys the api-proxy Edge Function to Supabase

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectId,
    
    [Parameter(Mandatory=$true)]
    [string]$ServiceRoleKey
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Captain Ezz - Edge Function Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deploying api-proxy Edge Function..." -ForegroundColor Yellow

# Deploy the Edge Function
$env:SUPABASE_SERVICE_ROLE_KEY = $ServiceRoleKey
npx supabase functions deploy api-proxy --project-ref $ProjectId

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Deployment Successful!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "1. Run the SQL schema in Supabase SQL Editor" -ForegroundColor White
    Write-Host "2. Update your .env with Supabase credentials" -ForegroundColor White
    Write-Host "3. Test the application with: npm run dev" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Deployment failed. Please check your credentials." -ForegroundColor Red
    Write-Host ""
}

Read-Host "Press Enter to exit"
