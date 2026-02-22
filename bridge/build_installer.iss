#define MyAppName "CentralReform Bridge"
#define MyAppVersion "3.0.0"
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
OutputBaseFilename=CentralReform_Bridge_Setup_v{#MyAppVersion}
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
; Allow upgrading over existing installation without uninstall prompt
UsePreviousAppDir=yes
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "Run CentralReform Bridge automatically when Windows starts"; GroupDescription: "Auto-Start Options:"; Flags: checked

[Files]
; Main application files
Source: "release\win-unpacked\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up generated certs on uninstall (but leave config/keys for reinstall)
Type: filesandordirs; Name: "{app}\certs"

[Code]
procedure TerminateOldBridge;
var
  ResultCode: Integer;
begin
  // === Kill ALL known bridge processes ===

  // v3.0+ Electron bridge (current)
  Exec('cmd.exe', '/c taskkill /F /IM "CentralReform Bridge.exe" /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // v2.x headless Node.js bridge (pkg-compiled exe)
  Exec('cmd.exe', '/c taskkill /F /IM "CentralReform-Bridge.exe" /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // v1.x / early dev variants
  Exec('cmd.exe', '/c taskkill /F /IM "CentralReformBridge.exe" /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // Kill any stray Node.js processes that might be the bridge running via npm
  Exec('cmd.exe', '/c wmic process where "name=''node.exe'' and commandline like ''%%bridge%%''" call terminate', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // === Remove old Windows services (v1.x used node-windows) ===
  Exec('cmd.exe', '/c net stop "CentralReformBridge.exe" 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('cmd.exe', '/c sc delete "CentralReformBridge.exe" 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('cmd.exe', '/c net stop "centralreformbridge.exe" 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('cmd.exe', '/c sc delete "centralreformbridge.exe" 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  // === Remove old startup shortcuts that might point to dead exes ===
  DeleteFile(ExpandConstant('{userstartup}\CentralReform-Bridge.lnk'));
  DeleteFile(ExpandConstant('{commonstartup}\CentralReform-Bridge.lnk'));

  // Give processes a moment to fully terminate and release file locks
  Sleep(2000);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    TerminateOldBridge;
  end;
end;

// Preserve user config files during uninstall
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if FileExists(ExpandConstant('{app}\service-account-key.json')) or FileExists(ExpandConstant('{app}\bridge-config.json')) then
    begin
      MsgBox('Your Firebase credentials and bridge configuration were preserved in:' + #13#10 + ExpandConstant('{app}') + #13#10#13#10 + 'You can safely delete this folder if you will not be reinstalling.', mbInformation, MB_OK);
    end;
  end;
end;
