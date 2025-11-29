// ===== DOM 요소 가져오기 =====
const inputEl = document.getElementById("inputText");
const generateBtn = document.getElementById("generateBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const mapContainer = document.getElementById("mapContainer");

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
    throw new Error("Failed to parse level-json. Please check the JSON format.");
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

// ===== 맵 그리기 핵심 함수 =====
function drawLevelMap(layout) {
  const rooms = layout.rooms || [];
  const connections = layout.connections || [];

  if (!rooms.length) {
    throw new Error("No rooms found in level-json.");
  }

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

  // 배경 그리드 (옵션: 얕은 선)
  const bg = createSvgElement("rect", {
    x: 0,
    y: 0,
    width,
    height,
    fill: "#020617"
  });
  svg.appendChild(bg);

  // 간단한 그리드 선(시야용)
  const gridGroup = createSvgElement("g", { opacity: "0.2" });
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

  // 방 중심 좌표를 빠르게 찾기 위한 맵
  const roomCenterMap = new Map();

  // ===== 1) 방(Room) 그리기 =====
  const roomsGroup = createSvgElement("g");
  rooms.forEach((room) => {
    const rx = (room.x - minX) * SCALE + PADDING;
    const ry = (room.y - minY) * SCALE + PADDING;
    const rw = room.w * SCALE;
    const rh = room.h * SCALE;

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

    // 중심 좌표 저장(연결 선 그릴 때 활용)
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    roomCenterMap.set(room.id, { x: cx, y: cy });
  });
  svg.appendChild(roomsGroup);

  // ===== 2) 연결(Connections) 그리기 =====
  const connGroup = createSvgElement("g");
  connections.forEach((conn) => {
    const from = roomCenterMap.get(conn.from);
    const to = roomCenterMap.get(conn.to);
    if (!from || !to) return;

    const line = createSvgElement("line", {
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      stroke: "#e5e7eb",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-dasharray": conn.type === "corridor" ? "4 4" : "0"
    });
    connGroup.appendChild(line);

    // 간단한 화살표 (to 방향)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const arrowLen = 8;

    const ax = to.x - ux * 6; // 끝에서 조금 들어온 지점
    const ay = to.y - uy * 6;

    const arrow1 = createSvgElement("line", {
      x1: ax,
      y1: ay,
      x2: ax - uy * arrowLen + ux * arrowLen * 0.2,
      y2: ay + ux * arrowLen + uy * arrowLen * 0.2,
      stroke: "#e5e7eb",
      "stroke-width": 2,
      "stroke-linecap": "round"
    });
    const arrow2 = createSvgElement("line", {
      x1: ax,
      y1: ay,
      x2: ax + uy * arrowLen + ux * arrowLen * 0.2,
      y2: ay - ux * arrowLen + uy * arrowLen * 0.2,
      stroke: "#e5e7eb",
      "stroke-width": 2,
      "stroke-linecap": "round"
    });
    connGroup.appendChild(arrow1);
    connGroup.appendChild(arrow2);
  });
  svg.appendChild(connGroup);

  // 컨테이너 비우고 새 SVG 삽입
  mapContainer.innerHTML = "";
  mapContainer.appendChild(svg);
}

// ===== 버튼 클릭 핸들러 =====
function handleGenerate() {
  const text = inputEl.value;
  statusEl.textContent = "";
  mapContainer.innerHTML = "";

  if (!text.trim()) {
    statusEl.textContent = "Please paste the full level blueprint text first.";
    return;
  }

  try {
    statusEl.textContent = "Parsing level-json and drawing map...";
    const layout = extractLevelJsonBlock(text);
    drawLevelMap(layout);
    statusEl.textContent = "Done. Map generated from level-json.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error: " + err.message;
  }
}

// ===== Clear 버튼 =====
function handleClear() {
  inputEl.value = "";
  mapContainer.innerHTML = "";
  statusEl.textContent = "Cleared.";
}

// 이벤트 바인딩
generateBtn.addEventListener("click", handleGenerate);
clearBtn.addEventListener("click", handleClear);
