# Changelog

## [0.1.0](https://github.com/ScottKirvan/GOMAC/compare/v0.0.0...v0.1.0) (2026-10-17)


### Features

* add real-time telemetry dashboard for Gomtuu ([db42cbf](https://github.com/ScottKirvan/GOMAC/commit/db42cbf8285a83299b16b28dbd8ee153af19e0df))
* auto-detect tailnet reachability instead of a separate private URL ([daf55c7](https://github.com/ScottKirvan/GOMAC/commit/daf55c727b193a889071a3495781f493411b73d2))
* **dashboard:** add bidirectional amp gauge, Cockpit link, clarify recent peak ([a7d8335](https://github.com/ScottKirvan/GOMAC/commit/a7d833576237eb930fc4e77c574d3fd33d418234))
* **dashboard:** add wind, condition icons, and a 4-day forecast to weather ([d813a08](https://github.com/ScottKirvan/GOMAC/commit/d813a0817698d74cce4563929548db1d0fe25cd2)), closes [#60](https://github.com/ScottKirvan/GOMAC/issues/60)
* **dashboard:** chart solar input and energy banked across the day ([f8e48fc](https://github.com/ScottKirvan/GOMAC/commit/f8e48fc8b3f4e720ee352fa8bb3d4ce18513dc8e))
* **dashboard:** color-code Victron charge states ([c5c7836](https://github.com/ScottKirvan/GOMAC/commit/c5c78368ddd8434c658907cdf6604351d241581b)), closes [#59](https://github.com/ScottKirvan/GOMAC/issues/59)
* **dashboard:** draw the Power Gauge rings as color gradients ([a55c860](https://github.com/ScottKirvan/GOMAC/commit/a55c860220e281e12dfa98edb6139a4e90f34549)), closes [#57](https://github.com/ScottKirvan/GOMAC/issues/57)
* **dashboard:** keep and save 48h of power history with energy charged ([15c76c1](https://github.com/ScottKirvan/GOMAC/commit/15c76c1d438011dc0084f55a6719a83f84afe52a))
* **dashboard:** link Position coordinates to Google Maps ([3c8e292](https://github.com/ScottKirvan/GOMAC/commit/3c8e292fa62afb9c941035e7b1249390086bb8a3)), closes [#61](https://github.com/ScottKirvan/GOMAC/issues/61)
* **dashboard:** scale solar visuals to the all-time peak instead of a rolling window ([2a0b914](https://github.com/ScottKirvan/GOMAC/commit/2a0b91427f6a486bf05cdd7be0162d659c184a87))
* **dashboard:** server-side rolling solar peak over a configurable window (default 24h) ([9a770a9](https://github.com/ScottKirvan/GOMAC/commit/9a770a9a888fec7bb9f4990dadb05a688af08818))
* **dashboard:** show battery current in the Power Gauge stats ([f393f6e](https://github.com/ScottKirvan/GOMAC/commit/f393f6e9789639670201fdd59bdfc7cd2685f355)), closes [#58](https://github.com/ScottKirvan/GOMAC/issues/58)
* **dashboard:** show live readings from the stream with smooth easing ([b60a6d7](https://github.com/ScottKirvan/GOMAC/commit/b60a6d74462e9f8d68faaa8010ea59f638f240b0)), closes [#64](https://github.com/ScottKirvan/GOMAC/issues/64)
* **dashboard:** show Victron device availability and count energy by time ([0a5775a](https://github.com/ScottKirvan/GOMAC/commit/0a5775a1d59ae1a3611a29795ebde1d536a8fd02))
* **dashboard:** show Victron devices by their BLE names ([41decc7](https://github.com/ScottKirvan/GOMAC/commit/41decc7d45430bf3908b007b29b317747886e53e)), closes [#55](https://github.com/ScottKirvan/GOMAC/issues/55)
* **dashboard:** stream fast-changing readings over Server-Sent Events ([fd74d16](https://github.com/ScottKirvan/GOMAC/commit/fd74d16f4de44c80efc741395b52a3b70b7a2026)), closes [#64](https://github.com/ScottKirvan/GOMAC/issues/64)
* **dashboard:** update the header clock from live events ([3856261](https://github.com/ScottKirvan/GOMAC/commit/38562612cb3bfb8310734127b786fa7115d5b8ec))
* publish the dashboard frontend through GitHub Pages ([3d2c848](https://github.com/ScottKirvan/GOMAC/commit/3d2c848b8cf4dfa8d653f51de50b3fa6fa529934))
* wire position and connectivity into the dashboard ([76858b9](https://github.com/ScottKirvan/GOMAC/commit/76858b98bedd4d1080b3f0324e4008a6d338a5ba))
* wire weather into the dashboard via Open-Meteo ([7d00b45](https://github.com/ScottKirvan/GOMAC/commit/7d00b450dd871662efccc866f5ac81456bb11495))


### Bug Fixes

* add VitePress local search provider to docs ([3040965](https://github.com/ScottKirvan/GOMAC/commit/30409650d67514918a1a8c1de0da053952288d3f))
* bind dashboard to loopback and isolate position to a tailnet-only port ([9cbebab](https://github.com/ScottKirvan/GOMAC/commit/9cbebabb568cc7a442aa50081462e67337d99f8d))
* **dashboard:** bucket power samples into 10s so the 1-hour peak window actually spans an hour ([1119a9c](https://github.com/ScottKirvan/GOMAC/commit/1119a9cb3fd84415e5179122dfd26e466f3d0daf))
* **dashboard:** fetch weather soon after startup and back off on failures ([8b2f5d9](https://github.com/ScottKirvan/GOMAC/commit/8b2f5d9acbc2d721781d74d2b26839d491b6625d)), closes [#66](https://github.com/ScottKirvan/GOMAC/issues/66)
* **dashboard:** increase contrast in the Power Gauge ring gradients ([74b9c76](https://github.com/ScottKirvan/GOMAC/commit/74b9c764e18813da4b9960e0a4b496ecc0320441))
* **dashboard:** keep power chart end labels inside the chart ([d65dce4](https://github.com/ScottKirvan/GOMAC/commit/d65dce42720f08c5f51b73c75a163e911c6e23c6)), closes [#56](https://github.com/ScottKirvan/GOMAC/issues/56)
* **dashboard:** make recent-peak a real 1-hour window, not sample count ([22f9f5b](https://github.com/ScottKirvan/GOMAC/commit/22f9f5b3d8ee2ee6e636331b48afae28cef12035))
* **dashboard:** run ring gradients along the visible arc and widen them ([c3e0259](https://github.com/ScottKirvan/GOMAC/commit/c3e02592bd5c7cb7dd02f422216f7086af459f6f))
* **dashboard:** switch to the tailnet backend once the browser allows it ([fa2d98b](https://github.com/ScottKirvan/GOMAC/commit/fa2d98b4cd319e86dede4c394e672ae66ecfa4a8))
* point public dashboard at Funnel's actual supported port ([457113a](https://github.com/ScottKirvan/GOMAC/commit/457113aa1939faa5b1f6ed96b7675db8137e02e5))
* replace WebSocket push with plain JSON polling ([ed118c6](https://github.com/ScottKirvan/GOMAC/commit/ed118c6098b8e78dd12d1529f9e5a66080b447be))

## 0.0.0 (2026-09-01)


### Features

* add a real HA volume slider alongside the existing nudge buttons ([4e069b6](https://github.com/ScottKirvan/GOMAC/commit/4e069b650b1ca1543200dbc9ae3c823bb513f238))
* add custom Lovelace card for the pianobar media_player entity ([954ce73](https://github.com/ScottKirvan/GOMAC/commit/954ce733bb3c8b7bba308cf723bd6bc16cdf03ae))
* add Home Assistant media_player integration for pianobar ([25e960d](https://github.com/ScottKirvan/GOMAC/commit/25e960dbc683ae29438bbf70439bf2fadcb9e7b6))
* add Phase 1 pianobar bridge daemon ([6eed3f7](https://github.com/ScottKirvan/GOMAC/commit/6eed3f7558cc7a9c16b0afea0c0d2059db36b946))
* add Phase 2 pianobar telemetry and station selection ([8f2846c](https://github.com/ScottKirvan/GOMAC/commit/8f2846c37aaba1ce97801581a934e6fb659b9b0f))
* add systemd deployment for the pianobar daemon ([2b8e619](https://github.com/ScottKirvan/GOMAC/commit/2b8e6193e52bc246a18a40ba1bfbc7c7c0df3a5f))
* add wpctl-based system volume control ([77ba5f4](https://github.com/ScottKirvan/GOMAC/commit/77ba5f40e4b29d3cc4c7d9d1363250a2d6de4830))
* publish Home Assistant MQTT discovery for pianobar daemon ([566d752](https://github.com/ScottKirvan/GOMAC/commit/566d752cb55d702eab5f4eb08cef92215254147d))
* real media_player HA integration for pianobar ([873cd82](https://github.com/ScottKirvan/GOMAC/commit/873cd823c0a0cd64529d973739ae1ceaf74167d1))


### Bug Fixes

* add changelog link to release and staging footers ([b348010](https://github.com/ScottKirvan/GOMAC/commit/b3480100dec97043b0879bfed0b574f097c300c6))
* apply a cubic curve to volume so the slider tracks perceived loudness ([2180705](https://github.com/ScottKirvan/GOMAC/commit/2180705d4885c39d1a70dbf2690467da50aa59de))
* configure autostart_station so restart actually resumes playback ([cf76130](https://github.com/ScottKirvan/GOMAC/commit/cf761302e2c23774b031396f40841b52d0b6298f))
* drop redundant 'All rights reserved' from credits ([07b7caf](https://github.com/ScottKirvan/GOMAC/commit/07b7caf014b167440640aea672411736f2c61bd4))
* ensure pianobar's control fifo exists and guard against pidfile pid reuse ([8976830](https://github.com/ScottKirvan/GOMAC/commit/8976830f02b18fd1ff849653fb40bc6e6d48f051))
* fill in project_context, tagline, and footer for GOMAC ([1396d49](https://github.com/ScottKirvan/GOMAC/commit/1396d49f12c62ecaba978813f071d2fb06323859))
* prevent systemd from killing pianobar on daemon restart ([7c9cc82](https://github.com/ScottKirvan/GOMAC/commit/7c9cc82e9d700eec425452acfba93723a601356b))
* quote TODO placeholder values in docs/index.md frontmatter ([f5fc9cf](https://github.com/ScottKirvan/GOMAC/commit/f5fc9cf2e3bd3d5f23ea3906da38afb8c51a8fba))
* rename logo asset to logo.png and update README reference ([ba7fd49](https://github.com/ScottKirvan/GOMAC/commit/ba7fd49d79cdfea9a53acf37b37bf47db6d2d89d))


### Reverts

* remove the added volume curve, wpctl already applies one ([28993ab](https://github.com/ScottKirvan/GOMAC/commit/28993ab4e566580d918e919323b8640fb73e2686))

## Changelog
>[!NOTE]
> This file and it's version format is automatically 
> generated by [Please-Release](https://github.com/googleapis/release-please-action), 
> and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
