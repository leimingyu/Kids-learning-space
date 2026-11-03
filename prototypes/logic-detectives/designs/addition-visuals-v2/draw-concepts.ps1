Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$outDir = $PSScriptRoot
$colors = @{
  paper='#FFFEFA'; canvas='#F5F1E7'; ink='#263C4A'; muted='#73818A'; line='#DBE0DF';
  blue='#236BC0'; blueWash='#E6F1FF'; pink='#BC397D'; pinkWash='#FCE8F2'; purple='#7848AE'; purpleWash='#F0E7FC'; quiet='#F4F3EF'
}
function C($name) { if($colors.ContainsKey($name)){ [System.Drawing.ColorTranslator]::FromHtml($colors[$name]) } else { [System.Drawing.ColorTranslator]::FromHtml($name) } }
function Brush($name) { [System.Drawing.SolidBrush]::new((C $name)) }
function Font($size,$bold=$false) { [System.Drawing.Font]::new('Segoe UI',[single]$size, $(if($bold){[System.Drawing.FontStyle]::Bold}else{[System.Drawing.FontStyle]::Regular}),[System.Drawing.GraphicsUnit]::Pixel) }
function Text($s,$x,$y,$size=28,$color='ink',$bold=$false) {
  $b=Brush $color; $f=Font $size $bold; $script:g.DrawString([string]$s,$f,$b,[single]$x,[single]$y); $b.Dispose(); $f.Dispose()
}
function Center($s,$x,$y,$w,$h,$size=28,$color='ink',$bold=$false) {
  $b=Brush $color; $f=Font $size $bold; $format=[System.Drawing.StringFormat]::new(); $format.Alignment='Center'; $format.LineAlignment='Center'
  $script:g.DrawString([string]$s,$f,$b,[System.Drawing.RectangleF]::new($x,$y,$w,$h),$format); $b.Dispose();$f.Dispose();$format.Dispose()
}
function Round($x,$y,$w,$h,$fill='paper',$stroke='line',$radius=20,$thick=2) {
  $p=[System.Drawing.Drawing2D.GraphicsPath]::new(); $d=$radius*2
  $p.AddArc($x,$y,$d,$d,180,90);$p.AddArc(($x+$w-$d),$y,$d,$d,270,90);$p.AddArc(($x+$w-$d),($y+$h-$d),$d,$d,0,90);$p.AddArc($x,($y+$h-$d),$d,$d,90,90);$p.CloseFigure()
  $b=Brush $fill; $script:g.FillPath($b,$p);$b.Dispose()
  if($thick -gt 0){$pen=[System.Drawing.Pen]::new((C $stroke),[single]$thick);$script:g.DrawPath($pen,$p);$pen.Dispose()};$p.Dispose()
}
function Line($x1,$y1,$x2,$y2,$color='line',$width=3) {
  $p=[System.Drawing.Pen]::new((C $color),[single]$width);$p.StartCap='Round';$p.EndCap='Round';$script:g.DrawLine($p,[single]$x1,[single]$y1,[single]$x2,[single]$y2);$p.Dispose()
}
function Arrow($x1,$y1,$x2,$y2,$color,$width=5,$head=12) {
  Line $x1 $y1 $x2 $y2 $color $width
  $angle=[Math]::Atan2(($y2-$y1),($x2-$x1)); $b=Brush $color
  $pts=[System.Drawing.PointF[]]@([System.Drawing.PointF]::new($x2,$y2),[System.Drawing.PointF]::new(($x2-$head*[Math]::Cos($angle)+$head*.65*[Math]::Sin($angle)),($y2-$head*[Math]::Sin($angle)-$head*.65*[Math]::Cos($angle))),[System.Drawing.PointF]::new(($x2-$head*[Math]::Cos($angle)-$head*.65*[Math]::Sin($angle)),($y2-$head*[Math]::Sin($angle)+$head*.65*[Math]::Cos($angle))))
  $script:g.FillPolygon($b,$pts);$b.Dispose()
}
function Dots($x,$y,$count,$cols,$color,$diam=16,$spacing=24) {
  $b=Brush $color
  for($i=0;$i -lt $count;$i++){ $script:g.FillEllipse($b,[single]($x+($i%$cols)*$spacing),[single]($y+[Math]::Floor($i/$cols)*$spacing),[single]$diam,[single]$diam) };$b.Dispose()
}
function NewPicture($w,$h) {
  $script:pic=[System.Drawing.Bitmap]::new($w,$h);$script:g=[System.Drawing.Graphics]::FromImage($script:pic);$script:g.SmoothingMode='AntiAlias';$script:g.TextRenderingHint='AntiAliasGridFit';$script:g.Clear((C 'canvas'))
}
function SavePicture($name) {
  $script:pic.Save((Join-Path $outDir $name),[System.Drawing.Imaging.ImageFormat]::Png);$script:g.Dispose();$script:pic.Dispose()
}
function Header($tag,$title,$sub,$w) {
  Text $tag 64 34 22 'muted' $true
  Round 48 90 ($w-96) 950 'paper' 'line' 28
  Text 'LOGIC DETECTIVES  /  NUMBER MACHINE' 90 124 20 'muted' $true
  Text $title 90 169 48 'ink' $true
  Text $sub 92 237 28 'ink'
}
function Key($x,$y,$compact=$false) {
  $size=if($compact){20}else{25};$step=if($compact){135}else{180}
  Text 'Start' $x $y $size 'blue' $true; Text '+' ($x+$step-43) $y $size 'ink' $true
  Text 'Add' ($x+$step) $y $size 'pink' $true;Text '=' ($x+2*$step-43) $y $size 'ink' $true;Text 'Sum' ($x+2*$step) $y $size 'purple' $true
}
function Board($x,$y,$cw=190,$ch=140,$gap=28,$stage=2,$mode='cross',$small=$false) {
  $values=@(@('+','3','4','7'),@('9','12','13','16'),@('6','9','?','13'))
  for($r=0;$r -lt 3;$r++){for($c=0;$c -lt 4;$c++){
    $cx=$x+$c*($cw+$gap);$cy=$y+$r*($ch+$gap);$fill='quiet';$edge='line';$ink='muted';$weight=2
    if($r -eq 2 -and $c -le 2){$fill='blueWash'}
    if($c -eq 2 -and $stage -ge 1){$fill='pinkWash'}
    if($r -eq 2 -and $c -eq 0){$edge='blue';$ink='blue';$weight=3}
    if($r -eq 0 -and $c -eq 2 -and $stage -ge 1){$edge='pink';$ink='pink';$weight=3}
    if($r -eq 2 -and $c -eq 2){$fill='purpleWash';$edge='purple';$ink='purple';$weight=3}
    Round $cx $cy $cw $ch $fill $edge $(if($small){12}else{19}) $weight
    $textSize=if($small){33}else{49}
    if($r -eq 2 -and $c -eq 2 -and $mode -eq 'groups'){
      Center '?' $cx ($cy+2) $cw 66 48 'purple' $true
      Dots ($cx+20) ($cy+88) 6 3 'blue' 16 23
      Center '+' ($cx+88) ($cy+90) 24 35 28 'ink' $true
      Dots ($cx+122) ($cy+88) 4 2 'pink' 16 23
    } elseif($r -eq 2 -and $c -eq 2 -and $mode -eq 'travel' -and $stage -lt 2) {
      Round ($cx+8) ($cy+8) $(if($stage -eq 0){$cw-16}else{($cw-23)/2}) 35 'blue' 'blue' 8 0
      Center '6' ($cx+8) ($cy+7) $(if($stage -eq 0){$cw-16}else{($cw-23)/2}) 35 24 'paper' $true
      if($stage -ge 1){Round ($cx+($cw+7)/2) ($cy+8) (($cw-23)/2) 35 'pink' 'pink' 8 0;Center '+4' ($cx+($cw+7)/2) ($cy+7) (($cw-23)/2) 35 24 'paper' $true}
      Center '?' $cx ($cy+43) $cw ($ch-43) 35 'purple' $true
    } elseif($mode -eq 'groups' -and (($r -eq 2 -and $c -eq 0) -or ($r -eq 0 -and $c -eq 2))) {
      # Source quantities are drawn once below, with their matching counters.
    } else {
      Center $values[$r][$c] $cx $cy $cw $ch $textSize $ink $true
      if($r -eq 2 -and $c -eq 2 -and $mode -eq 'cross'){Center '+' ($cx+10) ($cy+6) 32 32 27 'purple' $true}
    }
    if($mode -eq 'groups' -and $r -eq 2 -and $c -eq 0){Center '6' $cx ($cy+2) $cw 78 49 'blue' $true; Dots ($cx+64) ($cy+99) 6 3 'blue' 15 23}
    if($mode -eq 'groups' -and $r -eq 0 -and $c -eq 2){Center '4' $cx ($cy+2) $cw 78 49 'pink' $true; Dots ($cx+76) ($cy+99) 4 2 'pink' 15 23}
  }}
  $head=if($small){7}else{11};$width=if($small){4}else{6}
  for($c=0;$c -lt 2;$c++){Arrow ($x+$c*($cw+$gap)+$cw+4) ($y+2*($ch+$gap)+$ch/2) ($x+($c+1)*($cw+$gap)-4) ($y+2*($ch+$gap)+$ch/2) 'blue' $width $head}
  if($stage -ge 1){for($r=0;$r -lt 2;$r++){Arrow ($x+2*($cw+$gap)+$cw/2) ($y+$r*($ch+$gap)+$ch+4) ($x+2*($cw+$gap)+$cw/2) ($y+($r+1)*($ch+$gap)-4) 'pink' $width $head}}
}

NewPicture 1600 1100
Header 'DESIGN A  /  EVERYDAY PLAY' 'Cross and add' 'Follow blue across. Follow pink down.' 1600
Key 1030 175
Board 368 340 190 140 30 2 'cross'
Text 'Start' 252 746 25 'blue' $true
Center 'Add' 808 289 190 40 25 'pink' $true
Center 'Sum' 808 830 190 40 25 'purple' $true
Round 1145 869 295 70 'purple' 'purple' 18 0
Center 'Check answer' 1145 869 295 70 26 'paper' $true
Text 'Only the connected paths light up. The answer stays ?.' 92 971 25 'muted'
SavePicture 'cross-and-add.png'

NewPicture 1920 1050
Text 'DESIGN B  /  ANIMATION STORYBOARD' 64 34 22 'muted' $true
Text 'Numbers travel and join' 64 85 49 'ink' $true
Text 'The child sees one step at a time.' 67 158 28 'ink'
Key 1295 100
$titles=@('1   Start across','2   Add down','3   Your turn')
$captions=@('The blue 6 arrives first.','The pink +4 joins it.','Find the sum. Type it here.')
for($frame=0;$frame -lt 3;$frame++){
  $fx=60+$frame*615
  Round $fx 258 570 707 'paper' 'line' 25
  Text $titles[$frame] ($fx+30) 293 31 'ink' $true
  Board ($fx+38) 378 106 96 19 $frame 'travel' $true
  Center $captions[$frame] ($fx+24) 762 522 64 24 'ink'
  if($frame -lt 2){Round ($fx+305) 860 226 56 'quiet' 'line' 12;Center 'Next movement' ($fx+305) 860 226 56 21 'ink' $true}
  else{Round ($fx+305) 860 226 56 'purple' 'purple' 12 0;Center 'Your turn' ($fx+305) 860 226 56 21 'paper' $true}
}
SavePicture 'travel-and-join.png'

NewPicture 1600 1150
Header 'DESIGN C  /  OPTIONAL HANDS-ON VIEW' 'Two groups join' 'Bring both groups to the purple box.' 1600
Key 1030 175
Board 368 323 190 170 30 2 'groups'
Text 'Start' 252 806 25 'blue' $true
Center 'Add' 808 276 190 40 25 'pink' $true
Center 'Sum' 808 924 190 40 25 'purple' $true
Text 'Only the given 6 and 4 become counters. No total is filled in.' 92 990 25 'muted'
SavePicture 'groups-join.png'
