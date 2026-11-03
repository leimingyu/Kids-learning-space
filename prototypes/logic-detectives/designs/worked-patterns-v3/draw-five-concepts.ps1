. "$PSScriptRoot/drawing.ps1"
function Page($tag,$title,$subtitle,$width=1600,$height=1040) {
  NewPicture $width $height
  Text $tag 60 30 21 'muted' $true
  Round 40 82 ($width-80) ($height-124) 'paper' 'line' 26
  Text 'LOGIC DETECTIVES / SEE THE RULE' 82 112 19 'muted' $true
  Text $title 80 162 45 'ink' $true
  Text $subtitle 83 228 26 'ink'
}
function WorkedBoard($x,$y,$cw=143,$ch=112,$gap=21,$selected=1,$small=$false,$both=$false) {
  $values=@(@('+','3','4','7'),@('9','12','13','16'),@('6','9','?','13'))
  for($r=0;$r -lt 3;$r++){for($c=0;$c -lt 4;$c++){
    $cx=$x+$c*($cw+$gap);$cy=$y+$r*($ch+$gap);$fill='quiet';$edge='line';$ink='muted';$weight=2
    if($r -eq 1 -and $c -eq 0){$fill='blueWash';$edge='blue';$ink='blue';$weight=3}
    if($r -eq 0 -and ($c -eq $selected -or ($both -and $c -eq 2))){$fill='pinkWash';$edge='pink';$ink='pink';$weight=3}
    if($r -eq 1 -and ($c -eq $selected -or ($both -and $c -eq 2))){$fill='purpleWash';$edge='purple';$ink='purple';$weight=3}
    Round $cx $cy $cw $ch $fill $edge 14 $weight
    Center $values[$r][$c] $cx $cy $cw $ch $(if($small){31}else{45}) $ink $true
  }}
}
function Eq($x,$y,$add,$sum,$w=130,$h=110,$size=44) {
  Round $x $y $w $h 'blueWash' 'blue' 16
  Center '9' $x $y $w $h $size 'blue' $true
  Center '+' ($x+$w) $y 48 $h 36 'ink' $true
  Round ($x+$w+48) $y $w $h 'pinkWash' 'pink' 16
  Center $add ($x+$w+48) $y $w $h $size 'pink' $true
  Center '=' ($x+2*$w+48) $y 48 $h 36 'ink' $true
  Round ($x+2*$w+96) $y $w $h 'purpleWash' 'purple' 16
  Center $sum ($x+2*$w+96) $y $w $h $size 'purple' $true
}
function BoardNote($x=103,$y=822){Text 'Point to a printed result to explore it.' $x $y 22 'muted';Text 'The missing answer stays ?.' $x ($y+35) 22 'muted'}

Page 'IDEA 1 / EXPLORE ONE CELL' 'Where did 12 come from?' 'Click a printed result. Its two source numbers light up.'
WorkedBoard 103 371
Text 'Start' 874 355 21 'blue' $true;Text 'Add' 1052 355 21 'pink' $true;Text 'Sum' 1230 355 21 'purple' $true
Eq 874 397 '3' '12'
Text 'These two numbers make 12.' 874 546 28 'ink' $true
Text 'Click 13 next: its sources are 9 and 4.' 874 603 24 'muted'
BoardNote
SavePicture 'equation-lens.png'

Page 'IDEA 2 / ANIMATION STORYBOARD' 'One row. The same rule, again and again.' 'Each frame starts again with the same blue 9. Children see one frame at a time.' 1920 1080
$adds=@('3','4','7');$sums=@('12','13','16');$xs=@(84,700,1316)
for($i=0;$i -lt 3;$i++){
  $x=$xs[$i]
  Text ('STEP '+($i+1)) $x 323 20 'muted' $true
  Text ('Start with 9. Add '+$adds[$i]+'.') $x 362 29 'ink' $true
  WorkedBoard $x 432 110 86 19 ($i+1) $true
  Eq $x 785 $adds[$i] $sums[$i] 120 87 38
}
Text 'The blue 9 stays. The top number changes. Each printed sum follows the same recipe.' 84 964 26 'ink'
SavePicture 'build-one-row.png'

Page 'IDEA 3 / SEE THE ADDING' 'Start at 9 each time' 'The top number tells you how many steps to move forward.'
WorkedBoard 103 371
function JumpLane($y,$hops,$sum){
  $sx=884;$step=104
  Line $sx $y ($sx+5*$step) $y 'line' 4
  for($i=0;$i -le 5;$i++){
    Line ($sx+$i*$step) ($y-7) ($sx+$i*$step) ($y+7) 'muted' 2
    $co=if($i -eq 0){'blue'}elseif($i -eq $hops){'purple'}else{'muted'}
    Center (9+$i) ($sx+$i*$step-25) ($y+14) 50 45 27 $co $true
  }
  $pen=[System.Drawing.Pen]::new((C 'pink'),4)
  for($i=0;$i -lt $hops;$i++){$script:g.DrawArc($pen,[single]($sx+$i*$step),[single]($y-43),[single]$step,[single]86,[single]180,[single]180)};$pen.Dispose()
  Text ('+'+$hops+' steps') $sx ($y-100) 28 'pink' $true
  Round ($sx+$hops*$step-27) ($y+10) 54 51 'purpleWash' 'purple' 10
  Center $sum ($sx+$hops*$step-27) ($y+10) 54 51 28 'purple' $true
}
JumpLane 477 3 '12'
JumpLane 736 4 '13'
BoardNote
Text 'Both journeys begin at the blue 9.' 875 869 25 'ink' $true
SavePicture 'same-start-jumps.png'

Page 'IDEA 4 / BUILD THE QUANTITIES' 'Keep the blue part. Add the pink part.' 'The left number is the same-sized base in both examples.'
WorkedBoard 103 371
function BarLane($y,$added,$sum){
  $bx=877;$unit=32;$height=76;$blueW=9*$unit;$pinkW=$added*$unit
  Round $bx $y $blueW $height 'blue' 'blue' 8 0
  Round ($bx+$blueW+5) $y $pinkW $height 'pink' 'pink' 8 0
  for($i=1;$i -lt 9;$i++){Line ($bx+$i*$unit) ($y+7) ($bx+$i*$unit) ($y+$height-7) '#77A6DD' 1}
  for($i=1;$i -lt $added;$i++){Line ($bx+$blueW+5+$i*$unit) ($y+7) ($bx+$blueW+5+$i*$unit) ($y+$height-7) '#E48BB7' 1}
  Center '9' $bx ($y-53) $blueW 43 31 'blue' $true
  Center $added ($bx+$blueW+5) ($y-53) $pinkW 43 31 'pink' $true
  Line $bx ($y+$height+20) ($bx+$blueW+$pinkW+5) ($y+$height+20) 'purple' 3
  Line $bx ($y+$height+10) $bx ($y+$height+20) 'purple' 3
  Line ($bx+$blueW+$pinkW+5) ($y+$height+10) ($bx+$blueW+$pinkW+5) ($y+$height+20) 'purple' 3
  Text ('Sum: '+$sum) ($bx+150) ($y+$height+32) 29 'purple' $true
}
BarLane 408 3 '12'
BarLane 672 4 '13'
BoardNote
SavePicture 'same-base-bars.png'

Page 'IDEA 5 / NOTICE WHAT CHANGES' 'Same start. One more added. One more in the sum.' 'Compare two completed cells. This is an extra pattern to discover.'
WorkedBoard 103 371 143 112 21 1 $false $true
Text 'Same start' 874 338 21 'blue' $true;Text 'Adding number' 1052 338 21 'pink' $true;Text 'Sum' 1250 338 21 'purple' $true
Eq 874 385 '3' '12'
Eq 874 691 '4' '13'
Arrow 1117 518 1117 665 'pink' 5 14
Text '+1' 1135 563 30 'pink' $true
Arrow 1295 518 1295 665 'purple' 5 14
Text '+1' 1312 563 30 'purple' $true
Center 'same 9' 874 552 130 60 23 'blue' $true
BoardNote
Text 'From top 4 to 7, the change would be +3.' 874 863 22 'muted'
SavePicture 'constant-and-change.png'
