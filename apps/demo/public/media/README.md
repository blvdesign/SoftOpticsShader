# Demo media provenance

All media in this directory is original project material. No stock imagery,
third-party brands, or externally sourced assets are used.

## `editorial-hero.png`

Generated with OpenAI's built-in image generation on 2026-07-25 using this
prompt:

> Use case: stylized-concept
>
> Asset type: original responsive editorial demo hero image for an open-source WebGL shader website
>
> Primary request: create a refined abstract composition that clearly demonstrates a soft optical edge effect: one continuous pale milky ribbon or translucent ivory membrane travels horizontally across the frame, with its central area mostly crisp while the uppermost and lowermost portions progressively soften, bend, and refract as though entering an optical boundary. The effect must read as smooth continuous blur plus subtle lens refraction, never stacked bands.
>
> Scene/backdrop: warm white and very light gray editorial studio field, minimal and spacious
>
> Subject: a single sculptural milky ribbon with gentle curvature; one small restrained green light accent in #8FC073 glancing along one edge
>
> Style/medium: premium minimalist 3D editorial render, soft translucent resin / frosted glass, believable optical depth
>
> Composition/framing: wide 16:9, ribbon spanning most of the image with generous negative space, strong large shapes, suitable for responsive crop
>
> Lighting/mood: diffuse daylight, quiet, precise, sophisticated
>
> Color palette: #FFFFFF, #F2F2F2, #232323 only in tiny shadow values, accent #8FC073
>
> Materials/textures: frosted glass, milky resin, extremely subtle soft shadow, clean surfaces
>
> Constraints: no text, no logos, no people, no UI, no icons, no watermark; show a visibly progressive optical transition at both top and bottom edges of the ribbon; keep the middle recognizable and crisp; minimal detail
>
> Avoid: black ribbon, dark background, multiple unrelated objects, stripes, banding, grain, dithering, noisy texture, chromatic rainbow fringe, hard glow, cyberpunk styling

`editorial-hero.webp` is an optimized WebP derivative of the preserved
original PNG.

## `editorial-detail.png`

Generated with OpenAI's built-in image generation on 2026-07-25 using this
prompt:

> Use case: stylized-concept
>
> Asset type: original secondary editorial detail image for an open-source WebGL shader demo
>
> Primary request: create a minimal close-up of one pale ivory translucent sheet passing through a soft optical boundary. The sheet is crisp through the central diagonal area, then smoothly diffuses and slightly shifts position near the upper and lower frame edges, visibly suggesting progressive viewport blur and gentle refraction without using literal UI.
>
> Scene/backdrop: warm white seamless studio field
>
> Subject: one broad sculptural milky membrane with a subtle fold; a tiny restrained #8FC073 accent visible through the refracted edge
>
> Style/medium: premium minimalist macro 3D render, frosted glass and milky resin
>
> Composition/framing: wide 16:9, strong simple diagonal form, large negative space, useful as an editorial article image
>
> Lighting/mood: diffuse daylight, soft and precise
>
> Color palette: white, #F2F2F2, pale warm gray, minimal #8FC073
>
> Constraints: no text, no logos, no people, no UI, no icons, no watermark; a single object only; continuous feathered blur, not layered strips; central portion visibly crisp
>
> Avoid: black, dark blue, rainbow chromatic aberration, stripes, banding, grain, dithering, excessive detail, hard neon glow, multiple objects

`editorial-detail.webp` is an optimized WebP derivative of the preserved
original PNG.

## `optical-motion.webm`

This local, silent six-second VP9 loop was derived solely from
`editorial-hero.png`. A centered, sinusoidal pan and brightness drift were
applied with FFmpeg to create subtle continuous motion without introducing
external footage:

```sh
ffmpeg -loop 1 -i editorial-hero.png \
  -vf "scale=1344:756,crop=1280:720:x='32+20*sin(2*PI*t/6)':y='18+18*cos(2*PI*t/6)',eq=brightness='0.005*sin(2*PI*t/6)'" \
  -t 6 -r 30 -an -c:v libvpx-vp9 -pix_fmt yuv420p -crf 31 -b:v 0 \
  optical-motion.webm
```
