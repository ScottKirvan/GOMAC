# Deploying the pianobar daemon on TheFlea

**Deployment model**: the running service uses a dedicated git worktree
pinned to `main` (`/home/scott/gomac-deploy` on TheFlea), separate from
the regular development checkout — so switching branches to work on the
next phase doesn't change what the running service is actually executing
out from under it.

## First-time setup

```sh
git worktree add /home/scott/gomac-deploy main   # from the main GOMAC checkout
cd /home/scott/gomac-deploy/src/integrations/pianobar
npm install
npm run build
cp deploy/gomac-pianobar.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now gomac-pianobar
```

Requires the `pianobar` MQTT credential already provisioned at
`/etc/pianobar-bridge/mqtt_password` (a TheFlea-side change, not part of
this repo — see `notes/dev/compute-hub-current-state.md`'s domain
separation model for why that's a separate request, not something this
repo's deploy step creates itself).

## Redeploying after new work merges to `main`

```sh
cd /home/scott/gomac-deploy
git pull origin main
cd src/integrations/pianobar
npm install   # only if dependencies changed
npm run build
systemctl --user restart gomac-pianobar
```

Restarting the daemon does **not** interrupt pianobar itself — pianobar
runs detached and the daemon re-adopts it on startup (Process Ownership,
`pandora-mqtt-spec.md`). Only an explicit `restart` command (from the app,
or MQTT directly) actually restarts pianobar.

## Checking it's alive

```sh
systemctl --user status gomac-pianobar
journalctl --user -u gomac-pianobar -f
```
