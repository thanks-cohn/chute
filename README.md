# Chute

> **LICENSE NOTICE — NOT MIT. NON-COMMERCIAL SOURCE-AVAILABLE SOFTWARE.**
>
> This branch is provided under the **Chute Source-Available Non-Commercial License v1.0** in [`LICENSE`](LICENSE). Personal, educational, research, evaluation, hobby, and other genuinely non-commercial use is permitted. **Commercial use is prohibited without prior written permission.** You may not sell, monetize, commercially redistribute, bundle into a paid product or service, publish a paid fork or clone, or use this repository or a substantial derivative to create a product or service for financial gain.

## About this branch

`agent/love-chute-layer-systemd` is an earlier Chute development branch focused on the floating browser Chute, the old **Love Chute** support layer, front/back sticky-layer control, and Linux systemd user-service setup.

Chute is a local browser/desktop handoff tool. A local service listens on `127.0.0.1:17891`; compatible Chromium extensions use that local service as a shared queue so files can be picked up in one place and used somewhere else.

This branch includes the historical work for:

- dependency-light Python CLI and localhost server
- browser floating Chute bin
- browser-to-local file ingestion
- links and selected text intake
- extension popup and side shelf
- local queue counts and removal/clear operations
- virtual-file drag support
- configurable **Love Chute** support destination
- sticky front/back layer controls
- Linux systemd user-service installation
- shared local queue across compatible Chromium browsers

## Linux setup represented by this branch

The historical development flow used Python 3.10+ and an isolated virtual environment:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e .
```

The systemd helper could then install a per-user service:

```bash
chute systemd install
```

The service was intended to bind only to loopback and make Chute available automatically after user login.

## Browser extension

Load the `extension` directory as an unpacked Chromium extension while developing:

```text
Chrome: chrome://extensions
Edge:   edge://extensions
Brave:  brave://extensions
Opera:  opera://extensions
```

Turn on Developer mode, choose **Load unpacked**, and select this branch's `extension` folder.

## Local-first model

Chute is designed around local storage and a loopback bridge. Files are copied into Chute's local queue and are not uploaded to a Chute cloud service. The same local queue can be exposed through multiple compatible browsers on one computer.

## Historical status

This is a preserved development branch, not the current paid Windows product branch. Newer product work exists in later branches such as `premium-v2`, `windows-v2.3-chromium`, `direct-drop-google-yandex`, and `paid-installer-onboarding`.

The commit history preserves the older implementation details and experiments represented by this branch.

## License

**This branch is not MIT licensed.** It is distributed under the **Chute Source-Available Non-Commercial License v1.0**. See [`LICENSE`](LICENSE) for the complete terms.

Commercial use, resale, paid redistribution, commercial forks/clones, commercial derivatives, or use of this code as the basis of a revenue-generating product or service requires separate written permission from the applicable Chute rights holder.

Historical snapshots that were validly distributed under an earlier license are not retroactively relicensed; the license in this branch applies to the branch state distributed with it to the extent the applicable rights holders have authority over the material.
