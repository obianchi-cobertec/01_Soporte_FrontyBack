# eval-classifier.ps1
# Evalua la clasificacion IA llamando a la API REST del backend en http://localhost:3001
# Uso: .\eval-classifier.ps1

$BASE_URL   = "http://localhost:3001"
$EMAIL      = "formacion@cobertec.es"
$PASSWORD   = "Cobertec2024!"
$COMPANY_ID = "379"

# --- Autenticacion -------------------------------------------------------

Write-Host "Autenticando..." -ForegroundColor Cyan

try {
    $loginBody = @{ grant_type = "password"; email = $EMAIL; password = $PASSWORD } | ConvertTo-Json
    $loginResp = Invoke-RestMethod -Uri "$BASE_URL/api/auth/token" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody
    $token = $loginResp.access_token
} catch {
    Write-Host "ERROR en login: $_" -ForegroundColor Red
    exit 1
}

try {
    $selectBody = @{ company_id = $COMPANY_ID } | ConvertTo-Json
    $selectResp = Invoke-RestMethod -Uri "$BASE_URL/api/auth/select" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{ Authorization = "Bearer $token" } `
        -Body $selectBody
    $token = $selectResp.access_token
} catch {
    Write-Host "ERROR al seleccionar empresa: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Autenticado correctamente. Iniciando evaluacion...`n" -ForegroundColor Green

# --- Casos de prueba -----------------------------------------------------

$cases = @(
    @{ id='13204'; expectedNature='incidencia_error'; expectedDomain='sesiones_conectividad'; description='Este es un problema muy frecuente, se queda una sesion colgada y despues alguien no puede entrar al llegar al limite de usuarios. La sesion colgada suele venir del equipo de Sandra y parece ser que se produce al intentar imprimir una OT. Se le cuelga siempre cuando se genera el informe de OT.' }
    @{ id='13202'; expectedNature='incidencia_error'; expectedDomain='ventas_facturacion'; description='Al dar alta un cliente y grabarlo me sale un mensaje de error. Tampoco veo la pantalla completa de la ficha cliente.' }
    @{ id='13200'; expectedNature='peticion_cambio_mejora'; expectedDomain='informes_documentos'; description='Haciendo seguimiento a su comentario, queria ver que opciones tenemos para crear las plantillas de facturas, pedidos, etc. Entiendo que si hay variaciones importantes teneis que hacer una valoracion, pero con las plantillas base con cambios menores no es necesario.' }
    @{ id='13199'; expectedNature='configuracion'; expectedDomain='app_fichajes'; description='Habra que dar de baja a dos usuarios en la aplicacion de fichajes: 17747573Z Daniel Baigorri Asin y 25357070F Jorge Juez Tena.' }
    @{ id='13198'; expectedNature='incidencia_error'; expectedDomain='gmao'; description='Tenemos un problema con el activo 1249. Fue de los que probamos para la renovacion y no conseguimos que aparezcan las revisiones desde noviembre 2024 a noviembre 2025. Podeis revisar y corregir?' }
    @{ id='13197'; expectedNature='consulta_funcional'; expectedDomain='ventas_facturacion'; description='Varias dudas: cuando realizo una factura no coge el precio de los articulos a los que he puesto una tarifa diferente de la que viene por defecto. Por otro lado cuando tenemos articulos asociados, deberia aniadirse a la factura? Tambien sale un error si intento cambiar el precio de un articulo asociado dentro del articulo madre.' }
    @{ id='13196'; expectedNature='usuario_acceso'; expectedDomain='movilsat'; description='David Rodriguez Bouzon tiene usuario creado pero no le permite entrar, dice que son incorrectos. Con DRB y 8081 no le permite acceder a Movilsat.' }
    @{ id='13195'; expectedNature='consulta_funcional'; expectedDomain='gmao'; description='Me gustaria conocer si es posible la asignacion de herramientas a un empleado y poder llevar el control de las mismas: valoracion, cuales tiene en uso y cuales se dan de baja por averia.' }
    @{ id='13194'; expectedNature='incidencia_error'; expectedDomain='app_fichajes'; description='Hemos activado el GPS obligatorio para los fichajes en la aplicacion, pero hay algunos companeros que no han podido fichar aun con el GPS activado en las tablets. Aparece un error que no permite el acceso a la ubicacion y no da la opcion de fichar.' }
    @{ id='13192'; expectedNature='incidencia_error'; expectedDomain='sesiones_conectividad'; description='A este usuario Expertis le echa cada vez que esta un rato sin utilizarlo. A los demas no nos pasa lo mismo.' }
    @{ id='13189'; expectedNature='incidencia_error'; expectedDomain='movilsat'; description='Con esta aplicacion no aparecen articulos creados: Puesta en marcha y Ampliacion de garantia. Por que?' }
    @{ id='13188'; expectedNature='incidencia_error'; expectedDomain='movilsat'; description='Ayer empezaron dos tecnicos a utilizar la app Movilsat 8.2. Esta manana se quedaba colgada y han tenido que desinstalar y volver a instalar. Esta tarde se ha vuelto a quedar pillada.' }
    @{ id='13183'; expectedNature='incidencia_error'; expectedDomain='gmao'; description='Los datos en el campo Trabajo Realizado en las OTs se solapan y es dificil entender los trabajos realizados en dias diferentes. Cuando la OT esta en estado no manipulable el texto se ve bien, pero al pasar a estado manipulable los datos se solapan.' }
    @{ id='13182'; expectedNature='peticion_cambio_mejora'; expectedDomain='informes_documentos'; description='En las ordenes de trabajo que firman los clientes me gustaria mostrar el numero de orden.' }
    @{ id='13181'; expectedNature='incidencia_error'; expectedDomain='ecommerce_web'; description='El pedido de Shopware 50342 no nos esta pasando al ERP. Creo que puede ser porque hay un suplemento de pago que no tiene articulo detras. En el log de eventos aparece algo. Por favor intentad corregirlo hoy.' }
    @{ id='13180'; expectedNature='peticion_cambio_mejora'; expectedDomain='compras'; description='Me gustaria aniadir la columna numero de albaran del proveedor en la pantalla de Estadistica de Albaranes de Compra Detallados.' }
    @{ id='13179'; expectedNature='usuario_acceso'; expectedDomain='servidor_sistemas'; description='No podemos acceder con ninguna de las cuentas a mail.cobertec.com y tampoco funciona la recuperacion de contrasena.' }
    @{ id='13177'; expectedNature='formacion_duda_uso'; expectedDomain='almacen_stocks'; description='Al hacer un traspaso entre almacenes, no da la opcion de introducir el lote. Y da error porque no se introduce el lote.' }
    @{ id='13175'; expectedNature='consulta_funcional'; expectedDomain='funcionamiento_general'; description='Hay alguna forma de bloquear las OT en un estado concreto para que no se pueda meter ningun gasto mas salvo usuarios concretos? Y se pueden bloquear los articulos para que solo unos usuarios puedan modificarlos, incluida la descripcion?' }
    @{ id='13174'; expectedNature='incidencia_error'; expectedDomain='gmao'; description='Necesito borrar 3 OT que no podemos eliminar ni con la tablet. Las OTs estan en estado TEC (Tablet en Curso) y no se pueden cambiar de estado.' }
    @{ id='13170'; expectedNature='peticion_cambio_mejora'; expectedDomain='gmao'; description='Cuando se crea una OT desde un trabajo en un Proyecto, en la Descripcion del Problema se copian automaticamente las observaciones genericas del proyecto, lo que no tiene sentido. Seria preferible que este vacio.' }
    @{ id='13169'; expectedNature='peticion_cambio_mejora'; expectedDomain='ventas_facturacion'; description='Necesitariamos un campo nuevo de texto libre en la ficha de clientes llamado Observaciones Informe. Ese texto tiene que aparecer antes de las observaciones comerciales en los informes de pedidos, albaranes y facturas de venta.' }
    @{ id='13162'; expectedNature='incidencia_error'; expectedDomain='movilsat'; description='Varias dudas con Movilsat 8: al dar a Ver en el mapa aparece el mensaje Google maps no esta instalado. En Catalogo de materiales no vemos la descripcion completa ni los precios. Ademas la aplicacion se queda bloqueada.' }
    @{ id='13159'; expectedNature='configuracion'; expectedDomain='movilsat'; description='Nos han robado la tablet. La entrada en Movilsat con su contrasena esta guardada. Rogamos lo protejan. Era de nuestro companero Jorge Escudero.' }
    @{ id='13150'; expectedNature='incidencia_error'; expectedDomain='presupuestos_proyectos'; description='A pesar de que la referencia de proveedor la hemos usado en otra linea, nos sale un error al querer introducir una linea usando la RefProveedor en presupuestos. En ofertas comerciales tambien nos pasa.' }
    @{ id='13149'; expectedNature='incidencia_error'; expectedDomain='compras'; description='Desde la pantalla de recepcion de pedidos no se abren las OT. Sale un error. Si abrimos el pedido de compra y desde el propio pedido la OT si que la abre, por tanto esta asociada.' }
    @{ id='13147'; expectedNature='incidencia_error'; expectedDomain='presupuestos_proyectos'; description='Quiero colocar en estado rechazado los presupuestos que no se van a realizar en obras. No tengo la pestana habilitada y si lo hago desde el triangulo verde para cambiar el estado me sale un error.' }
    @{ id='13143'; expectedNature='incidencia_error'; expectedDomain='gmao'; description='No veo revisiones en linea en un activo que tiene su reglamento correspondiente y esta dentro de la fecha de revision.' }
    @{ id='13139'; expectedNature='formacion_duda_uso'; expectedDomain='tarifas_catalogos'; description='Como se actualiza el precio de un articulo cuando el proveedor cambia el precio? Al hacer el albaran se modifica el ultimo precio de compra pero en mantenimiento de articulos no se modifica el precio de coste ni la tarifa de venta. Ademas cuando actualizo tarifas de venta de forma masiva el incremento no se aplica sobre la tarifa sino sobre el precio base.' }
    @{ id='13137'; expectedNature='formacion_duda_uso'; expectedDomain='compras'; description='Al hacer albaranes de compra sin pedido previo, si busco el articulo por descripcion no lo encuentro porque hay muchas descripciones similares. Como puedo buscar un articulo por codigo de proveedor o referencia de fabricante en los albaranes de compra?' }
)

# --- Ejecucion -----------------------------------------------------------

$results = @()
$totalNature = 0
$totalDomain = 0
$totalBoth   = 0
$totalTime   = 0.0
$errors      = @()
$failures    = @()

foreach ($case in $cases) {
    $sessionId = [System.Guid]::NewGuid().ToString()
    $timestamp = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

    $body = @{
        session_id   = $sessionId
        user_id      = "848"
        company_id   = $COMPANY_ID
        company_name = "HERGOPAS_sat"
        description  = $case.description
        attachments  = @()
        timestamp    = $timestamp
    } | ConvertTo-Json -Depth 5

    $start     = [DateTime]::Now
    $gotNature = $null
    $gotDomain = $null
    $gotConf   = $null
    $isError   = $false

    try {
        $resp = Invoke-RestMethod -Uri "$BASE_URL/api/intake/submit" `
            -Method POST `
            -ContentType "application/json" `
            -Headers @{ Authorization = "Bearer $token" } `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
        $elapsed = ([DateTime]::Now - $start).TotalSeconds

        $gotNature = $resp.display.nature
        $gotDomain = $resp.display.estimated_area
        $gotConf   = $resp.display.impact
    } catch {
        $elapsed = ([DateTime]::Now - $start).TotalSeconds
        $isError  = $true
        $errors  += "[{0}] {1}" -f $case.id, $_.Exception.Message
    }

    $totalTime += $elapsed

    if ($isError) {
        Write-Host ("[{0}] ERROR: {1}" -f $case.id, $errors[-1]) -ForegroundColor Red
        $results += [PSCustomObject]@{
            id             = $case.id
            status         = "ERROR"
            expectedNature = $case.expectedNature
            expectedDomain = $case.expectedDomain
            gotNature      = $null
            gotDomain      = $null
            confidence     = $null
            elapsedSeconds = [Math]::Round($elapsed, 2)
        }
        continue
    }

    $okNature = $gotNature -eq $case.expectedNature
    $okDomain = $gotDomain -eq $case.expectedDomain

    if ($okNature) { $totalNature++ }
    if ($okDomain) { $totalDomain++ }
    if ($okNature -and $okDomain) { $totalBoth++ }

    # Construir linea de output
    $natureStr = if ($okNature) { "[OK] $gotNature" } else { "[FAIL] $($case.expectedNature) -> $gotNature" }
    $domainStr = if ($okDomain) { "[OK] $gotDomain" } else { "[FAIL] $($case.expectedDomain) -> $gotDomain" }
    $line = "[{0}] nature: {1} | domain: {2} | confidence: {3}" -f $case.id, $natureStr, $domainStr, $gotConf

    if ($okNature -and $okDomain) {
        Write-Host $line -ForegroundColor Green
    } elseif ($okNature -or $okDomain) {
        Write-Host $line -ForegroundColor Yellow
    } else {
        Write-Host $line -ForegroundColor Red
    }

    if (-not $okNature -or -not $okDomain) {
        $failures += [PSCustomObject]@{
            id             = $case.id
            natureExpected = $case.expectedNature
            natureGot      = $gotNature
            natureOk       = $okNature
            domainExpected = $case.expectedDomain
            domainGot      = $gotDomain
            domainOk       = $okDomain
        }
    }

    $results += [PSCustomObject]@{
        id             = $case.id
        status         = "OK"
        expectedNature = $case.expectedNature
        expectedDomain = $case.expectedDomain
        gotNature      = $gotNature
        gotDomain      = $gotDomain
        confidence     = $gotConf
        elapsedSeconds = [Math]::Round($elapsed, 2)
    }
}

# --- Resumen -------------------------------------------------------------

$total   = $cases.Count
$avgTime = if ($total -gt 0) { [Math]::Round($totalTime / $total, 1) } else { 0 }
$pNature = [Math]::Round($totalNature / $total * 100)
$pDomain = [Math]::Round($totalDomain / $total * 100)
$pBoth   = [Math]::Round($totalBoth   / $total * 100)

Write-Host ""
Write-Host "====== RESULTADOS ======" -ForegroundColor Cyan
Write-Host "Nature correcta:  $totalNature/$total ($pNature%)"
Write-Host "Domain correcto:  $totalDomain/$total ($pDomain%)"
Write-Host "Ambos correctos:  $totalBoth/$total ($pBoth%)"
Write-Host "Tiempo medio:     $avgTime s"
Write-Host "========================" -ForegroundColor Cyan

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "ERRORES DE LLAMADA:" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host "  $e" -ForegroundColor Red }
}

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "FALLOS:" -ForegroundColor Yellow
    foreach ($f in $failures) {
        $parts = @()
        if (-not $f.natureOk) { $parts += "nature esperado: $($f.natureExpected) | obtenido: $($f.natureGot)" }
        if (-not $f.domainOk) { $parts += "domain esperado: $($f.domainExpected) | obtenido: $($f.domainGot)" }
        Write-Host ("  [{0}] {1}" -f $f.id, ($parts -join " | ")) -ForegroundColor Yellow
    }
}

# --- Guardar resultados en JSON ------------------------------------------

$fileTimestamp = [DateTime]::Now.ToString("yyyyMMdd-HHmm")
$outFile       = Join-Path $PSScriptRoot "eval-results-$fileTimestamp.json"

$output = [PSCustomObject]@{
    runAt          = [DateTime]::Now.ToString("yyyy-MM-ddTHH:mm:ss")
    totalCases     = $total
    natureCorrect  = $totalNature
    domainCorrect  = $totalDomain
    bothCorrect    = $totalBoth
    avgElapsedSecs = $avgTime
    results        = $results
    failures       = $failures
    callErrors     = $errors
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($outFile, ($output | ConvertTo-Json -Depth 10), $utf8NoBom)
Write-Host ""
Write-Host "Resultados guardados en: $outFile" -ForegroundColor Cyan
