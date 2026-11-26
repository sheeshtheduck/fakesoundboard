# FakeSoundboard (Updated)

A [Vencord](https://github.com/Vendicated/Vencord) plugin that unlocks the Discord soundboard UI and plays soundboard sounds into your voice call. Updated and rewritten to work with current Discord builds. Tested on Vesktop.

> **Disclaimer:** This project is for educational purposes. It modifies the Discord client and violates Discord's Terms of Service. Use it at your own risk. Not affiliated with or endorsed by Discord, Vencord, or Vesktop.

## Credits

Based on the original **FakeSoundboard** plugin by [ImLvna](https://github.com/ImLvna). The audio-mixing idea and plugin structure come from that work. This version is a modified derivative released under the same license (GPL-3.0-or-later).

## What I changed

- Rewrote the patches against the current Discord bundle. The old ones no longer matched.
- Updated the microphone hook, since `acquire` is now a class method instead of an assigned function.
- Replaced the brittle click patch with a request watcher. It wraps `RestAPI.post`, and when the server rejects a soundboard request with a `403`, the plugin plays the sound locally instead. Sounds the server accepts are not played twice.
- Mixes sounds into every live mic session, since Discord requests the mic more than once.
- Fixed a leak: the real microphone and `AudioContext` are now released when Discord stops the stream.
- Added error handling and logging (`[FakeSoundboard]` prefix in the console).

## How it works

1. A patch on the premium feature table makes the soundboard checks pass, which removes the lock icons.
2. A patch on Discord's mic acquisition routes your microphone through a Web Audio `MediaStreamDestination`.
3. When you click a sound and Discord's server answers `403`, the plugin downloads the sound from Discord's CDN, decodes it, and plays it into that destination. Other people hear it as part of your mic audio.

## Install

Plugins are compiled into Vencord, so you need to build it from source.

1. Install Node.js and pnpm.
2. Clone Vencord and install dependencies:

   ```bash
   git clone https://github.com/Vendicated/Vencord
   cd Vencord
   pnpm install --frozen-lockfile
   ```

3. Create `src/userplugins/fakeSoundboard/` and put `index.ts` in it.
4. Build:

   ```bash
   pnpm build --dev
   ```

5. In Vesktop, open Settings → Vesktop → Developer Options → **Vencord Location** → Change, and select the `dist` folder of your clone.
6. Fully quit and reopen Vesktop, then enable **FakeSoundboard** in Vencord → Plugins.

## Limitations

- Discord updates can break the patches again. The `find` strings and regexes target minified code.
- Your mic must be unmuted. Set Noise Suppression to *None* and turn off Automatic Input Sensitivity, or Discord's voice filters can swallow the sound.
- Sounds are capped at 20 seconds.
- Other people hear sounds as your mic audio, so they follow your input volume and mute state.
- Desktop Vesktop and web only.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

Original work Copyright (c) 2023 Vendicated and contributors.

Modifications Copyright (c) 2026 Ayush Raj.
