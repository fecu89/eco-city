# Eco City background music source

- Source: user-provided `eco-city.mp3`
- Source file: `eco-city-original.mp3`
- Source SHA-256: `f0d70fc6e536a7a1d86083bf109a67dcb3611ea5825445de131c0dd841c7616c`
- Source encoding: MP3, 48 kHz stereo, approximately 216 kbps, 152.2935 seconds
- Source size: 4,119,934 bytes

The runtime copy at `public/assets/eco-city.mp3` is derived with FFmpeg:

```text
-map 0:a:0 -vn -map_metadata -1 -ar 44100 -ac 2 -c:a libmp3lame -b:a 96k -write_xing 1
```

- Runtime SHA-256: `244aac7fd7cde8c3e07ffbba98d62466af6dbdbcc749af6e5a1e14d0625f22ed`
- Runtime size: 1,828,197 bytes
- Transfer reduction: 55.6%
- Runtime loading: streamed on the first user gesture (`preload="none"`), not bundled into JavaScript

The original source is intentionally kept outside `public/` so it is not shipped by the web build.
