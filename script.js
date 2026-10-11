/**
 * NetLab Mini – Interactive Network Simulator (Packet Tracer Edition)
 * ============================================================================
 * Educational discrete-event simulator for Layer 2 Switching and Layer 3 Routing.
 * Pure Vanilla JavaScript with zero external frameworks or libraries.
 * ============================================================================
 */

'use strict';

/* ==========================================================================
   1. Data Structures & Simulation State
   ========================================================================== */

const STORAGE_KEY = 'netlab_mini_topology_v1';

const AppState = {
  // Collection of network devices: id -> Device Object
  devices: new Map(),

  // Collection of connections: Array of { id, fromId, toId, fromPort, toPort }
  connections: [],

  // Current active editor tool: 'select' | 'connect' | 'delete'
  activeTool: 'select',

  // Cable connection state: first selected device id when connecting
  connectPendingSourceId: null,

  // Selected device for inspector
  selectedDeviceId: null,

  // Simulation timeline & playback engine
  simulation: {
    isRunning: false,
    isPaused: false,
    timerId: null,
    currentStepIndex: 0,
    steps: [], // Array of discrete simulation hops
    speedMs: 1000,
    activePacketEl: null,
    sourcePcId: null,
    destPcId: null
  },

  // ID generators
  counters: {
    pc: 0,
    switch: 0,
    router: 0,
    conn: 0
  }
};

/* ==========================================================================
   2. DOM Element References
   ========================================================================== */

const DOM = {
  // Tools
  toolSelect: document.getElementById('tool-select'),
  toolConnect: document.getElementById('tool-connect'),
  toolDelete: document.getElementById('tool-delete'),
  starterSelect: document.getElementById('starter-topologies-select'),
  btnSaveLocal: document.getElementById('btn-save-local'),
  btnLoadLocal: document.getElementById('btn-load-local'),
  btnClearCanvas: document.getElementById('btn-clear-canvas'),

  // Simulation Bar
  btnSimPlay: document.getElementById('btn-sim-play'),
  btnSimPause: document.getElementById('btn-sim-pause'),
  btnSimStep: document.getElementById('btn-sim-step'),
  btnSimReset: document.getElementById('btn-sim-reset'),
  simSpeedSelect: document.getElementById('sim-speed-select'),
  pingSrcSelect: document.getElementById('ping-src-select'),
  pingDestSelect: document.getElementById('ping-dest-select'),
  btnStartPing: document.getElementById('btn-start-ping'),
  simStatusPill: document.getElementById('sim-status-pill'),

  // Sidebar Palette
  addPcBtn: document.getElementById('add-pc-btn'),
  addSwitchBtn: document.getElementById('add-switch-btn'),
  addRouterBtn: document.getElementById('add-router-btn'),
  connectBanner: document.getElementById('connect-banner'),
  connectBannerText: document.getElementById('connect-banner-text'),
  btnCancelConnect: document.getElementById('btn-cancel-connect'),

  // Canvas
  canvasContainer: document.getElementById('canvas-container'),
  canvasViewport: document.getElementById('canvas-viewport'),
  canvasSvg: document.getElementById('canvas-svg'),
  svgCablesLayer: document.getElementById('svg-cables-layer'),
  svgPacketsLayer: document.getElementById('svg-packets-layer'),
  canvasNodesLayer: document.getElementById('canvas-nodes-layer'),
  canvasEmptyState: document.getElementById('canvas-empty-state'),

  // Inspector Panel
  deviceInspector: document.getElementById('device-inspector'),
  inspectTitle: document.getElementById('inspect-title'),
  inspectIcon: document.getElementById('inspect-icon'),
  inspectorBody: document.getElementById('inspector-body'),
  btnCloseInspector: document.getElementById('btn-close-inspector'),

  // Event Log Panel
  bottomPanel: document.getElementById('bottom-panel'),
  eventTimeline: document.getElementById('event-timeline'),
  eventLogEmpty: document.getElementById('event-log-empty'),
  logCounter: document.getElementById('log-counter'),
  btnClearLog: document.getElementById('btn-clear-log'),
  btnToggleLog: document.getElementById('btn-toggle-log'),

  // Toast
  toastNotification: document.getElementById('toast-notification')
};

/* ==========================================================================
   3. IP & Subnetting Utility Math
   ========================================================================== */

/**
 * Validates IPv4 address string (e.g. "192.168.1.1")
 */
function isValidIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const octet = parts[i];
    if (!/^\d+$/.test(octet)) return false;
    const num = parseInt(octet, 10);
    if (num < 0 || num > 255) return false;
    if (octet.length > 1 && octet.startsWith('0')) return false;
  }
  return true;
}

/**
 * Converts IPv4 string to 32-bit unsigned integer
 */
function ipToInt(ip) {
  const parts = ip.trim().split('.').map(Number);
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

/**
 * Converts 32-bit integer back to IPv4 string
 */
function intToIp(int) {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255
  ].join('.');
}

/**
 * Calculates Subnet Network ID given IP and Subnet Mask
 */
function getNetworkAddress(ip, mask) {
  if (!isValidIPv4(ip) || !isValidIPv4(mask)) return 'Invalid';
  const ipIntVal = ipToInt(ip);
  const maskIntVal = ipToInt(mask);
  return intToIp((ipIntVal & maskIntVal) >>> 0);
}

/**
 * Converts subnet mask to CIDR prefix length (e.g. 255.255.255.0 -> 24)
 */
function maskToCidr(mask) {
  if (!isValidIPv4(mask)) return 24;
  const val = ipToInt(mask);
  let bits = 0;
  for (let i = 31; i >= 0; i--) {
    if ((val & (1 << i)) !== 0) bits++;
  }
  return bits;
}

/**
 * Checks if two IPs are on the same subnet under a given mask
 */
function areOnSameSubnet(ipA, ipB, mask) {
  if (!isValidIPv4(ipA) || !isValidIPv4(ipB) || !isValidIPv4(mask)) return false;
  return getNetworkAddress(ipA, mask) === getNetworkAddress(ipB, mask);
}

/* ==========================================================================
   4. Device Factory & Graph Management
   ========================================================================== */

/**
 * Creates a new device with appropriate default configurations
 */
function createDevice(type, x, y, customConfig = {}) {
  AppState.counters[type] = (AppState.counters[type] || 0) + 1;
  const num = AppState.counters[type];
  const id = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  let device = {
    id,
    type,
    name: customConfig.name || `${type.toUpperCase()} ${num}`,
    x: Math.round(x),
    y: Math.round(y),
    ports: []
  };

  if (type === 'pc') {
    device.name = customConfig.name || `PC ${num}`;
    device.ip = customConfig.ip || `192.168.1.${10 + num}`;
    device.subnetMask = customConfig.subnetMask || '255.255.255.0';
    device.gateway = customConfig.gateway || '192.168.1.1';
    device.mac = `00:1A:2B:3C:4D:${String(num).padStart(2, '0')}`;
    device.ports = ['eth0'];
  } else if (type === 'switch') {
    device.name = customConfig.name || `Switch ${num}`;
    device.ports = ['Fa0/1', 'Fa0/2', 'Fa0/3', 'Fa0/4'];
  } else if (type === 'router') {
    device.name = customConfig.name || `Router ${num}`;
    device.interfaces = {
      eth0: {
        name: 'eth0 (Fa0/0)',
        ip: customConfig.eth0Ip || '192.168.1.1',
        subnetMask: customConfig.eth0Mask || '255.255.255.0'
      },
      eth1: {
        name: 'eth1 (Fa0/1)',
        ip: customConfig.eth1Ip || '192.168.2.1',
        subnetMask: customConfig.eth1Mask || '255.255.255.0'
      }
    };
    device.ports = ['eth0', 'eth1'];
  }

  // Merge any extra properties
  Object.assign(device, customConfig);

  AppState.devices.set(id, device);
  renderDeviceNode(device);
  updatePingSelectors();
  updateEmptyState();
  return device;
}

/**
 * Removes a device and all its attached connections
 */
function deleteDevice(deviceId) {
  // Remove associated connections
  AppState.connections = AppState.connections.filter(c => {
    return c.fromId !== deviceId && c.toId !== deviceId;
  });

  // Remove DOM node
  const nodeEl = document.getElementById(`node-${deviceId}`);
  if (nodeEl) nodeEl.remove();

  AppState.devices.delete(deviceId);

  if (AppState.selectedDeviceId === deviceId) {
    closeInspector();
  }

  renderCables();
  updatePingSelectors();
  updateEmptyState();
  showToast('Device removed from workspace.');
}

/**
 * Connects two devices with a cable
 */
function connectDevices(devAId, devBId) {
  if (devAId === devBId) {
    showToast('Cannot connect a device to itself.');
    return false;
  }

  const devA = AppState.devices.get(devAId);
  const devB = AppState.devices.get(devBId);
  if (!devA || !devB) return false;

  // Check if connection already exists between these devices
  const existing = AppState.connections.some(c => 
    (c.fromId === devAId && c.toId === devBId) || (c.fromId === devBId && c.toId === devAId)
  );
  if (existing) {
    showToast('These devices are already connected.');
    return false;
  }

  // Find free ports on both devices
  const freePortA = getNextFreePort(devA);
  const freePortB = getNextFreePort(devB);

  if (!freePortA) {
    showToast(`No free ports available on ${devA.name}.`);
    return false;
  }
  if (!freePortB) {
    showToast(`No free ports available on ${devB.name}.`);
    return false;
  }

  const connId = `conn_${Date.now()}_${++AppState.counters.conn}`;
  AppState.connections.push({
    id: connId,
    fromId: devAId,
    toId: devBId,
    fromPort: freePortA,
    toPort: freePortB
  });

  renderCables();
  showToast(`Connected ${devA.name} (${freePortA}) ➔ ${devB.name} (${freePortB})`);
  return true;
}

/**
 * Finds the first unused port on a device
 */
function getNextFreePort(device) {
  const usedPorts = new Set();
  AppState.connections.forEach(c => {
    if (c.fromId === device.id) usedPorts.add(c.fromPort);
    if (c.toId === device.id) usedPorts.add(c.toPort);
  });

  return device.ports.find(p => !usedPorts.has(p)) || null;
}

/**
 * Removes a specific connection by ID
 */
function deleteConnection(connId) {
  AppState.connections = AppState.connections.filter(c => c.id !== connId);
  renderCables();
  showToast('Cable connection removed.');
}

/* ==========================================================================
   5. Canvas Rendering: Devices & SVG Cables
   ========================================================================== */

/**
 * Renders or updates a device node on the canvas DOM layer
 */
function renderDeviceNode(device) {
  let nodeEl = document.getElementById(`node-${device.id}`);

  if (!nodeEl) {
    nodeEl = document.createElement('div');
    nodeEl.id = `node-${device.id}`;
    nodeEl.className = `node-element ${device.type}`;
    nodeEl.dataset.deviceId = device.id;

    // Inner icon and label structure
    nodeEl.innerHTML = `
      <div class="node-icon-box">
        <span class="node-led"></span>
        ${getDeviceSvgIcon(device.type)}
      </div>
      <div class="node-label">${escapeHtml(device.name)}</div>
      <div class="node-subtext">${getDeviceSubtext(device)}</div>
    `;

    DOM.canvasNodesLayer.appendChild(nodeEl);
    setupNodeDraggable(nodeEl, device);
    setupNodeEvents(nodeEl, device);
  } else {
    // Update labels
    nodeEl.querySelector('.node-label').textContent = device.name;
    nodeEl.querySelector('.node-subtext').textContent = getDeviceSubtext(device);
  }

  // Position node on canvas
  nodeEl.style.left = `${device.x}px`;
  nodeEl.style.top = `${device.y}px`;
}

/**
 * Returns inline SVG for device icon
 */
function getDeviceSvgIcon(type) {
  if (type === 'pc') {
    return `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="2" y="3" width="20" height="14" rx="2"></rect>
      <line x1="8" y1="21" x2="16" y2="21"></line>
      <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>`;
  } else if (type === 'switch') {
    return `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6">
      <rect x="2" y="6" width="20" height="12" rx="2"></rect>
      <line x1="6" y1="12" x2="18" y2="12"></line>
      <path d="M8 10l-2 2 2 2"></path>
      <path d="M16 10l2 2-2 2"></path>
    </svg>`;
  } else if (type === 'router') {
    return `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 7l-2 2h4l-2-2v10l-2-2h4l-2 2"></path>
      <path d="M7 12l2-2v4l-2-2h10l-2-2v4l2-2"></path>
    </svg>`;
  }
  return '';
}

/**
 * Returns badge subtext for device
 */
function getDeviceSubtext(device) {
  if (device.type === 'pc') return device.ip;
  if (device.type === 'switch') return 'Layer 2 Switch';
  if (device.type === 'router') return `${device.interfaces.eth0.ip} | ${device.interfaces.eth1.ip}`;
  return '';
}

/**
 * Renders all cables on the SVG layer
 */
function renderCables() {
  DOM.svgCablesLayer.innerHTML = '';

  AppState.connections.forEach(conn => {
    const devA = AppState.devices.get(conn.fromId);
    const devB = AppState.devices.get(conn.toId);
    if (!devA || !devB) return;

    // Calculate center coordinates
    const p1 = getNodeCenter(devA);
    const p2 = getNodeCenter(devB);

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`);
    pathEl.setAttribute('class', 'cable-path');
    pathEl.setAttribute('data-conn-id', conn.id);
    pathEl.setAttribute('title', `${devA.name} (${conn.fromPort}) ➔ ${devB.name} (${conn.toPort})`);

    // Click cable to delete when in delete mode
    pathEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (AppState.activeTool === 'delete') {
        deleteConnection(conn.id);
      }
    });

    pathEl.addEventListener('mouseenter', () => {
      if (AppState.activeTool === 'delete') {
        pathEl.classList.add('cable-delete-hover');
      }
    });
    pathEl.addEventListener('mouseleave', () => {
      pathEl.classList.remove('cable-delete-hover');
    });

    DOM.svgCablesLayer.appendChild(pathEl);
  });
}

/**
 * Returns center coordinates of device node (width = 110, height ≈ 75)
 */
function getNodeCenter(device) {
  return {
    x: device.x + 55,
    y: device.y + 35
  };
}

/**
 * Enables smooth mouse dragging for canvas device nodes
 */
function setupNodeDraggable(nodeEl, device) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let origX = 0;
  let origY = 0;

  nodeEl.addEventListener('mousedown', (e) => {
    if (AppState.activeTool === 'connect' || AppState.activeTool === 'delete') return;
    if (e.button !== 0) return; // Primary left button only

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    origX = device.x;
    origY = device.y;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Viewport boundaries
    const maxW = DOM.canvasViewport.clientWidth - 110;
    const maxH = DOM.canvasViewport.clientHeight - 80;

    device.x = Math.max(10, Math.min(maxW, origX + dx));
    device.y = Math.max(10, Math.min(maxH, origY + dy));

    nodeEl.style.left = `${device.x}px`;
    nodeEl.style.top = `${device.y}px`;

    // Redraw cables in real-time
    renderCables();
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
}

/**
 * Handles device click interactions (Select, Connect, Delete)
 */
function setupNodeEvents(nodeEl, device) {
  nodeEl.addEventListener('click', (e) => {
    e.stopPropagation();

    // 1. DELETE TOOL
    if (AppState.activeTool === 'delete') {
      deleteDevice(device.id);
      return;
    }

    // 2. CONNECT TOOL
    if (AppState.activeTool === 'connect') {
      handleConnectToolClick(device);
      return;
    }

    // 3. SELECT / INSPECT TOOL
    selectDevice(device.id);
  });
}

/**
 * Manages two-click connection logic
 */
function handleConnectToolClick(device) {
  if (!AppState.connectPendingSourceId) {
    // First device selected
    AppState.connectPendingSourceId = device.id;
    DOM.connectBannerText.textContent = `Selected: ${device.name}. Now click destination device.`;
    const nodeEl = document.getElementById(`node-${device.id}`);
    if (nodeEl) nodeEl.classList.add('connect-target');
  } else {
    // Second device selected
    const sourceId = AppState.connectPendingSourceId;
    connectDevices(sourceId, device.id);
    resetConnectMode();
  }
}

function resetConnectMode() {
  if (AppState.connectPendingSourceId) {
    const prevNode = document.getElementById(`node-${AppState.connectPendingSourceId}`);
    if (prevNode) prevNode.classList.remove('connect-target');
  }
  AppState.connectPendingSourceId = null;
  DOM.connectBanner.style.display = 'none';
  setTool('select');
}

/**
 * Selects a device and opens configuration inspector
 */
function selectDevice(deviceId) {
  AppState.selectedDeviceId = deviceId;
  const device = AppState.devices.get(deviceId);
  if (!device) return;

  // Clear previous selected rings
  document.querySelectorAll('.node-element.selected').forEach(el => el.classList.remove('selected'));
  const nodeEl = document.getElementById(`node-${deviceId}`);
  if (nodeEl) nodeEl.classList.add('selected');

  openInspector(device);
}

function updateEmptyState() {
  DOM.canvasEmptyState.style.display = (AppState.devices.size === 0) ? 'block' : 'none';
}

/* ==========================================================================
   6. Device Configuration Inspector
   ========================================================================== */

function openInspector(device) {
  DOM.deviceInspector.style.display = 'flex';
  DOM.inspectTitle.textContent = `${device.name} Config`;
  DOM.inspectIcon.textContent = device.type === 'pc' ? '💻' : device.type === 'switch' ? '🔀' : '🌐';

  let html = '';

  if (device.type === 'pc') {
    const net = getNetworkAddress(device.ip, device.subnetMask);
    const cidr = maskToCidr(device.subnetMask);

    html = `
      <div class="form-group-inspect">
        <label>Device Name:</label>
        <input type="text" id="inspect-name" class="input-inspect" value="${escapeHtml(device.name)}">
      </div>
      <div class="form-group-inspect">
        <label>IPv4 Address:</label>
        <input type="text" id="inspect-ip" class="input-inspect" value="${escapeHtml(device.ip)}">
      </div>
      <div class="form-group-inspect">
        <label>Subnet Mask:</label>
        <select id="inspect-mask" class="select-styled" style="width: 100%;">
          <option value="255.255.255.0" ${device.subnetMask === '255.255.255.0' ? 'selected' : ''}>255.255.255.0 (/24)</option>
          <option value="255.255.0.0" ${device.subnetMask === '255.255.0.0' ? 'selected' : ''}>255.255.0.0 (/16)</option>
          <option value="255.0.0.0" ${device.subnetMask === '255.0.0.0' ? 'selected' : ''}>255.0.0.0 (/8)</option>
        </select>
      </div>
      <div class="form-group-inspect">
        <label>Default Gateway (Router IP):</label>
        <input type="text" id="inspect-gateway" class="input-inspect" value="${escapeHtml(device.gateway || '')}" placeholder="e.g. 192.168.1.1">
      </div>
      <div class="inspect-card-box">
        <div style="font-size:0.72rem; color:var(--text-muted)">Subnet ID: <strong style="color:var(--cyan-bright)">${net}/${cidr}</strong></div>
        <div style="font-size:0.72rem; color:var(--text-muted)">MAC Address: <code>${device.mac}</code></div>
        <div style="font-size:0.72rem; color:var(--text-muted)">Port: <code>eth0 (${getConnectedPeer(device.id, 'eth0')})</code></div>
      </div>
      <button type="button" class="btn-inspect-save" id="btn-save-device-config">Save Configuration</button>
      <button type="button" class="btn-inspect-delete" id="btn-delete-device-config">Delete Device</button>
    `;
  } else if (device.type === 'router') {
    html = `
      <div class="form-group-inspect">
        <label>Router Name:</label>
        <input type="text" id="inspect-name" class="input-inspect" value="${escapeHtml(device.name)}">
      </div>

      <div class="inspect-section-title">Interface eth0 (Fa0/0)</div>
      <div class="form-group-inspect">
        <label>IP Address:</label>
        <input type="text" id="inspect-r-eth0-ip" class="input-inspect" value="${escapeHtml(device.interfaces.eth0.ip)}">
      </div>
      <div class="form-group-inspect">
        <label>Subnet Mask:</label>
        <select id="inspect-r-eth0-mask" class="select-styled" style="width:100%;">
          <option value="255.255.255.0" ${device.interfaces.eth0.subnetMask === '255.255.255.0' ? 'selected' : ''}>255.255.255.0 (/24)</option>
          <option value="255.255.0.0" ${device.interfaces.eth0.subnetMask === '255.255.0.0' ? 'selected' : ''}>255.255.0.0 (/16)</option>
        </select>
      </div>
      <div style="font-size:0.7rem; color:var(--text-dim)">Link: ${getConnectedPeer(device.id, 'eth0')}</div>

      <div class="inspect-section-title">Interface eth1 (Fa0/1)</div>
      <div class="form-group-inspect">
        <label>IP Address:</label>
        <input type="text" id="inspect-r-eth1-ip" class="input-inspect" value="${escapeHtml(device.interfaces.eth1.ip)}">
      </div>
      <div class="form-group-inspect">
        <label>Subnet Mask:</label>
        <select id="inspect-r-eth1-mask" class="select-styled" style="width:100%;">
          <option value="255.255.255.0" ${device.interfaces.eth1.subnetMask === '255.255.255.0' ? 'selected' : ''}>255.255.255.0 (/24)</option>
          <option value="255.255.0.0" ${device.interfaces.eth1.subnetMask === '255.255.0.0' ? 'selected' : ''}>255.255.0.0 (/16)</option>
        </select>
      </div>
      <div style="font-size:0.7rem; color:var(--text-dim)">Link: ${getConnectedPeer(device.id, 'eth1')}</div>

      <div class="inspect-card-box" style="margin-top:0.4rem;">
        <span style="font-size:0.72rem; font-weight:600; color:var(--emerald-bright);">Direct Connected Routes:</span>
        <div style="font-size:0.7rem; color:var(--text-muted)">C 192.168.1.0/24 is directly connected, eth0</div>
        <div style="font-size:0.7rem; color:var(--text-muted)">C 192.168.2.0/24 is directly connected, eth1</div>
      </div>

      <button type="button" class="btn-inspect-save" id="btn-save-device-config">Save Router Config</button>
      <button type="button" class="btn-inspect-delete" id="btn-delete-device-config">Delete Device</button>
    `;
  } else if (device.type === 'switch') {
    const links = device.ports.map(p => `<li><code>${p}</code>: ${getConnectedPeer(device.id, p)}</li>`).join('');

    html = `
      <div class="form-group-inspect">
        <label>Switch Name:</label>
        <input type="text" id="inspect-name" class="input-inspect" value="${escapeHtml(device.name)}">
      </div>

      <div class="inspect-section-title">Port Status &amp; MAC Table</div>
      <ul style="font-size:0.73rem; padding-left:1.1rem; color:var(--text-muted); display:flex; flex-direction:column; gap:0.3rem;">
        ${links}
      </ul>

      <div class="inspect-card-box" style="margin-top:0.5rem;">
        <span style="font-size:0.72rem; font-weight:600; color:#a5b4fc;">L2 Forwarding Logic:</span>
        <div style="font-size:0.7rem; color:var(--text-dim)">Floods broadcast/ARP frames across all active ports within the same broadcast domain.</div>
      </div>

      <button type="button" class="btn-inspect-save" id="btn-save-device-config">Save Switch Name</button>
      <button type="button" class="btn-inspect-delete" id="btn-delete-device-config">Delete Device</button>
    `;
  }

  DOM.inspectorBody.innerHTML = html;

  // Bind inspector actions
  document.getElementById('btn-save-device-config').addEventListener('click', () => saveDeviceConfig(device));
  document.getElementById('btn-delete-device-config').addEventListener('click', () => deleteDevice(device.id));
}

function getConnectedPeer(deviceId, port) {
  const conn = AppState.connections.find(c => 
    (c.fromId === deviceId && c.fromPort === port) || (c.toId === deviceId && c.toPort === port)
  );
  if (!conn) return '<span style="color:var(--text-dim)">Unplugged</span>';
  const peerId = conn.fromId === deviceId ? conn.toId : conn.fromId;
  const peer = AppState.devices.get(peerId);
  return peer ? `<strong style="color:var(--text-main)">${peer.name}</strong>` : 'Connected';
}

function saveDeviceConfig(device) {
  const nameInput = document.getElementById('inspect-name');
  if (nameInput) device.name = nameInput.value.trim() || device.name;

  if (device.type === 'pc') {
    const ip = document.getElementById('inspect-ip').value.trim();
    const mask = document.getElementById('inspect-mask').value;
    const gateway = document.getElementById('inspect-gateway').value.trim();

    if (!isValidIPv4(ip)) {
      showToast('Error: Invalid IPv4 address format.');
      return;
    }
    if (gateway && !isValidIPv4(gateway)) {
      showToast('Error: Invalid Default Gateway IP format.');
      return;
    }

    device.ip = ip;
    device.subnetMask = mask;
    device.gateway = gateway;

  } else if (device.type === 'router') {
    const eth0Ip = document.getElementById('inspect-r-eth0-ip').value.trim();
    const eth0Mask = document.getElementById('inspect-r-eth0-mask').value;
    const eth1Ip = document.getElementById('inspect-r-eth1-ip').value.trim();
    const eth1Mask = document.getElementById('inspect-r-eth1-mask').value;

    if (!isValidIPv4(eth0Ip) || !isValidIPv4(eth1Ip)) {
      showToast('Error: Router IP addresses must be valid IPv4.');
      return;
    }

    device.interfaces.eth0.ip = eth0Ip;
    device.interfaces.eth0.subnetMask = eth0Mask;
    device.interfaces.eth1.ip = eth1Ip;
    device.interfaces.eth1.subnetMask = eth1Mask;
  }

  renderDeviceNode(device);
  updatePingSelectors();
  showToast(`Saved configuration for ${device.name}.`);
  openInspector(device); // Refresh inspector view
}

function closeInspector() {
  DOM.deviceInspector.style.display = 'none';
  AppState.selectedDeviceId = null;
  document.querySelectorAll('.node-element.selected').forEach(el => el.classList.remove('selected'));
}

/* ==========================================================================
   7. Routing & Simulation Path Resolution Engine
   ========================================================================== */

/**
 * Builds physical adjacency graph representation: deviceId -> Set of peer deviceIds
 */
function buildPhysicalAdjacencyGraph() {
  const adj = new Map();
  AppState.devices.forEach((dev, id) => adj.set(id, new Set()));

  AppState.connections.forEach(conn => {
    if (adj.has(conn.fromId) && adj.has(conn.toId)) {
      adj.get(conn.fromId).add(conn.toId);
      adj.get(conn.toId).add(conn.fromId);
    }
  });

  return adj;
}

/**
 * Finds shortest physical path (via BFS) traversing through Layer 2 switches
 * without passing through routers (L2 broadcast domain search)
 */
function findL2Path(startId, endId, adj) {
  const queue = [[startId]];
  const visited = new Set([startId]);

  while (queue.length > 0) {
    const path = queue.shift();
    const currId = path[path.length - 1];

    if (currId === endId) return path;

    for (const neighborId of adj.get(currId) || []) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        const neighborDevice = AppState.devices.get(neighborId);
        // Only Layer 2 switches can transparently bridge frames in L2
        if (neighborId === endId || (neighborDevice && neighborDevice.type === 'switch')) {
          queue.push([...path, neighborId]);
        }
      }
    }
  }

  return null;
}

/**
 * Compiles discrete simulation steps for ping between Source and Destination PC
 */
function compileSimulationSteps(sourcePc, destPc) {
  const steps = [];
  const adj = buildPhysicalAdjacencyGraph();

  // Step 0: Packet generation at source
  steps.push({
    fromId: sourcePc.id,
    toId: sourcePc.id,
    layer: 'L3',
    badge: 'ICMP Echo',
    status: 'info',
    text: `${sourcePc.name} generated ICMP Echo Request targeted for ${destPc.ip}.`
  });

  // Check 1: Same subnet test
  const sameSubnet = areOnSameSubnet(sourcePc.ip, destPc.ip, sourcePc.subnetMask);

  if (sameSubnet) {
    // Both hosts are in the same subnet -> direct L2 delivery
    steps.push({
      fromId: sourcePc.id,
      toId: sourcePc.id,
      layer: 'L2',
      badge: 'ARP / Subnet',
      status: 'info',
      text: `Destination ${destPc.ip} is on the local subnet (${getNetworkAddress(sourcePc.ip, sourcePc.subnetMask)}). Attempting direct Layer 2 delivery.`
    });

    const l2Path = findL2Path(sourcePc.id, destPc.id, adj);

    if (!l2Path) {
      steps.push({
        fromId: sourcePc.id,
        toId: sourcePc.id,
        layer: 'L1',
        badge: 'Drop',
        status: 'error',
        text: `Destination Host Unreachable: No physical link or switch path connects ${sourcePc.name} to ${destPc.name}.`
      });
      return steps;
    }

    // Trace forward path
    for (let i = 0; i < l2Path.length - 1; i++) {
      const u = AppState.devices.get(l2Path[i]);
      const v = AppState.devices.get(l2Path[i + 1]);
      steps.push({
        fromId: u.id,
        toId: v.id,
        layer: v.type === 'switch' ? 'L2' : 'L3',
        badge: 'Forwarding',
        status: 'active',
        text: `Packet forwarded from ${u.name} ➔ ${v.name}.`
      });
    }

    // Destination received & creates reply
    steps.push({
      fromId: destPc.id,
      toId: destPc.id,
      layer: 'L3',
      badge: 'ICMP Reply',
      status: 'success',
      text: `${destPc.name} received Echo Request and generated ICMP Echo Reply.`
    });

    // Trace return path
    for (let i = l2Path.length - 1; i > 0; i--) {
      const u = AppState.devices.get(l2Path[i]);
      const v = AppState.devices.get(l2Path[i - 1]);
      steps.push({
        fromId: u.id,
        toId: v.id,
        layer: v.type === 'switch' ? 'L2' : 'L3',
        badge: 'Reply Hop',
        status: 'active',
        text: `Echo Reply forwarded from ${u.name} ➔ ${v.name}.`
      });
    }

    // Success final step
    steps.push({
      fromId: sourcePc.id,
      toId: sourcePc.id,
      layer: 'APP',
      badge: 'Success',
      status: 'success',
      text: `Ping Successful! ${sourcePc.name} received reply from ${destPc.ip} (Round-trip complete, 0% packet loss).`
    });

    return steps;
  }

  // Check 2: Different subnet -> Requires Router & Default Gateway
  steps.push({
    fromId: sourcePc.id,
    toId: sourcePc.id,
    layer: 'L3',
    badge: 'Routing Needed',
    status: 'warn',
    text: `Destination ${destPc.ip} is on a remote subnet (${getNetworkAddress(destPc.ip, destPc.subnetMask)}). Frame must be routed through Default Gateway.`
  });

  if (!sourcePc.gateway) {
    steps.push({
      fromId: sourcePc.id,
      toId: sourcePc.id,
      layer: 'L3',
      badge: 'Drop',
      status: 'error',
      text: `Destination Host Unreachable: ${sourcePc.name} has no Default Gateway configured to reach remote networks!`
    });
    return steps;
  }

  // Find router matching source gateway IP
  let router = null;
  let routerIngressIface = null;

  for (const dev of AppState.devices.values()) {
    if (dev.type === 'router') {
      if (dev.interfaces.eth0.ip === sourcePc.gateway) {
        router = dev;
        routerIngressIface = 'eth0';
        break;
      } else if (dev.interfaces.eth1.ip === sourcePc.gateway) {
        router = dev;
        routerIngressIface = 'eth1';
        break;
      }
    }
  }

  if (!router) {
    steps.push({
      fromId: sourcePc.id,
      toId: sourcePc.id,
      layer: 'L3',
      badge: 'Drop',
      status: 'error',
      text: `Request Timed Out: Default Gateway IP ${sourcePc.gateway} does not correspond to any active router on the topology.`
    });
    return steps;
  }

  // Is router physically reachable from source PC?
  const pathToRouter = findL2Path(sourcePc.id, router.id, adj);
  if (!pathToRouter) {
    steps.push({
      fromId: sourcePc.id,
      toId: sourcePc.id,
      layer: 'L1',
      badge: 'Drop',
      status: 'error',
      text: `Default Gateway Unreachable: No physical link connects ${sourcePc.name} to Router ${router.name}.`
    });
    return steps;
  }

  // Forward to Router
  for (let i = 0; i < pathToRouter.length - 1; i++) {
    const u = AppState.devices.get(pathToRouter[i]);
    const v = AppState.devices.get(pathToRouter[i + 1]);
    steps.push({
      fromId: u.id,
      toId: v.id,
      layer: v.type === 'switch' ? 'L2' : 'L3',
      badge: 'To Gateway',
      status: 'active',
      text: `Forwarded toward Gateway (${router.name}): ${u.name} ➔ ${v.name}.`
    });
  }

  // Router inspection & route lookup
  const routerEgressIface = (routerIngressIface === 'eth0') ? 'eth1' : 'eth0';
  const egressSubnet = getNetworkAddress(router.interfaces[routerEgressIface].ip, router.interfaces[routerEgressIface].subnetMask);
  const destSubnet = getNetworkAddress(destPc.ip, destPc.subnetMask);

  steps.push({
    fromId: router.id,
    toId: router.id,
    layer: 'L3',
    badge: 'Routing Decision',
    status: 'info',
    text: `${router.name} inspected packet header. Matching routing table: route to ${destSubnet} found on interface ${routerEgressIface}.`
  });

  if (egressSubnet !== destSubnet) {
    steps.push({
      fromId: router.id,
      toId: router.id,
      layer: 'L3',
      badge: 'Drop',
      status: 'error',
      text: `Destination Network Unreachable: ${router.name} has no connected interface or route to subnet ${destSubnet}.`
    });
    return steps;
  }

  // Path from router to destination PC
  const pathToDest = findL2Path(router.id, destPc.id, adj);
  if (!pathToDest) {
    steps.push({
      fromId: router.id,
      toId: router.id,
      layer: 'L1',
      badge: 'Drop',
      status: 'error',
      text: `Destination Unreachable: ${router.name} interface ${routerEgressIface} has no physical path to ${destPc.name}.`
    });
    return steps;
  }

  // Router forward to Destination
  for (let i = 0; i < pathToDest.length - 1; i++) {
    const u = AppState.devices.get(pathToDest[i]);
    const v = AppState.devices.get(pathToDest[i + 1]);
    steps.push({
      fromId: u.id,
      toId: v.id,
      layer: v.type === 'switch' ? 'L2' : 'L3',
      badge: 'Routed Egress',
      status: 'active',
      text: `Routed through ${routerEgressIface} ➔ ${v.name}.`
    });
  }

  // Destination PC received packet
  steps.push({
    fromId: destPc.id,
    toId: destPc.id,
    layer: 'L3',
    badge: 'ICMP Reply',
    status: 'success',
    text: `${destPc.name} received packet and generated Echo Reply.`
  });

  // Check if destination has gateway back to router
  if (destPc.gateway !== router.interfaces[routerEgressIface].ip) {
    steps.push({
      fromId: destPc.id,
      toId: destPc.id,
      layer: 'L3',
      badge: 'Drop',
      status: 'error',
      text: `Request Timed Out: ${destPc.name} cannot route reply back! Its gateway (${destPc.gateway || 'None'}) does not point to router ${router.interfaces[routerEgressIface].ip}.`
    });
    return steps;
  }

  // Return path from destination back to router
  for (let i = pathToDest.length - 1; i > 0; i--) {
    const u = AppState.devices.get(pathToDest[i]);
    const v = AppState.devices.get(pathToDest[i - 1]);
    steps.push({
      fromId: u.id,
      toId: v.id,
      layer: v.type === 'switch' ? 'L2' : 'L3',
      badge: 'Reply Return',
      status: 'active',
      text: `Echo Reply forwarded: ${u.name} ➔ ${v.name}.`
    });
  }

  // Router forward back to source
  for (let i = pathToRouter.length - 1; i > 0; i--) {
    const u = AppState.devices.get(pathToRouter[i]);
    const v = AppState.devices.get(pathToRouter[i - 1]);
    steps.push({
      fromId: u.id,
      toId: v.id,
      layer: v.type === 'switch' ? 'L2' : 'L3',
      badge: 'Reply to Source',
      status: 'active',
      text: `Echo Reply routed back: ${u.name} ➔ ${v.name}.`
    });
  }

  // Final Success
  steps.push({
    fromId: sourcePc.id,
    toId: sourcePc.id,
    layer: 'APP',
    badge: 'Routed Success',
    status: 'success',
    text: `Routed Ping Successful! Reply received from ${destPc.ip} via Gateway ${router.name} (0% loss).`
  });

  return steps;
}

/* ==========================================================================
   8. Simulation Playback Engine (Play, Pause, Step, Reset)
   ========================================================================== */

function startPingSimulation() {
  const srcId = DOM.pingSrcSelect.value;
  const destId = DOM.pingDestSelect.value;

  if (!srcId || !destId) {
    showToast('Please select both Source and Destination PCs.');
    return;
  }
  if (srcId === destId) {
    showToast('Please select two different PCs.');
    return;
  }

  const sourcePc = AppState.devices.get(srcId);
  const destPc = AppState.devices.get(destId);

  // Clear previous simulation
  resetSimulation();

  // Highlight source and destination on canvas
  document.querySelectorAll('.node-element').forEach(n => n.classList.remove('highlight-source', 'highlight-dest'));
  const srcNode = document.getElementById(`node-${srcId}`);
  const destNode = document.getElementById(`node-${destId}`);
  if (srcNode) srcNode.classList.add('highlight-source');
  if (destNode) destNode.classList.add('highlight-dest');

  // Compile hops
  const steps = compileSimulationSteps(sourcePc, destPc);
  AppState.simulation.steps = steps;
  AppState.simulation.currentStepIndex = 0;
  AppState.simulation.sourcePcId = srcId;
  AppState.simulation.destPcId = destId;

  // Clear event log
  clearEventLog();
  logEventMessage(`Initiated ICMP Echo Simulation: ${sourcePc.name} (${sourcePc.ip}) ➔ ${destPc.name} (${destPc.ip})`, 'info', 'ICMP');

  // Enable playback buttons
  DOM.btnSimPlay.disabled = false;
  DOM.btnSimPause.disabled = false;
  DOM.btnSimStep.disabled = false;
  DOM.btnSimReset.disabled = false;

  // Start playing
  playSimulation();
}

function playSimulation() {
  AppState.simulation.isRunning = true;
  AppState.simulation.isPaused = false;
  DOM.btnSimPlay.disabled = true;
  DOM.btnSimPause.disabled = false;
  DOM.simStatusPill.textContent = 'Running';
  DOM.simStatusPill.className = 'sim-status-pill playing';

  runNextStep();
}

function pauseSimulation() {
  AppState.simulation.isPaused = true;
  clearTimeout(AppState.simulation.timerId);
  DOM.btnSimPlay.disabled = false;
  DOM.btnSimPause.disabled = true;
  DOM.simStatusPill.textContent = 'Paused';
  DOM.simStatusPill.className = 'sim-status-pill paused';
}

function stepSimulation() {
  if (AppState.simulation.currentStepIndex >= AppState.simulation.steps.length) return;
  pauseSimulation();
  executeStep(AppState.simulation.currentStepIndex);
  AppState.simulation.currentStepIndex++;
}

function runNextStep() {
  if (!AppState.simulation.isRunning || AppState.simulation.isPaused) return;

  if (AppState.simulation.currentStepIndex >= AppState.simulation.steps.length) {
    // Finished
    finishSimulation();
    return;
  }

  executeStep(AppState.simulation.currentStepIndex);
  AppState.simulation.currentStepIndex++;

  AppState.simulation.timerId = setTimeout(() => {
    runNextStep();
  }, AppState.simulation.speedMs);
}

function executeStep(stepIndex) {
  const step = AppState.simulation.steps[stepIndex];
  if (!step) return;

  // Animate packet between devices if hopping
  if (step.fromId !== step.toId) {
    const devA = AppState.devices.get(step.fromId);
    const devB = AppState.devices.get(step.toId);
    if (devA && devB) {
      animatePacketNode(devA, devB, step.status === 'error' ? 'drop' : (step.badge.includes('Reply') ? 'reply' : 'request'));
    }
  }

  // Append to timeline log
  addTimelineEntry(step, stepIndex + 1);
}

function finishSimulation() {
  AppState.simulation.isRunning = false;
  DOM.btnSimPlay.disabled = false;
  DOM.btnSimPause.disabled = true;
  DOM.btnSimStep.disabled = true;
  DOM.simStatusPill.textContent = 'Completed';
  DOM.simStatusPill.className = 'sim-status-pill';

  if (AppState.simulation.activePacketEl) {
    AppState.simulation.activePacketEl.remove();
    AppState.simulation.activePacketEl = null;
  }
}

function resetSimulation() {
  clearTimeout(AppState.simulation.timerId);
  AppState.simulation.isRunning = false;
  AppState.simulation.isPaused = false;
  AppState.simulation.currentStepIndex = 0;
  AppState.simulation.steps = [];

  if (AppState.simulation.activePacketEl) {
    AppState.simulation.activePacketEl.remove();
    AppState.simulation.activePacketEl = null;
  }

  DOM.btnSimPlay.disabled = false;
  DOM.btnSimPause.disabled = true;
  DOM.btnSimStep.disabled = true;
  DOM.simStatusPill.textContent = 'Ready';
  DOM.simStatusPill.className = 'sim-status-pill';

  document.querySelectorAll('.node-element').forEach(n => n.classList.remove('highlight-source', 'highlight-dest'));
}

/**
 * Animates glowing packet between device nodes
 */
function animatePacketNode(devA, devB, type = 'request') {
  if (AppState.simulation.activePacketEl) {
    AppState.simulation.activePacketEl.remove();
  }

  const p1 = getNodeCenter(devA);
  const p2 = getNodeCenter(devB);

  const packet = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  packet.setAttribute('r', '7');
  packet.setAttribute('cx', p1.x);
  packet.setAttribute('cy', p1.y);
  packet.setAttribute('class', `packet-node ${type}`);
  DOM.svgPacketsLayer.appendChild(packet);
  AppState.simulation.activePacketEl = packet;

  const duration = Math.min(AppState.simulation.speedMs * 0.75, 800);
  const startTime = performance.now();

  function step(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const x = p1.x + (p2.x - p1.x) * progress;
    const y = p1.y + (p2.y - p1.y) * progress;
    packet.setAttribute('cx', x);
    packet.setAttribute('cy', y);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

/* ==========================================================================
   9. Event Log Presentation
   ========================================================================== */

function clearEventLog() {
  DOM.eventTimeline.innerHTML = '';
  DOM.eventLogEmpty.style.display = 'none';
  DOM.logCounter.textContent = '0 events';
}

function logEventMessage(msg, status = 'info', badge = 'L2') {
  addTimelineEntry({
    badge,
    layer: 'APP',
    status,
    text: msg
  }, '-');
}

function addTimelineEntry(step, hopNum) {
  DOM.eventLogEmpty.style.display = 'none';

  const item = document.createElement('div');
  item.className = `event-step-item ${step.status}`;

  const layerClass = step.layer === 'L2' ? 'layer-l2' : (step.layer === 'L3' ? 'layer-l3' : 'layer-app');

  item.innerHTML = `
    <span class="event-badge-hop">Hop ${hopNum}</span>
    <span class="event-badge-layer ${layerClass}">${step.badge}</span>
    <span class="event-text">${escapeHtml(step.text)}</span>
  `;

  DOM.eventTimeline.appendChild(item);
  DOM.bottomPanel.querySelector('.event-log-container').scrollTop = DOM.eventTimeline.scrollHeight;

  const total = DOM.eventTimeline.querySelectorAll('.event-step-item').length;
  DOM.logCounter.textContent = `${total} event${total === 1 ? '' : 's'}`;
}

/* ==========================================================================
   10. Starter Topologies Presets
   ========================================================================== */

function clearCanvas() {
  resetSimulation();
  closeInspector();
  AppState.devices.clear();
  AppState.connections = [];
  AppState.counters = { pc: 0, switch: 0, router: 0, conn: 0 };
  DOM.canvasNodesLayer.innerHTML = '';
  DOM.svgCablesLayer.innerHTML = '';
  clearEventLog();
  updatePingSelectors();
  updateEmptyState();
  showToast('Workspace reset to empty.');
}

/**
 * Starter 1: Single Subnet LAN (2 PCs + 1 Switch)
 */
function loadTopologyLan() {
  clearCanvas();

  const pc1 = createDevice('pc', 120, 180, { name: 'PC 1', ip: '192.168.1.10', gateway: '192.168.1.1' });
  const sw1 = createDevice('switch', 380, 180, { name: 'Switch 1' });
  const pc2 = createDevice('pc', 640, 180, { name: 'PC 2', ip: '192.168.1.20', gateway: '192.168.1.1' });

  connectDevices(pc1.id, sw1.id);
  connectDevices(pc2.id, sw1.id);

  DOM.pingSrcSelect.value = pc1.id;
  DOM.pingDestSelect.value = pc2.id;

  showToast('Loaded Starter Topology 1: Single Subnet LAN.');
}

/**
 * Starter 2: Multi-Subnet Routed (2 LANs + 1 Router)
 */
function loadTopologyRouted() {
  clearCanvas();

  // Subnet 1: 192.168.1.0/24
  const pc1 = createDevice('pc', 80, 180, { name: 'PC 1 (Sales)', ip: '192.168.1.10', gateway: '192.168.1.1' });
  const sw1 = createDevice('switch', 260, 180, { name: 'Switch 1' });

  // Central Router: eth0 (192.168.1.1), eth1 (192.168.2.1)
  const router = createDevice('router', 480, 180, {
    name: 'Router 1',
    eth0Ip: '192.168.1.1',
    eth1Ip: '192.168.2.1'
  });

  // Subnet 2: 192.168.2.0/24
  const sw2 = createDevice('switch', 700, 180, { name: 'Switch 2' });
  const pc2 = createDevice('pc', 880, 180, { name: 'PC 2 (Eng)', ip: '192.168.2.20', gateway: '192.168.2.1' });

  connectDevices(pc1.id, sw1.id);
  connectDevices(sw1.id, router.id);
  connectDevices(router.id, sw2.id);
  connectDevices(pc2.id, sw2.id);

  DOM.pingSrcSelect.value = pc1.id;
  DOM.pingDestSelect.value = pc2.id;

  showToast('Loaded Starter Topology 2: Multi-Subnet Routed Network.');
}

/**
 * Starter 3: Star Topology (3 PCs + Switch)
 */
function loadTopologyStar() {
  clearCanvas();

  const sw1 = createDevice('switch', 440, 200, { name: 'Core Switch' });
  const pc1 = createDevice('pc', 160, 100, { name: 'PC 1', ip: '192.168.1.11' });
  const pc2 = createDevice('pc', 160, 300, { name: 'PC 2', ip: '192.168.1.12' });
  const pc3 = createDevice('pc', 720, 200, { name: 'PC 3', ip: '192.168.1.13' });

  connectDevices(pc1.id, sw1.id);
  connectDevices(pc2.id, sw1.id);
  connectDevices(pc3.id, sw1.id);

  DOM.pingSrcSelect.value = pc1.id;
  DOM.pingDestSelect.value = pc3.id;

  showToast('Loaded Starter Topology 3: Star LAN.');
}

/**
 * Starter 4: Troubleshooting Lab (Misconfigured Subnets Without Gateway)
 */
function loadTopologyTroubleshoot() {
  clearCanvas();

  const pc1 = createDevice('pc', 180, 180, { name: 'PC 1', ip: '192.168.1.10', gateway: '' });
  const sw1 = createDevice('switch', 440, 180, { name: 'Switch 1' });
  const pc2 = createDevice('pc', 700, 180, { name: 'PC 2', ip: '192.168.2.20', gateway: '' }); // Different subnet!

  connectDevices(pc1.id, sw1.id);
  connectDevices(pc2.id, sw1.id);

  DOM.pingSrcSelect.value = pc1.id;
  DOM.pingDestSelect.value = pc2.id;

  showToast('Loaded Troubleshooting Lab: Different subnets on switch without a router. Ping will fail!');
}

/* ==========================================================================
   11. Local Storage Persistence
   ========================================================================== */

function saveTopologyToLocalStorage() {
  const data = {
    devices: Array.from(AppState.devices.values()),
    connections: AppState.connections,
    counters: AppState.counters
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    showToast('Topology saved to browser localStorage!');
  } catch (e) {
    showToast('Could not save topology to localStorage.');
  }
}

function loadTopologyFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      showToast('No saved network topology found in localStorage.');
      return;
    }

    const data = JSON.parse(raw);
    clearCanvas();

    AppState.counters = data.counters || { pc: 0, switch: 0, router: 0, conn: 0 };

    data.devices.forEach(d => {
      AppState.devices.set(d.id, d);
      renderDeviceNode(d);
    });

    AppState.connections = data.connections || [];
    renderCables();
    updatePingSelectors();
    updateEmptyState();
    showToast('Network topology loaded from localStorage.');
  } catch (e) {
    showToast('Error parsing saved topology data.');
  }
}

/* ==========================================================================
   12. UI Controls & Event Listeners
   ========================================================================== */

function setTool(toolName) {
  AppState.activeTool = toolName;
  DOM.toolSelect.classList.toggle('active', toolName === 'select');
  DOM.toolConnect.classList.toggle('active', toolName === 'connect');
  DOM.toolDelete.classList.toggle('active', toolName === 'delete');

  if (toolName === 'connect') {
    DOM.connectBanner.style.display = 'block';
    DOM.connectBannerText.textContent = 'Click first device to start cable...';
  } else {
    DOM.connectBanner.style.display = 'none';
    if (AppState.connectPendingSourceId) {
      const prev = document.getElementById(`node-${AppState.connectPendingSourceId}`);
      if (prev) prev.classList.remove('connect-target');
      AppState.connectPendingSourceId = null;
    }
  }
}

function updatePingSelectors() {
  const pcOptions = [];
  AppState.devices.forEach(d => {
    if (d.type === 'pc') {
      pcOptions.push(`<option value="${d.id}">${escapeHtml(d.name)} (${d.ip})</option>`);
    }
  });

  const prevSrc = DOM.pingSrcSelect.value;
  const prevDest = DOM.pingDestSelect.value;

  DOM.pingSrcSelect.innerHTML = `<option value="">Source PC...</option>${pcOptions.join('')}`;
  DOM.pingDestSelect.innerHTML = `<option value="">Destination PC...</option>${pcOptions.join('')}`;

  if (AppState.devices.has(prevSrc)) DOM.pingSrcSelect.value = prevSrc;
  if (AppState.devices.has(prevDest)) DOM.pingDestSelect.value = prevDest;
}

function showToast(msg) {
  DOM.toastNotification.textContent = msg;
  DOM.toastNotification.classList.add('show');
  clearTimeout(DOM.toastNotification._timer);
  DOM.toastNotification._timer = setTimeout(() => {
    DOM.toastNotification.classList.remove('show');
  }, 2400);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initEventHandlers() {
  // Tool selector buttons
  DOM.toolSelect.addEventListener('click', () => setTool('select'));
  DOM.toolConnect.addEventListener('click', () => setTool('connect'));
  DOM.toolDelete.addEventListener('click', () => setTool('delete'));

  DOM.btnCancelConnect.addEventListener('click', resetConnectMode);

  // Add Device Buttons
  DOM.addPcBtn.addEventListener('click', () => {
    const x = 60 + Math.random() * 200;
    const y = 80 + Math.random() * 150;
    const pc = createDevice('pc', x, y);
    selectDevice(pc.id);
  });

  DOM.addSwitchBtn.addEventListener('click', () => {
    const x = 320 + Math.random() * 120;
    const y = 80 + Math.random() * 150;
    const sw = createDevice('switch', x, y);
    selectDevice(sw.id);
  });

  DOM.addRouterBtn.addEventListener('click', () => {
    const x = 460 + Math.random() * 120;
    const y = 80 + Math.random() * 150;
    const r = createDevice('router', x, y);
    selectDevice(r.id);
  });

  // Starter Topologies Dropdown
  DOM.starterSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'lan') loadTopologyLan();
    else if (val === 'routed') loadTopologyRouted();
    else if (val === 'star') loadTopologyStar();
    else if (val === 'troubleshoot') loadTopologyTroubleshoot();
    e.target.value = '';
  });

  // Simulation controls
  DOM.btnStartPing.addEventListener('click', startPingSimulation);
  DOM.btnSimPlay.addEventListener('click', playSimulation);
  DOM.btnSimPause.addEventListener('click', pauseSimulation);
  DOM.btnSimStep.addEventListener('click', stepSimulation);
  DOM.btnSimReset.addEventListener('click', resetSimulation);

  DOM.simSpeedSelect.addEventListener('change', (e) => {
    AppState.simulation.speedMs = parseInt(e.target.value, 10);
  });

  // Local storage save/load
  DOM.btnSaveLocal.addEventListener('click', saveTopologyToLocalStorage);
  DOM.btnLoadLocal.addEventListener('click', loadTopologyFromLocalStorage);
  DOM.btnClearCanvas.addEventListener('click', () => {
    if (confirm('Clear the entire network canvas?')) {
      clearCanvas();
    }
  });

  // Inspector close
  DOM.btnCloseInspector.addEventListener('click', closeInspector);

  // Bottom panel toggle
  DOM.btnToggleLog.addEventListener('click', () => {
    const isCollapsed = DOM.bottomPanel.classList.toggle('collapsed');
    DOM.btnToggleLog.textContent = isCollapsed ? 'Expand' : 'Collapse';
  });

  DOM.btnClearLog.addEventListener('click', clearEventLog);

  // Click canvas background deselects
  DOM.canvasViewport.addEventListener('click', (e) => {
    if (e.target === DOM.canvasViewport || e.target === DOM.canvasSvg) {
      if (AppState.activeTool === 'connect' && AppState.connectPendingSourceId) {
        resetConnectMode();
      } else {
        closeInspector();
      }
    }
  });

  // Window resize realigns SVG cables
  window.addEventListener('resize', renderCables);

  // Keyboard shortcuts (V = Select, C = Connect, D = Delete)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 'c' || e.key === 'C') setTool('connect');
    if (e.key === 'd' || e.key === 'D') setTool('delete');
    if (e.key === 'Escape') {
      resetConnectMode();
      closeInspector();
    }
  });
}

/* ==========================================================================
   13. Bootstrap Initialization
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initEventHandlers();

  // Try loading saved topology from localStorage; otherwise load default Routed topology
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      loadTopologyFromLocalStorage();
    } catch (e) {
      loadTopologyRouted();
    }
  } else {
    loadTopologyRouted();
  }
});
