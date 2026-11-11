@echo off
:: ============================================================
:: DownloadForge Companion — install.bat
:: ObsidianLabs | p4inz
::
:: Builds and registers the native messaging host on Windows.
:: Usage: install.bat YOUR_EXTENSION_ID
:: ============================================================

setlocal enabledelayedexpansion

set EXTENSION_ID=%1
set HOST_NAME=com.obsidianlabs.downloadforge
set SCRIPT_DIR=%~dp0
set BINARY_NAME=downloadforge-companion.exe

if "%EXTENSION_ID%"=="" (
  echo Usage: install.bat YOUR_CHROME_EXTENSION_ID
  echo.
  echo Find your extension ID at chrome://extensions after loading unpacked.
  pause
  exit /b 1
)

echo DownloadForge Companion Installer
echo ObsidianLabs ^| p4inz
echo ==================================
echo.

:: Build binary
echo ^-^> Building companion binary...
cd /d "%SCRIPT_DIR%"
go build -o "%BINARY_NAME%" .
if errorlevel 1 (
  echo X Build failed. Make sure Go is installed from https://go.dev
  pause
  exit /b 1
)
echo + Binary built: %SCRIPT_DIR%%BINARY_NAME%

:: Write manifest JSON
set MANIFEST_PATH=%TEMP%\%HOST_NAME%.json
set BINARY_PATH=%SCRIPT_DIR%%BINARY_NAME%

(
  echo {
  echo   "name": "%HOST_NAME%",
  echo   "description": "DownloadForge native companion app by ObsidianLabs",
  echo   "path": "%BINARY_PATH:\=\\%",
  echo   "type": "stdio",
  echo   "allowed_origins": [
  echo     "chrome-extension://%EXTENSION_ID%/"
  echo   ]
  echo }
) > "%MANIFEST_PATH%"

:: Register in Windows registry
reg add "HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f

if errorlevel 1 (
  echo X Registry write failed. Try running as Administrator.
  pause
  exit /b 1
)

echo + Registry entry created
echo.
echo + Installation complete!
echo.
echo   Extension ID : %EXTENSION_ID%
echo   Binary       : %BINARY_PATH%
echo   Manifest     : %MANIFEST_PATH%
echo.
echo Open the DownloadForge dashboard -^> Desktop App tab to verify the connection.
pause
