$ErrorActionPreference = 'Stop'

$secureWebhook = Read-Host 'Pega la URL del webhook (se mostrara oculta)' -AsSecureString
try {
  $plainWebhook = [System.Net.NetworkCredential]::new('', $secureWebhook).Password
  $env:DISCORD_WEBHOOK_URL = $plainWebhook
  $env:DISCORD_TEST_CONFIRM = 'YES'
  & node "$PSScriptRoot\test-discord.ts" --send
  if ($LASTEXITCODE -ne 0) { throw "La prueba termino con codigo $LASTEXITCODE" }
} finally {
  Remove-Item Env:DISCORD_WEBHOOK_URL -ErrorAction SilentlyContinue
  Remove-Item Env:DISCORD_TEST_CONFIRM -ErrorAction SilentlyContinue
  $plainWebhook = $null
  $secureWebhook = $null
}
