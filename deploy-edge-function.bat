@echo off
chcp 65001 >nul
echo ==========================================
echo   Captain Ezz - Edge Function Deployment
echo ==========================================
echo.

set /p PROJECT_ID="Enter your Supabase Project ID: "
set /p SERVICE_ROLE_KEY="Enter your Service Role Key: "

echo.
echo Deploying api-proxy Edge Function...

npx supabase functions deploy api-proxy --project-ref %PROJECT_ID% --env "SUPABASE_SERVICE_ROLE_KEY=%SERVICE_ROLE_KEY%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================
    echo   Deployment Successful!
    echo ==========================================
    echo.
    echo Next steps:
    echo 1. Run the SQL schema in Supabase SQL Editor
    echo 2. Update your .env with Supabase credentials
    echo 3. Test the application
    echo.
) else (
    echo.
    echo Deployment failed. Please check your credentials.
    echo.
)

pause
