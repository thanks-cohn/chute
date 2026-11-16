# Read-only: no process stops, profile edits, log cleanup, or automatic repair.
$ErrorActionPreference = 'Stop'
$OperatingSystem = Get-CimInstance Win32_OperatingSystem
$Volume = Get-Volume -DriveLetter C
$Processes = @(Get-Process -Name chrome,Chute,Chute-NativeHost -ErrorAction SilentlyContinue | ForEach-Object {
    @{ name=$_.ProcessName; pid=$_.Id; working_set_bytes=$_.WorkingSet64 }
})
$Events = @(Get-WinEvent -FilterHashtable @{ LogName='Application'; StartTime=(Get-Date).AddHours(-24); Level=1,2 } -MaxEvents 40 -ErrorAction SilentlyContinue | ForEach-Object {
    # Do not export Message: it may contain private paths and command lines.
    @{ utc=$_.TimeCreated.ToUniversalTime().ToString('o'); event_id=$_.Id; provider=$_.ProviderName }
})
@{
    utc=(Get-Date).ToUniversalTime().ToString('o')
    c_free_bytes=$Volume.SizeRemaining; c_size_bytes=$Volume.Size
    memory_total_bytes=1024L*$OperatingSystem.TotalVisibleMemorySize
    memory_available_bytes=1024L*$OperatingSystem.FreePhysicalMemory
    virtual_total_bytes=1024L*$OperatingSystem.TotalVirtualMemorySize
    virtual_available_bytes=1024L*$OperatingSystem.FreeVirtualMemory
    processes=$Processes; application_errors=$Events
    scope='Read-only snapshot; no crash cause inferred. Chrome extension state needs Chrome inspection.'
} | ConvertTo-Json -Depth 6
