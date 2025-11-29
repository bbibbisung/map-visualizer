// ==========================
// map-visualizer/script.js
// ==========================

// ===== DOM 요소 가져오기 =====
const inputEl = document.getElementById("inputText");
const generateBtn = document.getElementById("generateBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const mapContainer = document.getElementById("mapContainer");

// 레이어 토글 요소
const toggleDoorsEl = document.getElementById("toggleDoors");
const toggleWindowsEl = document.getElementById("toggleWindows");
const togglePropsEl = document.getElementById("toggleProps");
const toggleEnemiesEl = document.getElementById("toggleEnemies");

// 툴팁 요소
const tooltipEl = document.getElementById("tooltip");

// 마지막으로 파싱된 레이아웃(레이어 토글 시 재사용)
let lastLayout = null;

// 방 타입별 색상 매핑
const ROOM_COLORS = {
  spawn: "#22c55e",   // green
  combat: "#f97316",  // orange
  puzzle: "#3b82f6",  // blue
  boss: "#ec4899",    // pink
  hub: "#a855f7",     // purple
  safe: "#a855f7",    // hub와 같은 색
  treasure: "#eab308",// yellow
  corridor: "#64748b",// slate
  default: "#9ca3af"  // gray
};

// 디테일 요소 색상
const FEATURE_COLORS = {
  door: "#facc15",       // 노란색
  window: "#7dd3fc",     // 밝은 파랑
  prop: "#f9a8d4",       // 핑크
  enemy: "#fb7185",      // 적 위치
  mainPath: "#e5e7eb"    // 메인 루트 강조선
};

// 프롭 카테고리별 크기(룸 로컬 그리드 단위 기준)
const PROP_SIZE_MAP = {
  crate_small: { w: 0.6, h: 0.6 },
  crate_large: { w: 1.0, h: 1.0 },
  cover_pillar: { w: 0.6, h: 0.6 },
  cover_wall: { w: 2.4, h: 0.6 },
  console: { w: 1.4, h: 0.8 },
  table: { w: 1.4, h: 0.8 },
  machine: { w: 1.6, h: 1.0 },
  default: { w: 0.8, h: 0.8 }
};

// ===== level-json 블록 추출 함수 =====
function extractLevelJsonBlock(text) {
  // ```level-json ... ``` 사이의 내용을 모두 캡처
  const regex = /```level-json([\s\S]*?)```/i;
  const match = text.match(regex);

  if (!match) {
    throw new Error("No ```level-json ... ``` block found in the text.");
  }

  const jsonText = match[1].trim();
  if (!jsonText) {
    throw new Error("The level-json block is empty.");
  }

  try {
    const obj = JSON.parse(jsonText);
    return obj;
  } catch (e) {
    console.error("JSON parse error:", e);
    throw new Error(
      "Failed to parse level-json. Please check JSON format (no trailing commas, valid JSON only)."
    );
  }
}

// ===== SVG 유틸 함수 =====
function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

// 현재 레이어 토글 상태 읽기
function getCurrentOptions() {
  return {
    showDoors: !toggleDoorsEl || toggleDoorsEl.checked,
    showWindows: !toggleWindowsEl || toggleWindowsEl.checked,
    showProps: !togglePropsEl || togglePropsEl.checked,
    showEnemies: !toggleEnemiesEl || toggleEnemiesEl.checked
  };
}

// ===== 맵 그리기 핵심 함수 =====
function drawLevelMap(layout, options = {}) {
  const {
    showDoors = true,
    showWindows = true,
    showProps = true,
    showEnemies = true
  } = options;

  const rooms = layout.rooms || [];
  const connections = layout.connections || [];

  // 새로 추가된 디테일 레이어(옵션)
  const doors = layout.doors || [];
  const windows = layout.windows || [];
  const props = layout.props || [];
  const enemySpawns = layout.enemySpawns || [];

  // --- 디버그 로그: 실제로 무엇이 들어왔는지 ---
  console.log("[Visualizer] layout:", layout);
  console.log(
    `[Visualizer] counts -> rooms: ${rooms.length}, doors: ${doors.length}, windows: ${windows.length}, props: ${props.length}, enemySpawns: ${enemySpawns.length}`
  );
  if (!rooms.length) {
    throw new Error("No rooms found in level-json.");
  }

  // 디버깅용 경고
  if (!doors.length) console.warn("[Visualizer] doors array is empty.");
  if (!windows.length) console.warn("[Visualizer] windows array is empty.");
  if (!props.length) console.warn("[Visualizer] props array is empty.");
  if (!enemySpawns.length) console.warn("[Visualizer] enemySpawns array is empty.");

  // 그리드 스케일(한 칸당 픽셀)
  const SCALE = 40;
  const PADDING = 40;

  // 전체 맵의 최소/최대 좌표 계산
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  rooms.forEach((room) => {
    const x1 = room.x;
    const y1 = room.y;
    const x2 = room.x + room.w;
    const y2 = room.y + room.h;
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  });

  if (!isFinite(minX) || !isFinite(minY)) {
    minX = 0;
    minY = 0;
    maxX = 10;
    maxY = 10;
  }

  const width = (maxX - minX) * SCALE + PADDING * 2;
  const height = (maxY - minY) * SCALE + PADDING * 2;

  // SVG 루트 생성
  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "xMidYMid meet"
  });

  // 배경
  const bg = createSvgElement("rect", {
    x: 0,
    y: 0,
    width,
    height,
    fill: "#020617"
  });
  svg.appendChild(bg);

  // 간단한 그리드 선(시야용)
  const gridGroup = createSvgElement("g", { opacity: "0.18" });
  const gridSpacing = SCALE;
  for (let x = PADDING; x <= width - PADDING; x += gridSpacing) {
    const line = createSvgElement("line", {
      x1: x,
      y1: PADDING,
      x2: x,
      y2: height - PADDING,
      stroke: "#1f2933",
      "stroke-width": 1
    });
    gridGroup.appendChild(line);
  }
  for (let y = PADDING; y <= height - PADDING; y += gridSpacing) {
    const line = createSvgElement("line", {
      x1: PADDING,
      y1: y,
      x2: width - PADDING,
      y2: y,
      stroke: "#1f2933",
      "stroke-width": 1
    });
    gridGroup.appendChild(line);
  }
  svg.appendChild(gridGroup);

  // 방 중심·기하 정보를 빠르게 찾기 위한 맵
  const roomCenterMap = new Map();
  const roomGeomMap = new Map();

  rooms.forEach((room) => {
    const rx = (room.x - minX) * SCALE + PADDING;
    const ry = (room.y - minY) * SCALE + PADDING;
    const rw = room.w * SCALE;
    const rh = room.h * SCALE;

    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    roomCenterMap.set(room.id, { x: cx, y: cy });
    roomGeomMap.set(room.id, { x: rx, y: ry, w: rw, h: rh });
  });

  // 방별 door 목록 캐싱
  const doorsByRoom = new Map();
  doors.forEach((door) => {
    if (!door.roomId) return;
    if (!doorsByRoom.has(door.roomId)) {
      doorsByRoom.set(door.roomId, []);
    }
    doorsByRoom.get(door.roomId).push(door);
  });

  // ===== Door 기하 계산 헬퍼 =====
  function computeDoorLine(door, geom) {
    const side = (door.side || "north").toLowerCase();
    const offset = typeof door.offset === "number" ? door.offset : 0.5;
    const len = 32;

    let x1, y1, x2, y2, cx, cy;

    if (side === "north") {
      cx = geom.x + geom.w * offset;
      cy = geom.y;
      x1 = cx - len / 2;
      x2 = cx + len / 2;
      y1 = y2 = cy;
    } else if (side === "south") {
      cx = geom.x + geom.w * offset;
      cy = geom.y + geom.h;
      x1 = cx - len / 2;
      x2 = cx + len / 2;
      y1 = y2 = cy;
    } else if (side === "west") {
      cy = geom.y + geom.h * offset;
      cx = geom.x;
      x1 = x2 = cx;
      y1 = cy - len / 2;
      y2 = cy + len / 2;
    } else {
      // east
      cy = geom.y + geom.h * offset;
      cx = geom.x + geom.w;
      x1 = x2 = cx;
      y1 = cy - len / 2;
      y2 = cy + len / 2;
    }

    return { x1, y1, x2, y2, cx, cy };
  }

  // ===== 연결선이 문에서 시작/끝나도록 Door 기준 포인트 계산 =====
  function getDoorCenterForConnection(roomId, targetRoomId) {
    const geom = roomGeomMap.get(roomId);
    const center = roomCenterMap.get(roomId);
    const targetCenter = roomCenterMap.get(targetRoomId);

    if (!geom || !center || !targetCenter) {
      return center || { x: 0, y: 0 };
    }

    const dx = targetCenter.x - center.x;
    const dy = targetCenter.y - center.y;

    // 어떤 방향으로 연결되는지에 따라 선호 side 결정
    let desiredSide;
    if (Math.abs(dx) > Math.abs(dy)) {
      desiredSide = dx >= 0 ? "east" : "west";
    } else {
      desiredSide = dy >= 0 ? "south" : "north";
    }

    const roomDoors = doorsByRoom.get(roomId) || [];
    let chosenDoor =
      roomDoors.find((d) => (d.side || "north").toLowerCase() === desiredSide) ||
      roomDoors[0];

    if (!chosenDoor) {
      // 문이 없으면 방 중심 사용
      return center;
    }

    const geomLine = computeDoorLine(chosenDoor, geom);
    return { x: geomLine.cx, y: geomLine.cy };
  }

  // ===== 1) 연결(Connections) 먼저 그리기 (문 기준) =====
  const connGroup = createSvgElement("g");
  connections.forEach((conn) => {
    const fromCenter = roomCenterMap.get(conn.from);
    const toCenter = roomCenterMap.get(conn.to);
    if (!fromCenter || !toCenter) return;

    const start = getDoorCenterForConnection(conn.from, conn.to);
    const end = getDoorCenterForConnection(conn.to, conn.from);

    const isMain = !!conn.mainPath; // mainPath: true 인 연결은 강조

    const line = createSvgElement("line", {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      stroke: isMain ? FEATURE_COLORS.mainPath : "#e5e7eb",
      "stroke-width": isMain ? 3 : 2,
      "stroke-linecap": "round",
      "stroke-dasharray": conn.type === "corridor" ? "4 4" : "0"
    });
    connGroup.appendChild(line);

    // 간단한 화살표 (to 방향)
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const arrowLen = 10;

    const ax = end.x - ux * 8; // 끝에서 조금 들어온 지점
    const ay = end.y - uy * 8;

    const arrow1 = createSvgElement("line", {
      x1: ax,
      y1: ay,
      x2: ax - uy * arrowLen + ux * arrowLen * 0.2,
      y2: ay + ux * arrowLen + uy * arrowLen * 0.2,
      stroke: isMain ? FEATURE_COLORS.mainPath : "#e5e7eb",
      "stroke-width": isMain ? 3 : 2,
      "stroke-linecap": "round"
    });
    const arrow2 = createSvgElement("line", {
      x1: ax,
      y1: ay,
      x2: ax + uy * arrowLen + ux * arrowLen * 0.2,
      y2: ay - ux * arrowLen + uy * arrowLen * 0.2,
      stroke: isMain ? FEATURE_COLORS.mainPath : "#e5e7eb",
      "stroke-width": isMain ? 3 : 2,
      "stroke-linecap": "round"
    });
    connGroup.appendChild(arrow1);
    connGroup.appendChild(arrow2);
  });
  svg.appendChild(connGroup);

  // ===== 2) 방(Room) 그리기 (연결선 위에 올라오게) =====
  const roomsGroup = createSvgElement("g");
  rooms.forEach((room) => {
    const geom = roomGeomMap.get(room.id);
    if (!geom) return;

    const rx = geom.x;
    const ry = geom.y;
    const rw = geom.w;
    const rh = geom.h;

    const type = (room.type || "default").toLowerCase();
    const fillColor = ROOM_COLORS[type] || ROOM_COLORS.default;

    // 방 사각형
    const rect = createSvgElement("rect", {
      x: rx,
      y: ry,
      width: rw,
      height: rh,
      fill: fillColor,
      "fill-opacity": 0.25,
      stroke: fillColor,
      "stroke-width": 2,
      rx: 8,
      ry: 8
    });

    // 방 툴팁
    rect.addEventListener("mouseenter", (e) => {
      const sizeText = `size: ${room.w} x ${room.h}`;
      const typeText = room.type ? `type: ${room.type}` : "type: (none)";
      const labelText = room.label || room.id || "(unnamed room)";
      showTooltip(`${labelText}\n${typeText}\n${sizeText}`, e.clientX, e.clientY);
    });
    rect.addEventListener("mousemove", (e) => {
      moveTooltip(e.clientX, e.clientY);
    });
    rect.addEventListener("mouseleave", () => {
      hideTooltip();
    });

    roomsGroup.appendChild(rect);

    // 방 레이블 텍스트
    const label = room.label || room.id || "";
    if (label) {
      const text = createSvgElement("text", {
        x: rx + rw / 2,
        y: ry + rh / 2,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": 12,
        "fill": "#e5e7eb"
      });
      text.textContent = label;
      roomsGroup.appendChild(text);
    }
  });
  svg.appendChild(roomsGroup);

  // ===== 3) 문(Doors) 그리기 =====
  if (showDoors && doors.length) {
    const doorsGroup = createSvgElement("g");
    doors.forEach((door) => {
      const geom = roomGeomMap.get(door.roomId);
      if (!geom) return;

      const dGeom = computeDoorLine(door, geom);

      const line = createSvgElement("line", {
        x1: dGeom.x1,
        y1: dGeom.y1,
        x2: dGeom.x2,
        y2: dGeom.y2,
        stroke: FEATURE_COLORS.door,
        "stroke-width": 5,
        "stroke-linecap": "round"
      });
      doorsGroup.appendChild(line);
    });
    svg.appendChild(doorsGroup);
  }

  // ===== 4) 창문(Windows) 그리기 =====
  if (showWindows && windows.length) {
    const windowsGroup = createSvgElement("g");
    windows.forEach((win) => {
      const geom = roomGeomMap.get(win.roomId);
      if (!geom) return;

      const side = (win.side || "north").toLowerCase();
      const offset = typeof win.offset === "number" ? win.offset : 0.5;

      let x1, y1, x2, y2;
      const len = 26;

      if (side === "north") {
        const cx = geom.x + geom.w * offset;
        const cy = geom.y;
        x1 = cx - len / 2;
        x2 = cx + len / 2;
        y1 = y2 = cy;
      } else if (side === "south") {
        const cx = geom.x + geom.w * offset;
        const cy = geom.y + geom.h;
        x1 = cx - len / 2;
        x2 = cx + len / 2;
        y1 = y2 = cy;
      } else if (side === "west") {
        const cy = geom.y + geom.h * offset;
        const cx = geom.x;
        x1 = x2 = cx;
        y1 = cy - len / 2;
        y2 = cy + len / 2;
      } else {
        // east
        const cy = geom.y + geom.h * offset;
        const cx = geom.x + geom.w;
        x1 = x2 = cx;
        y1 = cy - len / 2;
        y2 = cy + len / 2;
      }

      const line = createSvgElement("line", {
        x1,
        y1,
        x2,
        y2,
        stroke: FEATURE_COLORS.window,
        "stroke-width": 4,
        "stroke-linecap": "round",
        "stroke-dasharray": "4 3"
      });
      windowsGroup.appendChild(line);
    });
    svg.appendChild(windowsGroup);
  }

  // ===== 5) 프롭(Props) 그리기 (카테고리별 사이즈 적용) =====
  if (showProps && props.length) {
    const propsGroup = createSvgElement("g");
    props.forEach((prop) => {
      const geom = roomGeomMap.get(prop.roomId);
      if (!geom) return;

      const localX = typeof prop.x === "number" ? prop.x : (geom.w / SCALE) * 0.5;
      const localY = typeof prop.y === "number" ? prop.y : (geom.h / SCALE) * 0.5;

      const px = geom.x + localX * SCALE;
      const py = geom.y + localY * SCALE;

      const cat = (prop.category || "default").toLowerCase();
      const sizeCfg = PROP_SIZE_MAP[cat] || PROP_SIZE_MAP.default;

      const wPx = sizeCfg.w * SCALE;
      const hPx = sizeCfg.h * SCALE;

      const rect = createSvgElement("rect", {
        x: px - wPx / 2,
        y: py - hPx / 2,
        width: wPx,
        height: hPx,
        fill: FEATURE_COLORS.prop,
        "fill-opacity": 0.97,
        stroke: "#020617",
        "stroke-width": 2,
        rx: 4,
        ry: 4
      });

      // 프롭 툴팁
      rect.addEventListener("mouseenter", (e) => {
        const label = prop.category || "prop";
        const posText = `local: (${localX.toFixed(1)}, ${localY.toFixed(1)})`;
        showTooltip(`Prop: ${label}\n${posText}`, e.clientX, e.clientY);
      });
      rect.addEventListener("mousemove", (e) => {
        moveTooltip(e.clientX, e.clientY);
      });
      rect.addEventListener("mouseleave", () => {
        hideTooltip();
      });

      propsGroup.appendChild(rect);
    });
    svg.appendChild(propsGroup);
  }

  // ===== 6) 적 스폰(Enemy Spawns) 그리기 =====
  if (showEnemies && enemySpawns.length) {
    const enemyGroup = createSvgElement("g");
    enemySpawns.forEach((spawn) => {
      const geom = roomGeomMap.get(spawn.roomId);
      if (!geom) return;

      const localX = typeof spawn.x === "number" ? spawn.x : (geom.w / SCALE) * 0.5;
      const localY = typeof spawn.y === "number" ? spawn.y : (geom.h / SCALE) * 0.5;

      const ex = geom.x + localX * SCALE;
      const ey = geom.y + localY * SCALE;

      const r = 9; // 더 크게

      const circle = createSvgElement("circle", {
        cx: ex,
        cy: ey,
        r,
        fill: FEATURE_COLORS.enemy,
        "fill-opacity": 0.97,
        stroke: "#020617",
        "stroke-width": 2
      });

      // 툴팁
      circle.addEventListener("mouseenter", (e) => {
        const role = spawn.role || "enemy";
        const posText = `local: (${localX.toFixed(1)}, ${localY.toFixed(1)})`;
        showTooltip(`Enemy: ${role}\n${posText}`, e.clientX, e.clientY);
      });
      circle.addEventListener("mousemove", (e) => {
        moveTooltip(e.clientX, e.clientY);
      });
      circle.addEventListener("mouseleave", () => {
        hideTooltip();
      });

      enemyGroup.appendChild(circle);

      // 흰색 십자 표시
      const line1 = createSvgElement("line", {
        x1: ex - r + 1,
        y1: ey,
        x2: ex + r - 1,
        y2: ey,
        stroke: "#ffffff",
        "stroke-width": 2
      });
      const line2 = createSvgElement("line", {
        x1: ex,
        y1: ey - r + 1,
        x2: ex,
        y2: ey + r - 1,
        stroke: "#ffffff",
        "stroke-width": 2
      });
      enemyGroup.appendChild(line1);
      enemyGroup.appendChild(line2);
    });
    svg.appendChild(enemyGroup);
  }

  // 컨테이너 비우고 새 SVG 삽입
  mapContainer.innerHTML = "";
  mapContainer.appendChild(svg);
}

// ===== 툴팁 헬퍼 =====
function showTooltip(text, clientX, clientY) {
  if (!tooltipEl) return;
  tooltipEl.textContent = text;
  tooltipEl.classList.remove("hidden");
  moveTooltip(clientX, clientY);
}

function moveTooltip(clientX, clientY) {
  if (!tooltipEl || tooltipEl.classList.contains("hidden")) return;
  const offset = 12;
  tooltipEl.style.left = clientX + offset + "px";
  tooltipEl.style.top = clientY + offset + "px";
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.classList.add("hidden");
}

// ===== 버튼 클릭 핸들러 =====
function handleGenerate() {
  const text = inputEl.value;
  statusEl.textContent = "";
  mapContainer.innerHTML = "";
  hideTooltip();

  if (!text.trim()) {
    statusEl.textContent = "Please paste the full level blueprint text first.";
    return;
  }

  try {
    const layout = extractLevelJsonBlock(text);
    lastLayout = layout;

    const rooms = layout.rooms || [];
    const doors = layout.doors || [];
    const windows = layout.windows || [];
    const props = layout.props || [];
    const enemySpawns = layout.enemySpawns || [];

    statusEl.textContent =
      `Parsing level-json and drawing map... ` +
      `(rooms: ${rooms.length}, doors: ${doors.length}, windows: ${windows.length}, ` +
      `props: ${props.length}, enemySpawns: ${enemySpawns.length})`;

    drawLevelMap(layout, getCurrentOptions());

    statusEl.textContent =
      `Done. Map generated. ` +
      `(rooms: ${rooms.length}, doors: ${doors.length}, windows: ${windows.length}, ` +
      `props: ${props.length}, enemySpawns: ${enemySpawns.length})`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error: " + err.message;
  }
}

// 레이어 토글 시 재렌더링
function rerenderLast() {
  if (!lastLayout) return;
  try {
    const rooms = lastLayout.rooms || [];
    const doors = lastLayout.doors || [];
    const windows = lastLayout.windows || [];
    const props = lastLayout.props || [];
    const enemySpawns = lastLayout.enemySpawns || [];

    drawLevelMap(lastLayout, getCurrentOptions());

    statusEl.textContent =
      `View updated. ` +
      `(rooms: ${rooms.length}, doors: ${doors.length}, windows: ${windows.length}, ` +
      `props: ${props.length}, enemySpawns: ${enemySpawns.length})`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error while updating view: " + err.message;
  }
}

// ===== Clear 버튼 =====
function handleClear() {
  inputEl.value = "";
  mapContainer.innerHTML = "";
  statusEl.textContent = "Cleared.";
  lastLayout = null;
  hideTooltip();
}

// 이벤트 바인딩
generateBtn.addEventListener("click", handleGenerate);
clearBtn.addEventListener("click", handleClear);

if (toggleDoorsEl) toggleDoorsEl.addEventListener("change", rerenderLast);
if (toggleWindowsEl) toggleWindowsEl.addEventListener("change", rerenderLast);
if (togglePropsEl) togglePropsEl.addEventListener("change", rerenderLast);
if (toggleEnemiesEl) toggleEnemiesEl.addEventListener("change", rerenderLast);
