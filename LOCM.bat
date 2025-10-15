@echo off
REM 在 %temp% 建立一個暫存的 VBScript 檔案
echo Set oShell = CreateObject("WScript.Shell") > "%temp%\temp.vbs"

REM Run cmd，切換到 D: 資料夾並執行 npm run dev，0 代表隱藏視窗，False 不等待結束
echo oShell.Run "cmd /c cd /d D:\Lab330_Optical_component_management && npm run start", 0, False >> "%temp%\temp.vbs"

REM 執行 VBScript
wscript "%temp%\temp.vbs"

REM 刪除暫存檔
del "%temp%\temp.vbs"
