!macro customInit
  ; Stop and remove old bridge if it was running as a service
  nsExec::ExecToLog 'net stop CentralReformBridge'
  nsExec::ExecToLog 'sc delete CentralReformBridge'
  
  ; Also try the lowercase version just in case
  nsExec::ExecToLog 'net stop centralreformbridge'
  nsExec::ExecToLog 'sc delete centralreformbridge'

  ; Kill any old Node/pkg processes
  nsExec::ExecToLog 'taskkill /F /IM "CentralReform-Bridge.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "CentralReformBridge.exe" /T'
!macroend
