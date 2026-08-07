# RV Home Automation Research

## Initial Question

I'd like to research adding home automation to an off-grid 12 volt RV system - on/off controls, dimmers, programmed modes, computer integration, geofencing, things like that. What's the current state of the art and who are the key players. I'm a programmer and an electrical engineer, so homebrew something isn't out of the question.

## State of the Art Overview

The RV/marine 12V automation space is surprisingly fragmented, with most solutions being either basic switches or expensive marine-grade systems that don't integrate well.

### Commercial Solutions

**Victron Energy** dominates the power management side with their GX devices (Cerbo GX, etc.) running Venus OS (Linux-based). They have extensive Modbus TCP/MQTT support and a solid API for integration. Their VRM portal offers remote monitoring and basic control, but they're focused on power systems rather than comprehensive automation.

**RV-C (REC standard)** is the CAN-based protocol used in higher-end RVs. Companies like Spyder Controls make modules, but it's expensive and primarily targeted at OEM integration rather than retrofit.

**Wire Systems** offers intelligent control panels specifically for boats/RVs with dimming, scene control, and digital switching. They're marine-grade quality but pricey (~$2000+ for full systems).

**Yacht Devices** and **Digital Yacht** make various CAN/NMEA converters and sensors that could be adapted for RV use, mostly marine-focused.

### Homebrew-Friendly Options

**Home Assistant** is the best platform for integration. It runs well on Raspberry Pi, supports MQTT extensively, and has strong community support for custom integrations. People are successfully running it in RVs with 12V power supplies.

**ESPHome** + **ESP32 boards** are the sweet spot for DIY controllers. You can build custom relay boards, dimmer controllers (PWM for LED strips), and sensor nodes for under $10 each. They integrate directly with Home Assistant, support OTA updates, and run on 12V with simple buck converters.

**MOSFETs/Relay boards** for switching: use automotive-grade components rated for 12V battery fluctuations (10-15V range). The Qwiic/STEMMA ecosystem from SparkFun/Adafruit has good 12V-compatible options.

**Zigbee/Z-Wave** devices mostly expect 120V AC, but some battery-powered sensors work. The coordination radios run fine off USB power.

### Technical Considerations

Your electrical engineering background will be crucial here:
- **Voltage range**: 12V nominal means 10.5V (dead battery) to 14.6V (charging), or up to 15V+ with lithium
- **Reverse polarity protection** is essential (P-channel MOSFET on high side or series diode)
- **PWM dimming** for LEDs should be >200Hz to avoid flicker, ideally 1-20kHz
- **Inductive loads** (fans, pumps) need flyback diodes
- **Wire gauge** matters more at 12V - use automotive standards

### Geofencing/Remote Access

**Tailscale** works great for remote Home Assistant access without exposing ports. Combine with cellular hotspot.

**GPS integration** through USB dongles or phone apps feeding into Home Assistant works for location-based automation.

The most elegant approach combines Victron for battery/solar management (via their GX device), ESPHome nodes for distributed switching/dimming, and Home Assistant as the orchestration layer. This gives you professional-grade power monitoring with flexible DIY control logic.

The big gap in the market is unified dimming for 12V LED fixtures - most RV stuff is either on/off or proprietary. Building custom PWM controllers with ESP32s is probably your best path there.

---

## Deep Dive: Victron GX + ESPHome + Home Assistant + Tailscale

### Core System Architecture

#### Victron GX Device (Cerbo GX or similar)
- Monitors battery voltage, solar charge state, inverter status, tank levels (if you add sensors)
- Runs Venus OS (Debian-based Linux)
- Publishes all data via MQTT
- Has its own web interface on local network
- Primary job: power system monitoring and management

#### Home Assistant (Raspberry Pi or similar)
- Central automation brain
- Subscribes to Victron MQTT topics to read battery/solar data
- Controls ESPHome devices
- Runs automation rules ("if battery < 50%, turn off non-essential loads")
- Provides unified dashboard
- Handles geofencing via phone app

#### ESPHome Nodes (ESP32 boards scattered around RV)
- Control relays for on/off switching
- Drive MOSFETs for PWM dimming
- Read sensors (temperature, door contacts, motion)
- Self-register with Home Assistant via API
- Can operate autonomously if network fails

### Where Tailscale Enters (Maybe)

Tailscale only matters if you want **remote access** when away from the RV:
- Check battery status from your phone while hiking
- Turn on AC before returning to RV on hot day
- Monitor security sensors
- Adjust settings without being on RV's local WiFi

**Why Tailscale specifically**: Home Assistant's web interface normally only works on your local network. You could:
1. **No remote access**: Skip Tailscale entirely, everything works on RV WiFi
2. **Home Assistant Cloud** ($6.50/month): Official solution, easy but costs money
3. **Tailscale** (free): Creates secure VPN, access Home Assistant as if you're local

The value proposition is "access home automation remotely without opening firewall ports or paying subscription." But if you're always in/near the RV or don't care about remote access, you don't need it.

### Typical Data Flow

```
Solar Panel → Victron MPPT → Battery
                    ↓ (MQTT)
              Victron GX Device ← reads tank sensors
                    ↓ (MQTT)
              Home Assistant → "Battery at 45%, disable water heater"
                    ↓ (API)
              ESPHome Node → switches relay off
                    ↓
              Water Heater: OFF
```

The Victron-ESPHome-HA core works entirely self-contained on your RV's local network.
