# NetLab – Educational Packet Tracer Edition

A lightweight, interactive network simulator inspired by Cisco Packet Tracer, built entirely with **HTML5**, **CSS3**, and **Vanilla JavaScript**. NetLab runs directly in any modern web browser without servers, frameworks, or external libraries.

![NetLab Interface](img.png)

---

## 🚀 Features

### 1. Interactive Drag-and-Drop Workspace
- Drag, rearrange, and position network devices on a blueprint grid canvas.
- Visual boundaries and real-time SVG cable alignment as devices move.

### 2. Device Palette
- **End Device (PC)**: Configurable IPv4 address, Subnet Mask, Default Gateway, and MAC address.
- **Layer 2 Switch**: Multi-port LAN bridge with port status indicators and frame-forwarding logic.
- **Layer 3 Router**: Dual-interface (`eth0` / `eth1`) gateway with subnet routing table diagnostics.

### 3. Visual Cable Connections
- Interactive **Connect Cable** tool (`C` shortcut) to link devices.
- Port-aware connections (`eth0`, `Fa0/1`–`Fa0/4`, etc.) rendered with smooth SVG Bézier curves.
- Click-to-delete tool (`D` shortcut) for removing cables or devices.

### 4. Device Configuration Inspector
- Slide-out configuration panel to inspect and configure devices.
- Real-time Subnet ID and CIDR prefix calculation (`192.168.1.0/24`).
- Router dual-interface configuration with direct connected route inspection.

### 5. Discrete-Event Packet Simulation
- **ICMP Echo Simulation**: Send pings between selected Source and Destination PCs.
- **Visual Packet Flow**: Glowing animated packets trace the exact physical and logical path across switches and routers.
- **Full Simulation Controls**: **Play**, **Pause**, **Step-by-Step** forward, and **Reset** with adjustable simulation speed (`0.5x`, `1.0x`, `2.0x`).

### 6. Event Log & Diagnostic Hop Timeline
- Real-time event log documenting every hop in the packet's lifecycle:
  - ARP resolution and subnet matching
  - Layer 2 frame switching
  - Layer 3 routing decisions and gateway forwarding
  - Echo Reply reverse-path traversal
  - Actionable error diagnostics for unplugged links, missing gateways, or unrouted subnets.

### 7. Starter Topologies
- **1. Single Subnet LAN**: 2 PCs and 1 Switch on `192.168.1.0/24`.
- **2. Multi-Subnet Routed**: 2 separate LANs routed through a central Router (`192.168.1.0/24` and `192.168.2.0/24`).
- **3. Star Topology**: 3 PCs connected to a central Core Switch.
- **4. Troubleshooting Lab**: Misconfigured subnets on a switch without a router to demonstrate network isolation.

### 8. Local Storage Persistence
- Save your custom topologies and device configurations directly to browser `localStorage` with one click.
- Restore your saved network topology at any time.

---

## 🛠️ Technology Stack

- **HTML5**: Semantic layout, SVG graphics for cables and packet animations.
- **CSS3**: Cyber-lab dark theme, responsive grid, glassmorphism, glowing LEDs, and smooth transitions.
- **Vanilla JavaScript**: Pure ES6+ modular code with zero runtime dependencies.

---

## 📂 Project Structure

```text
├── index.html       # Main application layout, SVG canvas, and UI panels
├── style.css        # Stylesheet, cyber-lab theme, and animations
├── script.js        # Graph data structure, L2/L3 simulation engine, UI handlers
├── img.png          # Interface screenshot / preview asset
└── README.md        # Project documentation
```

---

## 🚦 Getting Started

### Prerequisites
Any modern web browser (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari). No installation, Node.js, or backend required!

### Running the Simulator
1. Clone or download this repository:
   ```bash
   git clone https://github.com/naveedsheriffj/NetLab---Educational-Packet-Tracer-Edition.git
   ```
2. Navigate into the project folder:
   ```bash
   cd NetLab---Educational-Packet-Tracer-Edition
   ```
3. Open `index.html` in your web browser:
   - **Windows**: Double-click `index.html` or run `start index.html` in PowerShell/Command Prompt.
   - **Mac**: Run `open index.html` in Terminal.
   - **Linux**: Run `xdg-open index.html`.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|:---:|:---|
| `V` | Select / Move Tool |
| `C` | Connect Cable Tool |
| `D` | Delete Tool |
| `Esc` | Cancel Cable Connection / Close Inspector |

---

## 🎓 Educational Disclaimer

NetLab Mini performs **local, deterministic, discrete-event simulation** for educational purposes to demonstrate fundamental concepts of Layer 2 Switching and Layer 3 Routing. It does not send real ICMP packets or generate live network traffic.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
