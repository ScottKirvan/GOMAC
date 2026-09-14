# Gomtuu OBD-II / CAN bus research

Research done 2026-09-14 to answer two questions before committing to an
OBD integration: what can the OBDLink MX+ actually do, and can we get
raw CAN bus data out of Gomtuu (a 2005 T1N Sprinter) via the OBD-II port.
Short answer: **no** to raw CAN via the OBD port on this specific
vehicle -- a real, vehicle-specific constraint, not an adapter
limitation. Standard OBD-II PIDs are still fully available and cover
everything currently wanted (boost, battery voltage, trouble codes).

## The adapter: OBDLink MX+

Genuinely capable of raw CAN bus sniffing, not just structured PID
queries -- this is a real, documented capability, not marketing:

- Supports "all legislated OBD-II protocols, plus advanced Ford & GM
  vehicle networks (MS-CAN and SW-CAN)."
- Confirmed via a real-world test (OBD-Atlas project, GitHub): silent,
  receive-only, pass-all-filter monitoring of raw HS-CAN traffic,
  documented protocol 31 for HS-CAN / 61 for GM SW-CAN. Passive mode
  (`STCMM 0`) -- monitors without transmitting anything itself.
- Real limitation found in that same test: unfiltered HS-CAN monitoring
  hit a `BUFFER FULL` error over RFCOMM after ~3,000 frames in 40
  seconds -- worth knowing if raw sniffing is ever attempted on a
  CAN-equipped vehicle: needs a message filter, not just "log
  everything."

**This capability is moot for Gomtuu specifically** -- see below.

## The vehicle: Gomtuu's OBD-II port does not carry CAN

This is the load-bearing finding. Confirmed from two independent
sources (a general OBD protocol reference and a Sprinter-specific forum
with an actual pinout):

- Sprinter T1N (pre-2007) OBD-II diagnostics run over **K-line**
  (ISO 14230 / KWP2000), not CAN. Sprinter OBD sockets became CAN-based
  starting with the NCV3 generation, **newer than 2006** -- Gomtuu (2005)
  is on the K-line side of that line.
- Confirmed pinout for a same-era Sprinter (sprinter-source.com forum,
  contributor-documented, 2006 cargo van): pin 7 = ECM K-line, pin 11 =
  TCM/Radio K-line, pin 15 = instrument cluster/climate K-line, pin 16 =
  12V constant, pins 4/5 = ground. **Pins 6 and 14 -- the CAN-H/CAN-L
  pins on CAN-equipped OBD-II connectors -- are empty on this
  generation.** The physical CAN signal simply isn't present at the
  connector.
- One forum contributor noted pre-2007 models "didn't necessarily give
  us easy _access_ to it [CAN]" -- phrasing that leaves open whether a
  CAN bus exists *internally* between some modules even though it's not
  routed to the OBD-II port. Not confirmed either way, and not
  something an OBD-II-port adapter (MX+ included) could reach regardless
  -- would require physically locating and tapping the vehicle's
  internal wiring, a separate and much more invasive hardware project,
  not a software/adapter question.
- Standard OBD-II scanners (MX+ included) only talk to pin 7 (the engine
  ECM's K-line) -- the transmission and instrument-cluster K-lines
  need specialized multi-line tools to access at all, which is a
  separate consideration from CAN entirely.

## Has Gomtuu's data already been reverse-engineered publicly?

Checked the most comprehensive public community index of reverse-engineered
automotive CAN IDs (`iDoka/awesome-automotive-can-id` on GitHub). It has a
real Mercedes-Benz section, but every entry is for **passenger car
platforms** (W203/W211/W219/W209, transmission controller for the 722.6
auto), not commercial vans. **No Sprinter, T1N, or OM647 entries exist
in it.** Consistent with T1N Sprinters not carrying CAN at the OBD port
in the first place -- there'd be little reason for the CAN
reverse-engineering community to target a vehicle whose diagnostic port
doesn't expose CAN.

The OM647 diesel-tuning community (sprinter-source.com,
superturbodiesel.com) is active and does discuss engine internals
relevant to boost (e.g. the stock MAP/boost sensor being "2.5 Bar and
... just about maxed under normal conditions" per one tuning thread) --
but nothing found in this pass amounts to a ready-made, published PID
map for manufacturer-specific data. Might exist scattered across forum
threads with more digging; not confirmed to exist as a clean reference.

## What this means for the actual data we want

The three things Scott wants (boost, real-time battery voltage,
immediate trouble-code alerts) are all **standard SAE J1979 Mode 01
PIDs** -- protocol-agnostic by design, meaning they work the same way
over K-line as they would over CAN, just slower:

| Want | PID | Notes |
|---|---|---|
| Boost | `0x0B` (Manifold Absolute Pressure) | Boost isn't a native field -- it's MAP minus ~101 kPa atmospheric, computed client-side |
| Battery voltage | `0x42` (Control Module Voltage) | Reads the OBD port / ECU supply rail, i.e. the starter/alternator circuit -- a genuinely different measurement point than the Victron house-battery numbers already collected |
| New trouble codes | `0x01` (Monitor status since DTCs cleared) | MIL bit + DTC count; poll this to catch the *moment* it changes, then pull the actual code(s) via Mode 03 |

**The real constraint is speed, not availability.** KWP2000/K-line runs
at 1.2-10.4 kbaud (vs. CAN's 250k-500k), and ECU response time during
the protocol's init/request cycle is documented at 20-300ms per
exchange, with a symmetrical request/response pattern (one request, one
response, no batching). For three PIDs polled in sequence, realistic
throughput is roughly 1-5 full cycles per second, not the many-times-a-
second rate CAN would allow. That's still genuinely useful for "watch
boost while driving" and "catch a new code within a second or two of it
firing" -- just worth setting expectations against, since it's a
different order of magnitude than a CAN-based setup would give.

## Bottom line

- Raw CAN sniffing: not available via Gomtuu's OBD-II port on this
  vehicle, full stop -- a hardware/vehicle-generation fact, not
  something the OBDLink MX+ or any other port-based adapter can work
  around. No evidence any public reverse-engineering project has
  targeted this vehicle either, consistent with that.
- Standard OBD-II (K-line/KWP2000, Mode 01/02/03) fully covers boost,
  real-time-ish battery voltage, and immediate DTC detection -- the
  actual goals discussed. Recommend proceeding on that basis rather than
  chasing raw CAN access for this vehicle.
- Revisit if Gomtuu's OBD-II adapter/vehicle ever changes (e.g. a
  CAN-equipped Sprinter generation) -- the OBDLink MX+'s raw CAN
  capability would then actually be usable, with the buffer/filtering
  caveat above worth remembering.

## Sources

- [OBDLink MX+ product page](https://www.obdlink.com/products/obdlink-mxp/)
- [Voltarians/OBD-Atlas PR #19 -- OBDLink MX+ GM SWCAN monitoring, includes real HS-CAN monitoring test](https://github.com/Voltarians/OBD-Atlas/pull/19)
- [Sprinter-Source.com -- OBD pinout and diagnostics (update)](https://sprinter-source.com/forums/index.php?threads/46100/)
- [OBD-Codes.com forum -- Scanning the K line of Mercedes Sprinter, KWP2000 detected](https://obd-codes.com/forums/viewtopic.php?t=7622)
- [Keyword Protocol 2000 -- Wikipedia](https://en.wikipedia.org/wiki/Keyword_Protocol_2000)
- [iDoka/awesome-automotive-can-id -- community CAN ID index](https://github.com/iDoka/awesome-automotive-can-id)
- [Sprinter-Source.com -- Sprinter turbo upgrades thread (OM647 boost sensor discussion)](https://sprinter-source.com/forums/index.php?threads/51304/page-4)
