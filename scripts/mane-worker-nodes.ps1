[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateCount(1, 8)]
    [ValidatePattern('^[A-Za-z0-9_][A-Za-z0-9_.@-]*$')]
    [string[]]$Nodes,

    [switch]$Copy
)

$ErrorActionPreference = 'Stop'
$ssh = (Get-Command ssh -CommandType Application).Source

$entries = @(
    foreach ($target in $Nodes) {
        $response = & $ssh $target 'bash ~/mane-auth/scripts/mane-android-auth.sh worker-node'
        if ($LASTEXITCODE -ne 0) {
            throw "Could not get Worker configuration from $target (SSH exit $LASTEXITCODE)."
        }

        $node = ($response -join "`n") | ConvertFrom-Json
        $origin = $null
        if ($node.id -cnotmatch '^[A-Za-z0-9_-]{1,64}$' -or
            $node.scyllaHostID -cnotmatch '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' -or
            -not [uri]::TryCreate($node.origin, [UriKind]::Absolute, [ref]$origin) -or
            $origin.Scheme -ne 'https' -or $origin.Authority -eq '' -or
            $node.origin -cne "https://$($origin.Authority)") {
            throw "Invalid Worker configuration from $target."
        }

        [pscustomobject]@{
            id = $node.id
            origin = $node.origin
            scyllaHostID = $node.scyllaHostID
        }
    }
)

foreach ($property in 'id', 'origin', 'scyllaHostID') {
    if (@($entries | Group-Object -Property $property -CaseSensitive | Where-Object Count -gt 1).Count -gt 0) {
        throw "Duplicate ${property}. Check the node configuration and SSH destinations."
    }
}

$json = ConvertTo-Json -InputObject $entries -Compress
if ($Copy) {
    Set-Clipboard -Value $json
}
$json
