// ----- DOM Elements -----
const mainCanvas = document.getElementById('tetrisCanvas');
const nextCanvas = document.getElementById('nextMinoCanvas');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const linesElement = document.getElementById('lines');
const statusElement = document.getElementById('status');
const gameOverMessage = document.getElementById('game-over-message');

// ----- 3D Scene Setup -----
let scene, camera, renderer, controls;
let nextScene, nextCamera, nextRenderer;

// Game constants
const COLS = 7;
const ROWS = 20;
const DEPTH = 7;
const BLOCK_SIZE = 1;

// ----- Game State -----
let board = [];
let dropInterval;
let dropSpeed = 1000;
let score = 0;
let level = 1;
let lines = 0; // Layers cleared
let currentMino;
let nextMino;
let isPaused = false;
let isGameOver = true;

// Mino representation (using relative coordinates from a pivot)
const TETROMINOS = {
    'I': { shape: [[0, -1, 0], [0, 0, 0], [0, 1, 0], [0, 2, 0]], color: 0x00ffff },
    'J': { shape: [[-1, 1, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0]], color: 0x0000ff },
    'L': { shape: [[1, 1, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0]], color: 0xffa500 },
    'O': { shape: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], color: 0xffff00 },
    'S': { shape: [[0, 0, 0], [1, 0, 0], [-1, 1, 0], [0, 1, 0]], color: 0x00ff00 },
    'T': { shape: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]], color: 0x800080 },
    'Z': { shape: [[-1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], color: 0xff0000 }
};
const TETROMINO_KEYS = Object.keys(TETROMINOS);

// Cubes on the board for rendering
let boardCubes = [];
let currentMinoCubes = [];
let nextMinoCubes = [];

// ----- Initialization -----
function init() {
    // Main scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, mainCanvas.width / mainCanvas.height, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: mainCanvas, antialias: true });
    renderer.setSize(mainCanvas.width, mainCanvas.height);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 15);
    scene.add(directionalLight);

    // Camera position and controls
    camera.position.set(COLS / 2, ROWS / 2, 25);
    camera.lookAt(COLS / 2, ROWS / 2, 0);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(COLS / 2, ROWS / 2, DEPTH / 2);
    controls.update();
    
    // Next mino scene
    nextScene = new THREE.Scene();
    nextCamera = new THREE.PerspectiveCamera(75, nextCanvas.width / nextCanvas.height, 0.1, 1000);
    nextRenderer = new THREE.WebGLRenderer({ canvas: nextCanvas, antialias: true });
    nextRenderer.setSize(nextCanvas.width, nextCanvas.height);
    nextCamera.position.set(0, 0, 5);
    const nextAmbientLight = new THREE.AmbientLight(0xffffff, 0.8);
    nextScene.add(nextAmbientLight);
    const nextDirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    nextDirLight.position.set(5, 5, 5);
    nextScene.add(nextDirLight);
    
    // Game board grid helper
    const gridHelper = new THREE.GridHelper(COLS, DEPTH); // サイズを(COLS, DEPTH)に修正
    gridHelper.position.set(COLS / 2 - 0.5, -0.5, DEPTH / 2 -0.5);
    // gridHelper.rotation.x = Math.PI / 2; // ★★★ この行を削除しました ★★★
    scene.add(gridHelper);

    // Board outline
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(COLS, ROWS, DEPTH));
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    line.position.set(COLS / 2 - 0.5, ROWS / 2 - 0.5, DEPTH / 2 - 0.5);
    scene.add(line);
    
    initBoard();
    animate();
    endGame();
}

function initBoard() {
    board = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => Array(DEPTH).fill(0))
    );
}

// ----- 3D Object Management -----
function createCube(color, x, y, z) {
    const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    const material = new THREE.MeshStandardMaterial({ color });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(x, y, z);
    return cube;
}

function clearScene(targetScene, cubeArray) {
    for (const cube of cubeArray) {
        targetScene.remove(cube);
    }
    cubeArray.length = 0;
}

// ----- Game Logic -----
function startGame() {
    initBoard();
    score = 0;
    level = 1;
    lines = 0;
    updateInfo();
    isPaused = false;
    isGameOver = false;
    dropSpeed = 1000;
    gameOverMessage.classList.add('hidden');
    statusElement.innerText = 'Playing';
    
    clearScene(scene, boardCubes);

    nextMino = createRandomMino();
    generateNewMino();
    
    startGameLoop();
}

function endGame() {
    isGameOver = true;
    clearInterval(dropInterval);
    currentMino = null;
    clearScene(scene, boardCubes);
    clearScene(scene, currentMinoCubes);
    clearScene(nextScene, nextMinoCubes);
    initBoard();

    score = 0;
    level = 1;
    lines = 0;
    updateInfo();
    isPaused = false;
    dropSpeed = 1000;
    gameOverMessage.classList.add('hidden');
    statusElement.innerText = 'Ready';
    document.getElementById('pauseButton').innerText = 'PAUSE';
}

function createRandomMino() {
    const key = TETROMINO_KEYS[Math.floor(Math.random() * TETROMINO_KEYS.length)];
    const minoData = TETROMINOS[key];
    return {
        shape: minoData.shape.map(p => [...p]), // Deep copy
        color: minoData.color,
        position: {
            x: Math.floor(COLS / 2),
            y: ROWS - 2, // Start from top
            z: Math.floor(DEPTH / 2)
        }
    };
}

function generateNewMino() {
    currentMino = nextMino;
    nextMino = createRandomMino();
    drawNextMino();
    
    if (checkCollision(currentMino.position, currentMino.shape)) {
        gameOver();
    }
}

function dropMino() {
    if (isPaused || isGameOver) return;

    const newPos = { ...currentMino.position, y: currentMino.position.y - 1 };
    if (!checkCollision(newPos, currentMino.shape)) {
        currentMino.position.y--;
    } else {
        fixMinoToBoard();
        checkLayerClears();
        generateNewMino();
    }
}

function fixMinoToBoard() {
    const { position, shape, color } = currentMino;
    shape.forEach(p => {
        const x = position.x + p[0];
        const y = position.y + p[1];
        const z = position.z + p[2];
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS && z >= 0 && z < DEPTH) {
            board[y][x][z] = color;
            boardCubes.push(createCube(color, x, y, z));
        }
    });
}

function hardDrop() {
    while (!checkCollision({ ...currentMino.position, y: currentMino.position.y - 1 }, currentMino.shape)) {
        currentMino.position.y--;
    }
    dropMino();
}

function checkCollision(pos, shape) {
    for (const p of shape) {
        const x = pos.x + p[0];
        const y = pos.y + p[1];
        const z = pos.z + p[2];

        if (x < 0 || x >= COLS || y < 0 || z < 0 || z >= DEPTH) {
            return true; // Wall/Floor/Boundary collision
        }
        if (y < ROWS && board[y][x][z] !== 0) {
            return true; // Collision with existing blocks
        }
    }
    return false;
}

function checkLayerClears() {
    let layersCleared = 0;
    for (let y = 0; y < ROWS; y++) {
        let isLayerFull = true;
        for (let x = 0; x < COLS; x++) {
            for (let z = 0; z < DEPTH; z++) {
                if (board[y][x][z] === 0) {
                    isLayerFull = false;
                    break;
                }
            }
            if (!isLayerFull) break;
        }

        if (isLayerFull) {
            layersCleared++;
            // Remove the layer and shift everything above it down
            board.splice(y, 1);
            board.push(Array.from({ length: COLS }, () => Array(DEPTH).fill(0)));
            y--; // Re-check the same y-index as layers have shifted
        }
    }
    if (layersCleared > 0) {
        lines += layersCleared;
        updateScore(layersCleared);
    }
}

function updateScore(cleared) {
    const layerScore = [0, 400, 1000, 3000, 12000]; // Higher score for 3D
    score += (layerScore[cleared] || layerScore[4]) * level;
    
    const newLevel = Math.floor(lines / 5) + 1; // Level up every 5 layers
    if (newLevel > level) {
        level = newLevel;
        if (dropSpeed > 100) {
            dropSpeed = Math.max(100, 1000 - (level - 1) * 50);
        }
        startGameLoop();
    }
    updateInfo();
}

function updateInfo() {
    scoreElement.innerText = score;
    levelElement.innerText = level;
    linesElement.innerText = lines;
}

function gameOver() {
    isGameOver = true;
    clearInterval(dropInterval);
    gameOverMessage.classList.remove('hidden');
    statusElement.innerText = 'Game Over';
}

function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    if (isPaused) {
        clearInterval(dropInterval);
        statusElement.innerText = 'Paused';
        document.getElementById('pauseButton').innerText = 'RESUME';
    } else {
        startGameLoop();
        statusElement.innerText = 'Playing';
        document.getElementById('pauseButton').innerText = 'PAUSE';
    }
}

function startGameLoop() {
    clearInterval(dropInterval);
    dropInterval = setInterval(dropMino, dropSpeed);
}

// ----- Rotation Logic -----
function rotateMino(axis, angle) {
    if (isPaused || isGameOver) return;

    const angleRad = angle * (Math.PI / 180);
    const rotationMatrix = new THREE.Matrix4();
    if (axis === 'x') rotationMatrix.makeRotationX(angleRad);
    if (axis === 'y') rotationMatrix.makeRotationY(angleRad);
    if (axis === 'z') rotationMatrix.makeRotationZ(angleRad);

    const newShape = currentMino.shape.map(p => {
        const vector = new THREE.Vector3(p[0], p[1], p[2]);
        vector.applyMatrix4(rotationMatrix);
        return [Math.round(vector.x), Math.round(vector.y), Math.round(vector.z)];
    });

    if (!checkCollision(currentMino.position, newShape)) {
        currentMino.shape = newShape;
    }
}


// ----- Drawing / Rendering -----
function drawCurrentMino() {
    clearScene(scene, currentMinoCubes);
    if (!currentMino || isGameOver) return;
    
    const { position, shape, color } = currentMino;
    shape.forEach(p => {
        const x = position.x + p[0];
        const y = position.y + p[1];
        const z = position.z + p[2];
        const cube = createCube(color, x, y, z);
        currentMinoCubes.push(cube);
        scene.add(cube);
    });
}

function drawBoard() {
    clearScene(scene, boardCubes);
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            for (let z = 0; z < DEPTH; z++) {
                if (board[y][x][z] !== 0) {
                    const cube = createCube(board[y][x][z], x, y, z);
                    boardCubes.push(cube);
                    scene.add(cube);
                }
            }
        }
    }
}

function drawNextMino() {
    clearScene(nextScene, nextMinoCubes);
    if (!nextMino) return;

    const { shape, color } = nextMino;
    shape.forEach(p => {
        const cube = createCube(color, p[0], p[1], p[2]);
        nextMinoCubes.push(cube);
        nextScene.add(cube);
    });
}

function animate() {
    requestAnimationFrame(animate);

    if (!isPaused && !isGameOver) {
        // Redraw current mino in every frame for smooth movement
        drawCurrentMino();
    }
    
    // Always render board changes
    drawBoard();
    
    controls.update();
    renderer.render(scene, camera);
    nextRenderer.render(nextScene, nextCamera);
}

// ----- Event Handlers -----
// 以下のブロック全体をコピーして、古いものと置き換えてください
document.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();

    // 最初にスペースキーの処理を行う
    // これにより、ゲームがポーズ中でもポーズ解除が可能になります
    if (key === ' ') {
        e.preventDefault(); // スペースキーでの画面スクロールを防止
        togglePause();
        return; // ポーズ/再開を実行したら、他のキー処理は行わない
    }

    // ゲームがポーズ中または終了している場合、スペースキー以外の操作は受け付けない
    if (isPaused || isGameOver) return;

    let moved = false;
    const pos = currentMino.position;
    
    switch (key) {
        case 'arrowleft':
            if (!checkCollision({ ...pos, x: pos.x - 1 }, currentMino.shape)) { pos.x--; moved = true; }
            break;
        case 'arrowright':
            if (!checkCollision({ ...pos, x: pos.x + 1 }, currentMino.shape)) { pos.x++; moved = true; }
            break;
        case 'arrowdown':
            if (!checkCollision({ ...pos, z: pos.z - 1 }, currentMino.shape)) { pos.z--; moved = true; }
            break;
        case 'arrowup':
             if (!checkCollision({ ...pos, z: pos.z + 1 }, currentMino.shape)) { pos.z++; moved = true; }
            break;
        case 'q': // Z-axis move
            if (!checkCollision({ ...pos, z: pos.z - 1 }, currentMino.shape)) { pos.z--; moved = true; }
            break;
        case 'e': // Z-axis move
            if (!checkCollision({ ...pos, z: pos.z + 1 }, currentMino.shape)) { pos.z++; moved = true; }
            break;
        
        // ハードドロップのcaseはここにはありません。
        // もしハードドロップを別のキー（例：'h'キー）に割り当てたい場合は、ここに case 'h': hardDrop(); break; を追加します。

        // Rotations
        case 'w': rotateMino('x', 90); break;
        case 's': rotateMino('x', -90); break;
        case 'a': rotateMino('y', 90); break;
        case 'd': rotateMino('y', -90); break;
        case 'z': rotateMino('z', 90); break;
        case 'x': rotateMino('z', -90); break;
    }
});

document.getElementById('startButton').addEventListener('click', startGame);
document.getElementById('endGameButton').addEventListener('click', endGame);
document.getElementById('pauseButton').addEventListener('click', togglePause);

// ----- Start -----
init();
