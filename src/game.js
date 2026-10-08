const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const TILE = 40;
const COLS = 24;
const ROWS = 16;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

canvas.width = WIDTH;
canvas.height = HEIGHT;

const keys = {};
const bombs = [];
const explosions = [];
const bubbles = [];

const player = {
    x: 1,
    y: 1,
    speed: 4,
    maxBombs: 1,
    activeBombs: 0,
    state: "normal",
    bubbleTimer: 0
};

const enemy = {
    x: COLS - 3,
    y: ROWS - 3,
    state: "normal",
    bubbleTimer: 0
};

// 0 = floor, 1 = solid wall, 2 = breakable block
const map = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => {
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) return 1;
        if (x % 2 === 0 && y % 2 === 0) return 1;
        return 0;
    })
);

for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
        if (map[y][x] !== 0) continue;
        if ((x <= 3 && y <= 3) || (x >= COLS - 4 && y >= ROWS - 4)) continue;
        if (Math.random() < 0.48) map[y][x] = 2;
    }
}

function tileOf(value) {
    return Math.round(value);
}

function isBlockedTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    return map[ty][tx] !== 0;
}

function canMove(nx, ny) {
    const r = 11;
    const left = Math.floor((nx - r) / TILE);
    const right = Math.floor((nx + r) / TILE);
    const top = Math.floor((ny - r) / TILE);
    const bottom = Math.floor((ny + r) / TILE);

    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            if (isBlockedTile(x, y)) return false;
        }
    }

    for (const bomb of bombs) {
        const cx = bomb.x * TILE + TILE / 2;
        const cy = bomb.y * TILE + TILE / 2;
        if (Math.abs(nx - cx) < TILE * 0.35 && Math.abs(ny - cy) < TILE * 0.35) {
            return false;
        }
    }

    return true;
}

function movePlayer(dx, dy) {
    if (player.state !== "normal") return;

    const nx = player.x * TILE + TILE / 2 + dx;
    const ny = player.y * TILE + TILE / 2 + dy;

    if (canMove(nx, ny)) {
        player.x = (nx - TILE / 2) / TILE;
        player.y = (ny - TILE / 2) / TILE;
    }
}

function placeBomb() {
    if (player.state !== "normal") return;
    if (player.activeBombs >= player.maxBombs) return;

    const bx = tileOf(player.x);
    const by = tileOf(player.y);

    if (bombs.some(b => b.x === bx && b.y === by)) return;

    bombs.push({ x: bx, y: by, timer: 1800 });
    player.activeBombs++;
}

function createBubble(target) {
    target.state = "bubble";
    target.bubbleTimer = 4500;

    bubbles.push({
        target,
        x: tileOf(target.x),
        y: tileOf(target.y),
        timer: 4500
    });
}

function rescueBubble(target) {
    const bubble = bubbles.find(b => b.target === target);
    if (!bubble) return;

    target.state = "normal";
    target.bubbleTimer = 0;
    bubbles.splice(bubbles.indexOf(bubble), 1);
}

function popBubble(target) {
    const bubble = bubbles.find(b => b.target === target);
    if (!bubble) return;

    target.state = "defeated";
    target.bubbleTimer = 0;
    bubbles.splice(bubbles.indexOf(bubble), 1);
}

function checkExplosionHits(cells) {
    const px = tileOf(player.x);
    const py = tileOf(player.y);

    if (player.state === "normal" && cells.some(c => c.x === px && c.y === py)) {
        createBubble(player);
    }

    const ex = tileOf(enemy.x);
    const ey = tileOf(enemy.y);

    if (enemy.state === "normal" && cells.some(c => c.x === ex && c.y === ey)) {
        createBubble(enemy);
    }
}

function explodeBomb(bomb) {
    if (bomb.exploded) return;

    bomb.exploded = true;
    player.activeBombs = Math.max(0, player.activeBombs - 1);

    const cells = [{ x: bomb.x, y: bomb.y }];
    const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 }
    ];

    for (const dir of dirs) {
        for (let i = 1; i <= 3; i++) {
            const x = bomb.x + dir.x * i;
            const y = bomb.y + dir.y * i;

            if (x < 0 || y < 0 || x >= COLS || y >= ROWS) break;
            if (map[y][x] === 1) break;

            cells.push({ x, y });

            if (map[y][x] === 2) {
                map[y][x] = 0;
                break;
            }
        }
    }

    explosions.push({ cells, timer: 500 });

    for (const other of bombs) {
        if (other === bomb || other.exploded) continue;
        if (cells.some(c => c.x === other.x && c.y === other.y)) {
            other.timer = 0;
        }
    }

    checkExplosionHits(cells);
}

function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i];
        bubble.timer -= dt;
        bubble.target.bubbleTimer = bubble.timer;

        if (bubble.timer <= 0) {
            bubble.target.state = "defeated";
            bubbles.splice(i, 1);
        }
    }

    // The player can rescue the enemy bubble by standing on it.
    if (enemy.state === "bubble" && player.state === "normal") {
        if (tileOf(player.x) === tileOf(enemy.x) && tileOf(player.y) === tileOf(enemy.y)) {
            popBubble(enemy);
        }
    }
}

function update(dt) {
    if (player.state === "normal") {
        let dx = 0;
        let dy = 0;

        if (keys["ArrowLeft"] || keys["a"]) dx -= player.speed * dt / 16;
        if (keys["ArrowRight"] || keys["d"]) dx += player.speed * dt / 16;
        if (keys["ArrowUp"] || keys["w"]) dy -= player.speed * dt / 16;
        if (keys["ArrowDown"] || keys["s"]) dy += player.speed * dt / 16;

        if (dx && dy) {
            dx *= 0.707;
            dy *= 0.707;
        }

        movePlayer(dx, 0);
        movePlayer(0, dy);
    }

    for (let i = bombs.length - 1; i >= 0; i--) {
        bombs[i].timer -= dt;

        if (bombs[i].timer <= 0) {
            explodeBomb(bombs[i]);
            bombs.splice(i, 1);
        }
    }

    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].timer -= dt;
        if (explosions[i].timer <= 0) explosions.splice(i, 1);
    }

    updateBubbles(dt);
}

function drawMap() {
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const px = x * TILE;
            const py = y * TILE;

            ctx.fillStyle = (x + y) % 2 ? "#77a95a" : "#6fa052";
            ctx.fillRect(px, py, TILE, TILE);

            if (map[y][x] === 1) {
                ctx.fillStyle = "#34495e";
                ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
                ctx.fillStyle = "#52687b";
                ctx.fillRect(px + 6, py + 6, TILE - 12, 8);
            } else if (map[y][x] === 2) {
                ctx.fillStyle = "#a87542";
                ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
                ctx.fillStyle = "#d19a5a";
                ctx.fillRect(px + 7, py + 7, TILE - 14, 7);
            }

            ctx.strokeStyle = "rgba(0,0,0,.08)";
            ctx.strokeRect(px, py, TILE, TILE);
        }
    }
}

function drawBombs() {
    for (const bomb of bombs) {
        const cx = bomb.x * TILE + TILE / 2;
        const cy = bomb.y * TILE + TILE / 2;

        ctx.fillStyle = "#171717";
        ctx.beginPath();
        ctx.arc(cx, cy + 2, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#e74c3c";
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 4, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f1c40f";
        ctx.fillRect(cx + 6, cy - 18, 5, 8);
    }
}

function drawExplosions() {
    for (const explosion of explosions) {
        const alpha = Math.max(0, explosion.timer / 500);

        for (const cell of explosion.cells) {
            const px = cell.x * TILE;
            const py = cell.y * TILE;

            ctx.fillStyle = "rgba(52, 152, 219," + (0.35 + alpha * 0.45) + ")";
            ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);

            ctx.strokeStyle = "rgba(255,255,255," + alpha + ")";
            ctx.lineWidth = 3;
            ctx.strokeRect(px + 6, py + 6, TILE - 12, TILE - 12);
        }
    }
}

function drawCharacter(target, bodyColor, faceColor) {
    if (target.state === "defeated") return;

    const cx = target.x * TILE + TILE / 2;
    const cy = target.y * TILE + TILE / 2;

    if (target.state === "bubble") {
        ctx.fillStyle = "rgba(120,210,255,.65)";
        ctx.beginPath();
        ctx.arc(cx, cy, 17, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(Math.ceil(target.bubbleTimer / 1000), cx, cy + 4);
        ctx.textAlign = "left";
        return;
    }

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = faceColor;
    ctx.beginPath();
    ctx.arc(cx, cy - 3, 9, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = "#222";
    ctx.fillRect(cx - 6, cy - 2, 3, 5);
    ctx.fillRect(cx + 3, cy - 2, 3, 5);
}

function drawHud() {
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.fillRect(0, 0, WIDTH, 34);

    ctx.fillStyle = "#fff";
    ctx.font = "16px Arial, Microsoft JhengHei";
    ctx.fillText("彈水阿給 Prototype 2", 12, 22);
    ctx.fillText("方向鍵/WASD：移動    SPACE：放水球", 260, 22);

    if (enemy.state === "defeated") {
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = "bold 42px Arial, Microsoft JhengHei";
        ctx.fillText("勝利！", WIDTH / 2, HEIGHT / 2);
        ctx.font = "20px Arial, Microsoft JhengHei";
        ctx.fillText("你成功把對手的水泡刺破了", WIDTH / 2, HEIGHT / 2 + 38);
        ctx.textAlign = "left";
    }

    if (player.state === "defeated") {
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.font = "bold 42px Arial, Microsoft JhengHei";
        ctx.fillText("遊戲結束", WIDTH / 2, HEIGHT / 2);
        ctx.font = "20px Arial, Microsoft JhengHei";
        ctx.fillText("水泡沒有被及時救援", WIDTH / 2, HEIGHT / 2 + 38);
        ctx.textAlign = "left";
    }
}

function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawMap();
    drawExplosions();
    drawBombs();
    drawCharacter(enemy, "#e67e22", "#f5cba7");
    drawCharacter(player, "#3498db", "#f7f7f7");
    drawHud();
}

let last = performance.now();

function loop(now) {
    const dt = Math.min(40, now - last);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
}

window.addEventListener("keydown", e => {
    keys[e.key] = true;

    if (e.code === "Space") {
        e.preventDefault();
        placeBomb();
    }
});

window.addEventListener("keyup", e => {
    keys[e.key] = false;
});

requestAnimationFrame(loop);
