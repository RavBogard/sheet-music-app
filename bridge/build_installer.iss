#define MyAppName "CentralReform Bridge"
#define MyAppVersion "2.4.0"
#define MyAppPublisher "CentralReform"
#define MyAppExeName "CentralReform Bridge.exe"

[Setup]
AppId={{C6D21FDB-8F12-4C10-AAC6-7ECB2AD3C649}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\CentralReform\Bridge
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=dist
OutputBaseFilename=CentralReform_Bridge_Setup
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "Run CentralReform Bridge automatically when Windows starts"; GroupDescription: "Auto-Start Options:"; Flags: unchecked

[Files]
Source: "release\CentralReform Bridge-win32-x64\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "release\CentralReform Bridge-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Note: Don't use "Flags: ignoreversion" on any shared system files

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
; The startup task ensures it boots silently into the tray when Windows boots
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
var
  ProgressPage: TOutputProgressWizardPage;

procedure TerminateOldBridge;
var
  ResultCode: Integer;
begin
  // Force quit any running instances of the old headless terminal bridge (if open)
  Exec('cmd.exe', '/c taskkill /F /IM "CentralReform-Bridge.exe" /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Force quit any instances of the new bridge if they are reinstalling/upgrading
  Exec('cmd.exe', '/c taskkill /F /IM "CentralReform Bridge.exe" /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // If they previously installed the bridge as a background service via the npm package `node-windows`, 
  // that service process needs to be violently terminated so it stops binding port 9000
  Exec('cmd.exe', '/c net stop "CentralReformBridge.exe"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('cmd.exe', '/c sc delete "CentralReformBridge.exe"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  // Just in case the service script was named differently locally
  Exec('cmd.exe', '/c sc delete "centralreformbridge.exe"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    TerminateOldBridge;
  end;
end;
