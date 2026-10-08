#define MyAppName "OnTrack AI Phone"
#define MyAppVersion "1.0.0-poc"
[Setup]
AppId={{8D32E941-063D-4EAB-BB71-2C5A7208C92F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\OnTrack\AI Phone
DefaultGroupName={#MyAppName}
OutputDir=installer
OutputBaseFilename=OnTrackAIPhone-Windows-v1.0.0-poc-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
[Files]
Source: "dist\OnTrackAIPhone.exe"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\OnTrack AI Phone"; Filename: "{app}\OnTrackAIPhone.exe"
Name: "{autodesktop}\OnTrack AI Phone"; Filename: "{app}\OnTrackAIPhone.exe"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"; GroupDescription: "Additional icons:"
[Run]
Filename: "{app}\OnTrackAIPhone.exe"; Description: "Run OnTrack AI Phone"; Flags: nowait postinstall skipifsilent
