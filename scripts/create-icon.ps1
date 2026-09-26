$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$bitmap = New-Object System.Drawing.Bitmap 256,256
$canvas = [System.Drawing.Graphics]::FromImage($bitmap)
$canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$canvas.Clear([System.Drawing.Color]::Transparent)
$shape = New-Object System.Drawing.Drawing2D.GraphicsPath
$shape.AddArc(10,30,72,72,180,90)
$shape.AddArc(154,30,72,72,270,90)
$shape.AddArc(154,174,72,72,0,90)
$shape.AddArc(10,174,72,72,90,90)
$shape.CloseFigure()
$background = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0,0)), ([System.Drawing.Point]::new(256,256)), ([System.Drawing.ColorTranslator]::FromHtml('#203d58')), ([System.Drawing.ColorTranslator]::FromHtml('#101e30'))
$canvas.FillPath($background,$shape)
$border = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#3a5b78')), 2
$canvas.DrawPath($border,$shape)
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#67d5ff')), 15
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$canvas.DrawLines($pen,[System.Drawing.Point[]]@([System.Drawing.Point]::new(77,108),[System.Drawing.Point]::new(44,140),[System.Drawing.Point]::new(77,172)))
$canvas.DrawLines($pen,[System.Drawing.Point[]]@([System.Drawing.Point]::new(163,108),[System.Drawing.Point]::new(196,140),[System.Drawing.Point]::new(163,172)))
$canvas.DrawLine($pen,132,101,109,179)
$red = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#ff6347'))
$badge = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#101e30'))
$canvas.FillEllipse($badge,174,14,64,64)
$canvas.FillEllipse($red,183,23,46,46)
$bitmap.Save((Join-Path $root 'media/icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
Copy-Item -LiteralPath (Join-Path $root 'media/icon.png') -Destination (Join-Path $root 'player/assets/recorder.png') -Force
foreach($resource in @($badge,$red,$pen,$border,$background,$shape,$canvas,$bitmap)) { $resource.Dispose() }
