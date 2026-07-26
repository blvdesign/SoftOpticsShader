# Demo media provenance

The demo deliberately contains no illustrative raster artwork. Its main test
surfaces are live HTML and CSS, so the only blur, displacement, or dispersion
visible at a viewport edge is produced by Soft Optics itself.

## `optical-test-signal.webm`

This local, silent six-second VP9 loop is a crisp geometric test signal. It has
no pre-rendered blur or refraction and exists only to verify that a real playing
`<video>` remains live while its current frame is composited by the shader.

```sh
ffmpeg -f lavfi \
  -i "color=c=0xf2f2f2:s=1280x720:r=30:d=6" \
  -vf "drawgrid=w=64:h=64:t=1:c=0xd8d8d8,\
drawbox=x='(w-180)/2+380*sin(2*PI*t/6)':y=270:w=180:h=180:\
color=0x8fc073:t=fill,\
drawbox=x='(w-2)/2':y=0:w=2:h=720:color=0x232323:t=fill" \
  -an -c:v libvpx-vp9 -pix_fmt yuv420p -crf 30 -b:v 0 \
  optical-test-signal.webm
```
