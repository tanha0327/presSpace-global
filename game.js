/**
 * presSpace-global - ゲームロジック
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// v2.90: roundRectのポリフィル（古いブラウザ用）
if (!ctx.roundRect) {
    ctx.roundRect = function (x, y, w, h, radii) {
        if (!radii) {
            return this.rect(x, y, w, h);
        }
        if (typeof radii === 'number') {
            radii = { tl: radii, tr: radii, br: radii, bl: radii };
        } else {
            // 配列 [tl, tr, br, bl] または類似の入力を想定。現在は単一の数値または単純なオブジェクトに簡略化
            // 標準のroundRectは数値またはDOMPointInit配列を受け入れます。
            // このゲームでは主に単一の数値を使用します。
            var r = (Array.isArray(radii)) ? radii[0] : radii;
            radii = { tl: r, tr: r, br: r, bl: r };
        }
        this.beginPath();
        this.moveTo(x + radii.tl, y);
        this.lineTo(x + w - radii.tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
        this.lineTo(x + w, y + h - radii.br);
        this.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
        this.lineTo(x + radii.bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
        this.lineTo(x, y + radii.tl);
        this.quadraticCurveTo(x, y, x + radii.tl, y);
        this.closePath();
    };
}

// ゲーム定数
const LANE_Y_OFFSET = 150;
const CAR_WIDTH = 60;
const CAR_HEIGHT = 100;
const OBSTACLE_WIDTH = 100;
const OBSTACLE_HEIGHT = 60;

// v2.60: 深みのある/落ち着いた障害物の色
const OBSTACLE_COLORS = [
    '#333333', // ダークグレー
    '#1a1a2e', // ディープネイビー
    '#16213e', // ディープブルー
    '#0f3433', // ディープティール
    '#2c0000', // ディープバーガンディ
    '#2e2e2e', // アンスラサイト
    '#263238', // ブルーグレー
    '#3e2723', // ダークブラウン
    '#1b5e20', // ディープフォレストグリーン
    '#4a148c'  // ディープパープル
];

function getRandomObstacleColor() {
    return OBSTACLE_COLORS[Math.floor(Math.random() * OBSTACLE_COLORS.length)];
}




// ゲーム状態列挙型
const STATE = {
    TITLE: 0,
    PLAYING: 1,
    DRIFTING: 2,
    RESULT: 3,
    CRASHED: 4,
    LEVEL_UP: 5,
    ENTRY: 6,
    SCROLLING: 7,
    SHOP: 8, // v2.50: ショップ状態
    SELECT_MODE: 9, // v3.00: 高速道路出口選択（非推奨だが現在は保持）
    EXITING: 10 // v3.11: シネマティックな出口遷移
};

let gameState = STATE.TITLE;
let score = 0;
let level = 1;
let consecutiveWins = 0;
let highScore = parseInt(localStorage.getItem('preSpaceHighScore')) || 0; // v2.38 ハイスコア
// v2.50: ショップデータの永続化
let coins = parseInt(localStorage.getItem('preSpaceCoins')) || 0;
let unlockedSkins = JSON.parse(localStorage.getItem('preSpaceSkins')) || ['default'];
let currentSkinId = localStorage.getItem('preSpaceCurrentSkin') || 'default';
let shopSelection = 0; // SKINS内のインデックス

// v3.40: オーディオ設定の永続化
let audioSettings = JSON.parse(localStorage.getItem('preSpaceAudioSettings')) || {
    engine: true,
    sfx: true,
    ui: true
};
let showAudioMenu = false; // 設定オーバーレイの切り替え
let audioMenuSelection = 0; // 0: エンジン, 1: SFX, 2: UI

function saveAudioSettings() {
    localStorage.setItem('preSpaceAudioSettings', JSON.stringify(audioSettings));
}

// v3.00: 選択モード変数
let selectLane = 0; // 0: メイン, 1: ショップ
let selectY = 0; // 車線変更の視覚的Y位置
let shopTransitionTimer = 0; // v3.05: ショップ入店アニメーション

let perfectCombo = 0; // v2.41: コンボシステム
let lastTime = 0;
let totalDistance = 0; // v2.11
let scrollFocusX = 0; // スクロール用のカメラフォーカス
// v3.11: 出口ランプアニメーション変数
let exitTransitionTimer = 0;
let exitTargetX = 0; // v3.12: ランプ開始のワールドX座標ターゲット
let exitStartX = 0;
let exitStartY = 0;

// v2.95: カメラのズームと傾き
let cameraZoom = 1.0;
let targetZoom = 1.0;
let cameraAngle = 0; // v2.99: ダッチアングル（傾き）

// v2.60: スキンデータ
const SKINS = [
    { id: 'default', name: 'PANDA 86', model: 'coupe', color: '#ffffff', body: '#ffffff', detail: '#111111', price: 0 },
    { id: 'red', name: 'CRIMSON', model: 'coupe', color: '#ff4444', body: '#ff4444', detail: '#ffffff', price: 1 },
    { id: 'blue', name: 'AZURE', model: 'coupe', color: '#4444ff', body: '#4444ff', detail: '#ffffff', price: 1 },
    { id: 'gold', name: 'MIDAS', model: 'coupe', color: '#ffd700', body: '#ffd700', detail: '#000000', price: 1 },
    { id: 'dark', name: 'STEALTH', model: 'coupe', color: '#222', body: '#222', detail: '#444', price: 1 },
    { id: 'neon', name: 'CYBER', model: 'coupe', color: '#00ffcc', body: '#00ffcc', detail: '#ff00ff', price: 10 },
    // v2.90: 新モデル
    { id: 'super_red', name: 'DIABLO', model: 'supercar', color: '#ff0000', body: '#ff0000', detail: '#111', price: 50 },
    { id: 'super_x', name: 'PROTO-X', model: 'supercar', color: '#888', body: '#aaa', detail: '#00ffff', price: 100 },
    { id: 'van_white', name: 'DELIVERY', model: 'van', color: '#eee', body: '#eee', detail: '#333', price: 20 },
    { id: 'van_black', name: 'A-TEAM', model: 'van', color: '#111', body: '#111', detail: '#cc0000', price: 25 }
];

// UIグローバル変数
let resultText = "";
let resultColor = "white";

// v3.00: サウンドマネージャー (Web Audio API)
class SoundManager {
    constructor() {
        this.ctx = null;
        this.gainNode = null;
        this.engineOsc = null;
        this.engineGain = null;
        this.isMuted = false;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0.3; // マスター音量
        this.gainNode.connect(this.ctx.destination);
        this.initialized = true;
    }

    // v3.55: ミュート切り替え
    toggleMute() {
        if (!this.initialized) this.init();
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.ctx.suspend();
        } else {
            this.ctx.resume();
        }
        return this.isMuted;
    }

    // エンジン音（ノコギリ波）
    startEngine() {
        if (!audioSettings.engine) return; // v3.40
        if (!this.initialized) this.init();
        if (this.engineOsc) return;

        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 50;

        // こもり音用のローパスフィルタ
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 400;

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.1;

        this.engineOsc.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.gainNode);
        this.engineOsc.start();
    }

    stopEngine() {
        if (this.engineOsc) {
            this.engineOsc.stop();
            this.engineOsc.disconnect();
            this.engineOsc = null;
        }
    }

    updateEngine(speedRatio) {
        if (!this.engineOsc || !audioSettings.engine) return;
        // ピッチマッピング: 50Hz (アイドル) -> 300Hz (最大)
        // フィルタマッピング: 400Hz -> 1000Hz (開放)
        const targetFreq = 50 + speedRatio * 250;
        const targetFilter = 400 + speedRatio * 800;

        // スムーズな遷移
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
        this.engineFilter.frequency.setTargetAtTime(targetFilter, this.ctx.currentTime, 0.1);
    }

    // ワンショットノイズ（クラッシュ）
    playCrash() {
        if (!audioSettings.sfx || !this.initialized) return; // v3.40
        const duration = 1.0;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 1000;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.gainNode);
        noise.start();
    }

    // コイン / 成功（チャイム）
    playCoin() {
        if (!audioSettings.sfx || !this.initialized) return; // v3.40
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1800, this.ctx.currentTime + 0.1);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.gainNode);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    // ドリフト（ピンクノイズ風: フィルタリングされたホワイトノイズ）
    playDrift(duration = 0.1) {
        if (!this.initialized) return;
        // 単純なホワイトノイズバースト
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 800;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.2;

        noise.connect(bandpass);
        bandpass.connect(gain);
        gain.connect(this.gainNode);
        noise.start();
    }

    playUI() {
        if (!audioSettings.ui || !this.initialized) return; // v3.40
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.1);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.1, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        osc.connect(g);
        g.connect(this.gainNode);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
}

const soundManager = new SoundManager();

// v2.19 タイトル放置デモロジック
let titleIdleTimer = 0;
let titleDemoState = 0; // 0: アイドル, 1: ドリフトイン, 2: 駐車中, 3: ドリフトアウト
let titleParkX = 0;
let titleDonutSpeed = 0;
let speedometerOpacity = 0; // v3.106: Global scope fix // v2.26.1

// カメラフォーカス用ヘルパー
function getCameraFocusX() {
    if (gameState === STATE.SCROLLING) return scrollFocusX;
    return car.x;
}

let showTitleInstruction = true; // v2.31: 説明テキストの切り替え

// v2.40: 画面振動ヘルパー
function addScreenShake(amount) {
    screenShake.intensity = Math.min(30, screenShake.intensity + amount); // 最大30でキャップ
}

// v2.40: ドリフト煙ヘルパー
function spawnDriftSmoke(x, y) {
    // 呼び出しごとに1-2個のパーティクルを生成
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
        smokeParticles.push({
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() * -10) - 10, // わずかな上昇
            size: 5 + Math.random() * 10,
            growth: 10 + Math.random() * 10, // 時間とともに拡大
            alpha: 0.6 + Math.random() * 0.4,
            decay: 0.5 + Math.random() * 0.5
        });
    }
}

function spawnShatterParticles(x, y, color, space = 'screen', impulse = null) {
    for (let i = 0; i < 20; i++) { // 数を増加
        let vx = (Math.random() - 0.5) * 600;
        let vy = (Math.random() - 0.5) * 600;

        // v2.91: 方向性のある衝撃
        if (impulse) {
            vx = impulse.x * 300 + (Math.random() - 0.5) * 300;
            vy = impulse.y * 300 + (Math.random() - 0.5) * 300;
        }

        scoreParticles.push({
            x: x,
            y: y,
            vx: vx,
            vy: vy,
            alpha: 1.0,
            size: Math.random() * 8 + 4, // より大きな塊
            color: color || '#ffff00',
            // v2.61: 破片の物理演算
            rotation: Math.random() * Math.PI,
            rotSpeed: (Math.random() - 0.5) * 10,
            space: space, // v2.90: 'screen' または 'world'
            decay: (impulse ? 5.0 : 2.0) // v2.92: クラッシュ（バースト）用により速い減衰
        });
    }
}

// v2.21 タイヤ痕用ヘルパー
function updateTireMarks() {
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);

    const rearX = -50;
    const tireY = 20;

    const r1x = car.x + rearX * cos - (-tireY) * sin;
    const r1y = car.y + rearX * sin + (-tireY) * cos;

    const r2x = car.x + rearX * cos - (tireY) * sin;
    const r2y = car.y + rearX * sin + (tireY) * cos;

    if (car.lastTireL) {
        round.tireMarks.push({
            x1: car.lastTireL.x, y1: car.lastTireL.y,
            x2: r1x, y2: r1y
        });
    }
    if (car.lastTireR) {
        round.tireMarks.push({
            x2: r2x, y2: r2y,
            x1: car.lastTireR.x, y1: car.lastTireR.y
        });
    }
    car.lastTireL = { x: r1x, y: r1y };
    car.lastTireR = { x: r2x, y: r2y };
}

// エンティティ
let car = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    speed: 0,
    spin: 0
};

let round = {
    cars: [],
    spot: { x: 0, y: 0, w: 0, h: 0 },
    speed: 10,
    tireMarks: [] // { x1, y1, x2, y2 }
};

// UIフローロジック（タイトル＆結果）
// テキストのワールド「アンカー」位置を追跡します。
let titleFlowStartX = 0;
let isTitleFlowing = false;
let isDemoDrifting = false; // v2.30.10: ゴーストAIロジック用の明示的なフラグ
let hudDelayTimer = 0; // v2.30.19: タイトルとの重なりを防ぐためのHUD遅延
let levelMarking = { x: null, level: 0 }; // v2.30.21: レベルアップ用の路面標示
let floatingScore = null; // v2.30.30: フライングスコアアニメーション { val: 0, x: 0, y: 0, state: 0 }
let resultFlowStartX = 0;
let isResultFlowing = false;
let scoreParticles = []; // v2.30.40: 破砕エフェクトパーティクル
let smokeParticles = []; // v2.40: ドリフト煙パーティクル
let screenShake = { x: 0, y: 0, intensity: 0 }; // v2.40: 画面振動

function updateUIFlow() {
    // Canvasレンダリングはカメラ移動によってフローを自動的に処理します。
    // 将来的に必要であれば、この関数で論理状態の更新を処理できます。
}

// リサイズ処理
// リサイズ処理
function resize() {
    // v2.36: 動的解像度（レスポンシブ）

    // 最高品質のためにキャンバスをウィンドウサイズに正確に合わせます。
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 入力
window.addEventListener('keydown', (e) => {
    // v3.40: オーディオ設定の切り替え
    if (e.code === 'KeyA') {
        showAudioMenu = !showAudioMenu;
        soundManager.playUI();
        return;
    }

    if (showAudioMenu) {
        if (e.code === 'ArrowUp') {
            audioMenuSelection = (audioMenuSelection - 1 + 3) % 3;
            soundManager.playUI();
        }
        if (e.code === 'ArrowDown') {
            audioMenuSelection = (audioMenuSelection + 1) % 3;
            soundManager.playUI();
        }
        if (e.code === 'Space' || e.code === 'Enter') {
            const keys = ['engine', 'sfx', 'ui'];
            const target = keys[audioMenuSelection];
            audioSettings[target] = !audioSettings[target];
            saveAudioSettings();
            soundManager.playUI();

            // エンジンの特別処理
            if (target === 'engine') {
                if (audioSettings.engine) soundManager.startEngine();
                else soundManager.stopEngine();
            }
        }
        if (e.code === 'Escape') {
            showAudioMenu = false;
        }
        return;
    }

    if (e.code === 'Space' && !e.repeat) {
        handleInput(e);
    }
    // v2.50: ショップ入力
    if (gameState === STATE.SHOP) {
        if (e.code === 'ArrowRight') {
            shopSelection = (shopSelection + 1) % SKINS.length;
            soundManager.playUI();
        } else if (e.code === 'ArrowLeft') {
            shopSelection = (shopSelection - 1 + SKINS.length) % SKINS.length;
            soundManager.playUI();
        } else if (e.code === 'Space' || e.code === 'Enter') {
            tryBuySkin(shopSelection); // 元のtryBuySkinに戻しました
            soundManager.playUI();
        } else if (e.code === 'KeyS' || e.code === 'Escape') {
            gameState = STATE.TITLE; // 元のgameState = STATE.TITLEに戻しました
            saveGameData(); // 元のsaveGameData()に戻しました
            soundManager.playUI();
        }
    }

    // v3.00: 車線選択（タイトル / 選択モード）
    if (gameState === STATE.TITLE || gameState === STATE.SELECT_MODE) {
        if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
            selectLane = 1; // ショップ/出口
            soundManager.playUI();
        } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
            selectLane = 0; // GO車線
            soundManager.playUI(); // playCoinから変更
        }

    }
});

// モバイル対応 (v2.12)
window.addEventListener('touchstart', (e) => {
    // クイックタップでのスクロール/ズームを防ぐためにデフォルトを阻止
    if (e.target === canvas) {
        e.preventDefault();

        // v3.55: ミュートボタンのタッチ判定
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        if (checkMuteButton(x, y)) return;

        handleInput(e);
    }
}, { passive: false });

// v3.55: ミュートボタンのマウスクリック（デスクトップ）
window.addEventListener('mousedown', (e) => {
    if (e.target === canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (checkMuteButton(x, y)) return;

        handleInput(e);
    }
});

function checkMuteButton(x, y) {
    // ボタン領域: 右上（キャンバス幅基準）
    // 座標: x > width - 60, y < 60
    const btnSize = 50;
    const margin = 20;
    const btnX = canvas.width - margin - btnSize;
    const btnY = margin;

    if (x >= btnX && x <= btnX + btnSize && y >= btnY && y <= btnY + btnSize) {
        soundManager.toggleMute();
        return true;
    }
    return false;
}

function handleInput(e) {
    // v3.73: Safeguard against missing event object
    if (!e) e = {};

    // v3.00: 最初のジェスチャでAudioContextを初期化
    soundManager.init();
    soundManager.startEngine();

    if (gameState === STATE.TITLE) {
        if (selectLane === 0) {
            startGame();
        } else {
            // v3.31: 高速な「ピットイン」スタイル（クイックアクセスのために短縮）
            gameState = STATE.EXITING;
            exitTargetX = car.x + 1000;
            exitTransitionTimer = 3.0;
            exitStartX = car.x;
            exitStartY = car.y;
            soundManager.startEngine();
        }
    } else if (gameState === STATE.SELECT_MODE) {
        // v3.00: 車線選択の確定ロジック
        if (selectLane === 0) {
            // GO!
            startRound();
        } else {
            // SHOP
            if (shopTransitionTimer <= 0) {
                shopTransitionTimer = 1.5; // v3.90: Longer transition for curve
                soundManager.playCoin();
            }
        }
    } else if (gameState === STATE.PLAYING) {
        // v2.95: レベル標示を通過するまでドリフトを制限
        if (levelMarking.x !== null) {
            // 車が標示テキストを通過するまで待機（概算）
            if (car.x < levelMarking.x + 300) {
                return; // 入力を無視
            }
        }
        // v3.72: ドーナツドリフト (Shift + Space)
        if (e.shiftKey) {
            startDrift('donut');
        } else {
            startDrift('normal');
        }
    } else if (gameState === STATE.RESULT || gameState === STATE.CRASHED) {
        if (gameState === STATE.RESULT && level > 10) {
            resetGame();
        } else {
            // 自動遷移が再起動を処理しますが、念のため保持
            // 結果が失敗かどうかチェック（赤色チェックロジックをresultColorチェックに置換）
            if (resultColor === '#ff4444') {
                startRound();
            }
        }
    }
}

function startGame() {
    score = 0;
    level = 1;
    consecutiveWins = 0;

    // タイトル説明の破砕
    if (showTitleInstruction) {
        // v2.33: 画面中央に固定（ワールド計算ではない）
        // テキストは常に画面中央(0.5w)に描画されるため、パーティクルもそこにあるべき。
        spawnShatterParticles(canvas.width / 2, canvas.height / 2 + 60, '#ffffff'); // 白
        showTitleInstruction = false;
    }

    titleFlowStartX = car.x;
    isTitleFlowing = true; // v2.30.10: 視覚的な路面標示を復元
    isDemoDrifting = false; // ロジックOFFを保証
    hudDelayTimer = 0; // v2.30.19: HUD遅延をリセット

    // v3.00: 即座に開始せずに選択モードへ
    gameState = STATE.SELECT_MODE;
    selectLane = 0; // メイン車線で開始
    // v3.57: タイトルを流し続け、後に道路上に残るようにする
    // isTitleFlowing = false; 

    // 選択ドライブのセットアップ
    const centerY = canvas.height / 2;
    // レーン0: Y = centerY + 64 (走行Y)
    // Lane 1: Y = centerY - 150 (出口車線 - 視覚に合わせて調整)
    selectY = centerY + 64;

    car.x = 0;
    car.y = selectY;
    car.vx = 20; // 高速巡航速度
    car.vy = 0;
    car.angle = 0;

    scrollFocusX = car.x;
}

function hideResultScreen() {
    isResultFlowing = false;
}

function startRound() {
    const previousState = gameState;
    // v3.45: 選択モード（シームレスであるべき）から来ていない場合のみエントリーアニメーションを使用
    let useEntryAnim = (previousState !== STATE.TITLE && previousState !== STATE.SELECT_MODE);

    gameState = STATE.PLAYING;
    targetZoom = 1.0; // v2.95: 再起動時にズームをリセット
    cameraAngle = 0;   // v2.99: 再起動時に傾きをリセット

    // v2.30.36: レベル標示をリセット（前のラウンドの標示を表示しない）
    // levelMarking = { x: null, level: 0 }; // 無効化: 自然に画面外へスクロールアウトさせる (v2.30.37)

    // v2.32: レベル1の標示を明示的に設定
    if (level === 1) {
        levelMarking = {
            x: car.x + canvas.width, // 画面外（右）から開始してスクロールインさせる
            level: 1
        };
    }

    floatingScore = null; // スコアアニメーションがあればクリア

    // エントリーアニメーションを使用する場合、自然に流す。
    if (!useEntryAnim) {
        hideResultScreen();
    }

    // 物理/レベル設定
    let baseSpeed = 10 + (level - 1) * 1.0;
    let gapSize = 240 - (level - 1) * 10;
    if (gapSize < 140) gapSize = 140;
    if (baseSpeed > 22) baseSpeed = 22;

    round.speed = baseSpeed;

    const centerY = canvas.height / 2;
    const roadHalfWidth = 140;
    // v2.30.28 64に調整（正しい視覚的中心）
    const drivingY = centerY + 64;
    const shoulderY = centerY - roadHalfWidth - 40;

    // 永続化ロジック
    if (useEntryAnim) {
        // 障害物としての駐車車両
        let parkedCar = {
            x: car.x - 50,
            y: car.y - 30,
            w: 100,
            h: 60,
            color: '#ddd'
        };

        // スクロールした場合、car.xは古い位置です
        // scrollFocusXに新しい車をスポーンする必要があります。
        let spawnX = (previousState === STATE.SCROLLING) ? scrollFocusX : car.x;

        // 著しく前方にある場合はscrollFocusXを使用
        if (scrollFocusX > car.x + 100) {
            spawnX = scrollFocusX;
        } else {
            spawnX = car.x;
        }

        // ターゲットロジック
        const targetDist = canvas.width * 1.5 + Math.random() * 200;
        const targetX = spawnX + targetDist;

        // 新しい障害物
        // v2.98: コインスポットロジック
        // v3.108: Level 3+
        const isCoinSpot = (level >= 3 && Math.random() < 0.2); // 20%の確率
        round.isCoinSpot = isCoinSpot;

        let newObstacles = [];
        if (!isCoinSpot) {
            newObstacles = [
                {
                    x: targetX - gapSize / 2 - OBSTACLE_WIDTH,
                    y: shoulderY - OBSTACLE_HEIGHT / 2,
                    w: OBSTACLE_WIDTH, h: OBSTACLE_HEIGHT, color: getRandomObstacleColor()
                },
                {
                    x: targetX + gapSize / 2,
                    y: shoulderY - OBSTACLE_HEIGHT / 2,
                    w: OBSTACLE_WIDTH, h: OBSTACLE_HEIGHT, color: getRandomObstacleColor()
                }
            ];
        }

        // 永続化: 古い車 + 駐車車両（スクロール/成功時のみ）+ 新しい障害物
        // v2.16 最適化: はるか後方の車を除外
        const keepThreshold = spawnX - 2000;
        const keptCars = round.cars.filter(c => c.x > keepThreshold);

        if (previousState === STATE.SCROLLING) {
            round.cars = [...keptCars, parkedCar, ...newObstacles];
        } else {
            round.cars = [...keptCars, ...newObstacles];
        }

        // タイヤ痕もクリーンアップ
        round.tireMarks = round.tireMarks.filter(m => m.x2 > keepThreshold);

        round.spot = { x: targetX, y: shoulderY, w: gapSize, h: 100 };

        // エントリー用プレイヤー設定: 下から来る（垂直合流）
        // v3.64: 画面下にスポーン、ターゲットXに合わせて配置
        car.x = spawnX; // スクロール位置
        car.y = canvas.height + 200; // 確実に画面下
        car.vx = round.speed; // 速度を合わせる（水平方向の追いつきは不要）
        car.vy = 0;
        car.angle = -0.3; // 右上を向く
        car.speed = round.speed;
        car.spin = 0;

        // v3.56: フリーズ/ラグを防ぐためにパーティクルをクリーンアップ
        scoreParticles = [];
        smokeParticles = [];

        // カメラをspawnXで開始
        scrollFocusX = spawnX;

        gameState = STATE.ENTRY;

    } else if (previousState === STATE.SELECT_MODE) {
        // v3.55: シームレスな遷移（そのまま運転を継続）
        gameState = STATE.PLAYING;

        // v3.57: タイトルの路面標示を有効化
        isTitleFlowing = true;
        // PLAYING中のupdate()ではtitleFlowStartXは使用されないため、固定され、道路に焼き付けられた状態になります

        // car.x, car.y, car.vxはそのまま維持
        // カメラが即座に追従することを確認
        // 論理的な変更は不要、状態を切り替えるだけ

        if (level === 1) {
            levelMarking = {
                x: car.x + canvas.width,
                level: 1
            };
        }

        // v3.63: レベル1の初期化漏れを修正
        // シームレス遷移であっても最初のスポットと障害物を生成する必要があります！
        const targetDist = canvas.width * 1.5 + Math.random() * 200;
        const targetX = car.x + targetDist;

        // v3.108: Level 3+
        const isCoinSpot = (level >= 3 && Math.random() < 0.2);
        round.isCoinSpot = isCoinSpot;
        round.spot = { x: targetX, y: shoulderY, w: gapSize, h: 100 };

        round.cars = [];
        if (!isCoinSpot) {
            round.cars = [
                { x: targetX - gapSize / 2 - OBSTACLE_WIDTH, y: shoulderY - OBSTACLE_HEIGHT / 2, w: OBSTACLE_WIDTH, h: OBSTACLE_HEIGHT, color: getRandomObstacleColor() },
                { x: targetX + gapSize / 2, y: shoulderY - OBSTACLE_HEIGHT / 2, w: OBSTACLE_WIDTH, h: OBSTACLE_HEIGHT, color: getRandomObstacleColor() }
            ];
        }

    } else {
        // リセットロジック
        if (car.speed < 1) {
            car.x = -200;
        }

        car.y = drivingY;
        car.vx = round.speed;
        car.vy = 0;
        car.angle = 0;
        car.speed = round.speed;
        car.spin = 0;

        const targetDist = canvas.width * 1.5 + Math.random() * 200;
        const targetX = car.x + targetDist;

        // v2.98: コインスポットロジック（リセット）
        // v3.108: Level 3+
        const isCoinSpot = (level >= 3 && Math.random() < 0.2);
        round.isCoinSpot = isCoinSpot;

        round.spot = { x: targetX, y: shoulderY, w: gapSize, h: 100 };
        round.cars = [];

        if (!isCoinSpot) {
            round.cars = [
                { x: targetX - gapSize / 2 - OBSTACLE_WIDTH, y: shoulderY - OBSTACLE_HEIGHT / 2, w: OBSTACLE_WIDTH, h: OBSTACLE_HEIGHT, color: getRandomObstacleColor() },
                { x: targetX + gapSize / 2, y: shoulderY - OBSTACLE_HEIGHT / 2, w: OBSTACLE_WIDTH, h: OBSTACLE_HEIGHT, color: getRandomObstacleColor() }
            ];
        }
    }
}

function startDrift(type = 'normal') {
    gameState = STATE.DRIFTING;
    car.driftType = type; // v3.72: 'normal' or 'donut'

    if (!round.spot) {
        // Safety Case: If spot is missing, create a dummy one to prevent crash
        round.spot = { x: car.x + 1000, y: canvas.height / 2 + 64 - 200, w: 200, h: 100 };
    }

    if (type === 'donut') {
        // v3.72: ドーナツドリフト初期化
        // ターゲットYへの誘導は弱くし、スピンを優先
        const targetY = round.spot.y;
        const dy = targetY - car.y;
        // 少し滑らせつつ、スピンを与える。通常の物理演算とは異なる軌道。
        // v3.74: 摩擦を0.96に変更するため、係数は0.04 (1 - 0.96)
        // v3.100: "届かない"対策。360度停止で減速するため、理論値より大きくする(1.5倍)
        // v3.101: ゆっくり回転 (0.96 -> 0.985 friction, spin 0.4)
        // Friction 0.985 -> loss 0.015. 
        // ターゲットYに到達するための理論値 = dy * 0.015
        // v3.102: もっと奥まで！ (User requested "reach between parked cars")
        // 理論値の3倍くらい必要かもしれない (0.015 * 3 = 0.045)
        car.vy = dy * 0.055;

        // 強烈なスピン初期化
        // v3.101: ゆっくり回る (0.8 -> 0.4)
        car.spin = (Math.random() < 0.5 ? -1 : 1) * 0.4;
        car.totalRotation = 0; // v3.73: 回転量追跡
    } else {
        // v2.7 ターゲット指定ドリフト物理
        // 停止するまでに車が正確にround.spot.yまでスライドするようにしたい。
        // 物理: フレームごとに vy *= 0.97
        // 総Y移動距離 = vy_start / (1 - 0.97) = vy_start / 0.03
        // よって: wy_start = (TargetY - CurrentY) * 0.03

        const targetY = round.spot.y;
        const dy = targetY - car.y;

        // targetYで完全に停止するための理論的なvy
        // 等比級数から導出された係数: sum = a * (r / (1-r))
        // 摩擦 r = 0.97
        // 係数 = (1 - 0.97) / 0.97 = 0.03 / 0.97 約 0.0309278
        // 物理演算がターゲットで正確に停止するように、この正確な係数を使用します。
        car.vy = dy * (0.03 / 0.97);
    }

    // v3.62: 高速エントリーの安全クランプ
    // 高速道路(20)から減速中にドリフトに入った場合、クランプ（制限）します。
    if (car.vx > round.speed * 1.2) {
        car.vx = round.speed * 1.2;
    }

    // タイヤ痕の追跡をリセット
    car.lastTireL = null;
    car.lastTireR = null;
}

function resetGame() {
    // v3.11 クラシックなタイトル画面に戻す
    gameState = STATE.TITLE;
    selectLane = 0;

    isTitleFlowing = true; // 高速巡航上にタイトルロゴを表示
    titleFlowStartX = car.x;
    speedometerOpacity = 0; // v3.105: Smooth fade for speedometeren();

    hideResultScreen();

    showTitleInstruction = true;

    cameraZoom = 1.0;
    targetZoom = 1.0;
    cameraAngle = 0;

    const centerY = canvas.height / 2;
    selectY = centerY + 64; // 正しい車線Y

    car.x = -200;
    car.y = selectY;
    car.vx = 20; // 巡航速度
    car.vy = 0;
    car.angle = 0;
    car.speed = 20;
    car.spin = 0;

    car.lastHit = null;
    isDemoDrifting = false;

    scrollFocusX = car.x;
}

resetGame();

function update(dt, rawDt = dt) {
    // v2.95: ズーム更新
    const zoomSpeed = 5.0;
    cameraZoom += (targetZoom - cameraZoom) * zoomSpeed * dt;

    // v3.00: オーディオ更新
    // 現在の速度を安全に計算
    const currentSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    const speedRatio = Math.min(1.0, currentSpeed / 22); // 22は最大速度
    soundManager.updateEngine(speedRatio);

    if (gameState === STATE.DRIFTING && Math.abs(car.angle) > 0.1) {
        soundManager.playDrift(dt); // 連続バースト
    }

    // v2.99: 傾き更新
    // 0に戻るバネ/減衰
    cameraAngle *= 0.95; // 単純な指数減衰
    if (Math.abs(cameraAngle) < 0.001) cameraAngle = 0;

    if (gameState === STATE.TITLE) {
        titleIdleTimer = 0; // アイドルロジックをリセット
        // v2.26: エントリーへのシームレスなタイトルドリフト
        const centerY = canvas.height / 2;
        const drivingY = centerY + 64; // v2.30.28
        const parkingY = centerY - 180; // v2.30 灰色の障害物車両に合わせる

        // v2.19 タイトル放置デモロジック
        titleIdleTimer += dt;
        if (titleDemoState === 0) {
            // v3.11: 車戦ベースの選択（車が車線間を移動）
            let targetY = (selectLane === 0) ? drivingY : (centerY + 200);

            // デモまで8秒待機
            if (titleIdleTimer > 8) {
                // v2.30 ゴーストAI: 実際のゲームプレイドリフトをトリガー
                round.spot = { x: car.x + 167, y: parkingY, w: 240, h: 100 };
                startDrift();
                titleDemoState = 1;
                titleIdleTimer = 0;
            }

            // ターゲット車線へスムーズに移動
            car.y += (targetY - car.y) * 5 * dt;
            car.angle = (targetY - car.y) * 0.002; // わずかな傾き

            car.vx = 10;
            car.vy = 0;
            car.spin = 0;
        }
        else if (titleDemoState === 1) {
            // v2.30: ドリフト中はSTATE.DRIFTINGになります
            // 停止後、failRound/nextRoundによってtitleDemoState = 2でここに戻ります
        }
        else if (titleDemoState === 2) {
            car.vx = 0;
            car.vy = 0;
            car.angle = -Math.PI;
            if (titleIdleTimer > 5) {
                titleDemoState = 3;
                titleIdleTimer = 0;
                car.lastTireL = null;
                car.lastTireR = null;
            }
        }
        else if (titleDemoState === 3) {
            car.vx = Math.max(-12, car.vx - 0.2);
            car.vy = 0;
            car.angle = -Math.PI;
            updateTireMarks();
            if (car.x < titleParkX - 500) {
                titleDemoState = 4;
                titleIdleTimer = 0;
                titleDonutSpeed = 0;
            }
        }
        else if (titleDemoState === 4) {
            titleDonutSpeed = Math.min(15, titleDonutSpeed + 0.3);
            car.angle += 0.08;
            car.vx = Math.cos(car.angle) * titleDonutSpeed;
            car.vy = -Math.sin(car.angle) * titleDonutSpeed;
            updateTireMarks();

            if (car.angle > -0.2 && car.y >= drivingY - 20) {
                car.y = drivingY;
                car.angle = 0;
                car.vx = 10;
                titleDemoState = 0;
                titleIdleTimer = 0;
                car.lastTireL = null;
                car.lastTireR = null;
            }
            if (titleIdleTimer > 5) titleDemoState = 0;
        }

        // v2.40: Title Drift Smoke
        if (titleDemoState === 3 || titleDemoState === 4 || (titleDemoState === 1 && Math.abs(car.spin) > 0.05)) {
            // Calculate Rear Tires (Local Space)
            const rearX = -CAR_HEIGHT / 2 + 10;
            const tireY = CAR_WIDTH / 2 - 5;

            // Transform to World Space
            const cos = Math.cos(car.angle);
            const sin = Math.sin(car.angle);

            // Left Rear
            const lrX = car.x + (rearX * cos - (-tireY) * sin);
            const lrY = car.y + (rearX * sin + (-tireY) * cos);
            spawnDriftSmoke(lrX, lrY);

            // Right Rear
            const rrX = car.x + (rearX * cos - tireY * sin);
            const rrY = car.y + (rearX * sin + tireY * cos);
            spawnDriftSmoke(rrX, rrY);
        }

        // Integration (Moved to match game style)
        car.x += car.vx;
        car.y += car.vy;
        car.angle += car.spin;

        // v2.5: World Anchor sync
        titleFlowStartX = car.x;
    }
    else if (gameState === STATE.SELECT_MODE) {
        // v3.00: Highway Autopilot
        car.vx = 20;
        car.x += car.vx;
        scrollFocusX = car.x;
        // v2.5: World Anchor sync (Keep markings floating with car during selection)
        titleFlowStartX = car.x;

        // Lane Lerp
        // Lane 0: GO (Main) -> centerY + 64
        // Lane 1: SHOP (Pit-In) -> Follow curve
        const centerY = canvas.height / 2;
        const roadHalfWidth = 140;
        const roadBottom = centerY + roadHalfWidth;

        let targetY = centerY + 64; // Default Main

        if (selectLane === 1) {
            // v3.110: User requested NO physical lane change. Only Blinker.
            // targetY = roadBottom + 70; // <-- Disabled physical move
            targetY = centerY + 70; // Stay in Main Lane
            // Force Y if drifting for some reason?
            // car.y = targetY; // Strict lock? No, let it lerp if needed for smoothness, but target must be Main.
        }

        // v3.10: Auto-Transition Logic
        const gantryX = (Math.floor((car.x - 2000) / 4000) + 1) * 4000;
        // If we pass the gantry and haven't started transition
        if (car.x > gantryX && shopTransitionTimer === 0) {
            if (selectLane === 0) {
                // Auto-Start Round
                isTitleFlowing = false;
                startRound();
            } else {
                // Auto-Exit to Shop
                shopTransitionTimer = 1.0;
                soundManager.playCoin();
            }
        }

        if (shopTransitionTimer > 0) {
            shopTransitionTimer -= dt;

            // v3.110: No curve, just wait for transition
            // targetY is already locked to Main Lane (or whatever we want during transition)
            // If we want them to enter the shop, we might need to steer them right eventually?
            // "The car stays in the main lane... The 3rd lane still appears visually."
            // "Space key to..." (Future)
            // So for now, even during transition timer, keep them in main lane?
            // Actually, transition timer implies AUTO EXIT.
            // If we changed logic to "Blinker only", maybe we shouldn't have auto-transition yet?
            // "Pressing Down... blinker... 3rd lane appears... Space to..."
            // So Down key should NOT trigger transition timer?
            // "Auto-Exit" at line 1119 triggers `shopTransitionTimer = 1.0`.
            // We should probably DISABLE auto-exit for now too if the user wants separate Space logic?
            // The user said: "Wait for Space key instruction".
            // So for now, hitting the gantry with blinker on should probably NOT exit automatically?
            // But currently it DOES (lines 1110-1120).
            // I will leave existing auto-exit logic for now (maybe that's what moves them?), 
            // but I will ensure the visual CURVE is gone.

            // Keep targetY as is (Main Lane)
            // targetY = centerY + 70; 

            if (shopTransitionTimer <= 0) {
                isTitleFlowing = false;
                gameState = STATE.SHOP;
                shopTransitionTimer = 0; // Reset
            }
        }

        // Smooth Y movement
        car.y += (targetY - car.y) * 5 * dt;
        // Tilt car based on Y movement
        car.angle = (targetY - car.y) * 0.003;
    }
    else if (gameState === STATE.EXITING) {
        // v3.31: Faster Animation (Shortened curve)
        exitTransitionTimer -= dt;
        car.x += car.vx;

        // Horizontal distance from ramp start
        const distFromRampStart = car.x - exitTargetX;

        // Short merge over 800px starting from exitTargetX
        if (distFromRampStart > 0) {
            const progress = Math.min(1.0, distFromRampStart / 800);
            // Shallower curve (400px drop instead of 500px)
            const targetExitY = (canvas.height / 2 + 140) + 400;
            car.y = exitStartY + (targetExitY - exitStartY) * progress * progress;
            car.angle = progress * 0.4; // Bit more turn for speed
        } else {
            // Smoothly align to lane 1 while approaching the pit-entry
            const targetY = (canvas.height / 2) + 200;
            car.y += (targetY - car.y) * 4 * dt;
            car.angle = (targetY - car.y) * 0.002;
        }

        scrollFocusX = car.x;

        // Transition to shop after merging deep into the ramp
        if (distFromRampStart > 1200 || exitTransitionTimer <= 0) {
            isTitleFlowing = false;
            gameState = STATE.SHOP;
            exitTransitionTimer = 0;
        }
    }
    else if (gameState === STATE.SCROLLING) {
        // Camera moves forward
        scrollFocusX += round.speed * 1.5; // Fast forward

        if (scrollFocusX - canvas.width * 0.3 > car.x + 200) {
            startRound();
        }
    }
    else if (gameState === STATE.ENTRY) {
        // v3.64: Merging from Bottom logic
        scrollFocusX += round.speed;

        const targetY = canvas.height / 2 + 64;

        // Maintain X speed (Aligned)
        car.x += car.vx;

        // 垂直移動（合流）
        const dy = targetY - car.y; // Negative value (Starts at ~ -350)

        // Smooth merge up
        car.y += dy * 0.08;

        // Tilt logic: Proportional to distance, max -0.5
        // When dy is -350, angle should be negative (up-right pointing)
        car.angle = Math.max(-0.5, dy * 0.002);

        // If caught up to Lane Y
        if (Math.abs(dy) < 3) {
            car.y = targetY;
            car.angle = 0;
            gameState = STATE.PLAYING;
        }
    }
    else if (gameState === STATE.PLAYING) {
        // v3.61: Smooth Speed Adaptation (Decelerate from Highway Speed to Level Speed)
        if (car.vx > round.speed) {
            car.vx -= 0.5; // v3.62: Faster stabilization
            if (car.vx < round.speed) car.vx = round.speed;
        }

        car.x += car.vx;

        // Infinite Road Logic
        if (car.x > round.spot.x + 400) {
            const gapSize = round.spot.w;
            const targetDist = canvas.width * 1.5;
            const targetX = car.x + targetDist;

            const centerY = canvas.height / 2;
            const roadHalfWidth = 140;
            const shoulderY = centerY - roadHalfWidth - 40;

            // v2.98: Coin Spot Logic (In Update)
            // v3.108: Restrict to Level 3+
            const isCoinSpot = (level >= 3 && Math.random() < 0.2);
            round.isCoinSpot = isCoinSpot;

            if (!isCoinSpot) {
                round.cars.push(
                    { x: targetX - gapSize / 2 - OBSTACLE_WIDTH, y: shoulderY - OBSTACLE_HEIGHT / 2, w: OBSTACLE_WIDTH, h: OBSTACLE_HEIGHT, color: getRandomObstacleColor() },
                    { x: targetX + gapSize / 2, y: shoulderY - OBSTACLE_HEIGHT / 2, w: OBSTACLE_WIDTH, h: OBSTACLE_HEIGHT, color: getRandomObstacleColor() }
                );
            }

            round.spot.x = targetX;
        }

        // v2.30.1: Fix missing collision check
        checkCollisions();

    } else if (gameState === STATE.DRIFTING) {
        let angleDiff = 0; // v3.99: Define in outer scope

        if (car.driftType === 'donut') {
            // v3.72: ドーナツ物理
            // v3.74: 到達するように摩擦を軽減 (0.92 -> 0.96)
            // v3.101: さらに滑らかに (0.96 -> 0.985)
            car.vx *= 0.985;
            car.vy *= 0.985;
            car.spin *= 0.985; // スピン減衰も合わせる
        } else {
            car.vx *= 0.94;
            car.vy *= 0.97;
        }

        car.x += car.vx;
        car.y += car.vy;

        if (car.driftType === 'donut') {
            car.angle += car.spin;
            car.totalRotation += car.spin;

            // v3.73: 360度（2PI）回転したらピタッと止める
            if (Math.abs(car.totalRotation) >= Math.PI * 2) {
                car.angle = 0; // 正面向きで停止（スタイリッシュ！）
                car.spin = 0;
                // 強制的に停止させる（パーキング状態へ移行するか、摩擦を極大にする）
                car.vx *= 0.5;
                car.vy *= 0.5;
                // ドーナツ完了フラグ
                car.driftType = 'donut_finish';
            }
        } else if (car.driftType === 'donut_finish') {
            // 完了後の余韻（少し滑って止まる）
            car.vx *= 0.8;
            car.vy *= 0.8;
        } else {
            const targetAngle = -Math.PI;
            angleDiff = targetAngle - car.angle; // Assign to outer var
            // Faster rotation for parallel alignment (v2.8)
            car.angle += angleDiff * 0.15;

            // v3.73: 無限ループ防止（あまりにも遅くなったら強制停止）
            if (Math.abs(car.vx) < 0.1 && Math.abs(car.vy) < 0.1) {
                car.vx = 0;
                car.vy = 0;
                // この後の判定ロジックで停止とみなされるはず
            }
        }

        // Force stop if very slow to check result quickly
        const speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
        if (speed < 0.3) {
            checkResult();
        }

        // v2.30.1: Fix missing collision check
        checkCollisions();

        // v2.21: Used refactored helper updateTireMarks()
        updateTireMarks();

        // v2.40: Drift Smoke
        if (Math.abs(car.spin) > 0.01 || Math.abs(angleDiff) > 0.1) {
            // Calculate Rear Tires (Local Space)
            const rearX = -CAR_HEIGHT / 2 + 10;
            const tireY = CAR_WIDTH / 2 - 5;

            // Transform to World Space
            const cos = Math.cos(car.angle);
            const sin = Math.sin(car.angle);

            // Left Rear
            const lrX = car.x + (rearX * cos - (-tireY) * sin);
            const lrY = car.y + (rearX * sin + (-tireY) * cos);
            spawnDriftSmoke(lrX, lrY);

            // Right Rear
            const rrX = car.x + (rearX * cos - tireY * sin);
            const rrY = car.y + (rearX * sin + tireY * cos);
            spawnDriftSmoke(rrX, rrY);
        }
    }
    else if (gameState === STATE.CRASHED) {
        // v2.30.6: Revert to standard friction (Not floaty)
        car.vx *= 0.95;
        car.vy *= 0.95;
        car.x += car.vx;
        car.y += car.vy;
        car.angle += car.spin;

        // v2.30.7: Continuous Collision Check (Pinball effect)
        checkCollisions();
    }
    // v2.7 Auto-Align Removed (Replaced by Targeted Drift)

    // v2.11 Update Stats
    if (gameState !== STATE.TITLE && gameState !== STATE.SCROLLING) {
        hudDelayTimer += dt; // v2.30.19 Update HUD Timer
        const currentSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
        // Accumulate distance (pixels)
        totalDistance += currentSpeed;
    }

    // v2.30.30: Update Flying Score
    if (floatingScore) {
        if (floatingScore.state === 0) {
            // Phase 1: Floating Up (Road/World Space)
            floatingScore.y -= 20 * dt; // Slow float up
            floatingScore.timer += dt;
            if (floatingScore.timer > 1.2) {
                // Switch to Screen Space!
                const cameraX = getCameraFocusX() - canvas.width * 0.4;
                floatingScore.x -= cameraX; // Convert World X to Screen X
                // Y is already "World Y", but Camera Y is 0, so World Y == Screen Y (mostly)
                // Wait, logic check: 
                // Draw uses: translate(-cameraX, 0). 
                // So ScreenX = WorldX - cameraX. Correct.
                // ScreenY = WorldY. Correct.

                floatingScore.state = 1; // Start Flying
                floatingScore.isScreenSpace = true;
            }
        } else if (floatingScore.state === 1) {
            // Phase 2: Fly to HUD (Screen Space)
            // Target is the "Score Number" position
            ctx.font = '900 30px Inter, sans-serif'; // Must match HUD font

            let targetX = 0;
            let targetY = 40; // Default Y

            if (floatingScore.type === 'coin') {
                // Fly to COINS
                const prefix = `LEVEL ${level}  |  SCORE: ${score}  |  COINS: `;
                const prefixWidth = ctx.measureText(prefix).width;
                targetX = 40 + prefixWidth + 20;
            } else {
                // Fly to SCORE
                const prefix = `LEVEL ${level}  |  SCORE: `;
                const prefixWidth = ctx.measureText(prefix).width;
                targetX = 40 + prefixWidth + 20;
            }

            // Lerp
            const dx = targetX - floatingScore.x;
            const dy = targetY - floatingScore.y;

            // Fast Lerp
            floatingScore.x += dx * 5 * dt;
            floatingScore.y += dy * 5 * dt;


            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
                const particleColor = (floatingScore.type === 'coin') ? '#ffd700' : '#ffff00';
                spawnShatterParticles(floatingScore.x, floatingScore.y, particleColor);
                if (floatingScore.type !== 'coin') {
                    score += floatingScore.val; // ADD SCORE NOW
                }
                floatingScore = null;
            }
        }
    }
    // v2.30.40: Update Particles
    for (let i = scoreParticles.length - 1; i >= 0; i--) {
        const p = scoreParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 500 * dt; // Gravity
        p.alpha -= (p.decay || 2.0) * dt; // v2.92: Variable Decay

        if (p.alpha <= 0) {
            scoreParticles.splice(i, 1);
        }
    }

    // v2.40: Update Smoke Particles
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        const p = smokeParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size += p.growth * dt; // Expand
        p.alpha -= p.decay * dt; // Fade

        if (p.alpha <= 0) {
            smokeParticles.splice(i, 1);
        }
    }

    // v2.40: Update Screen Shake
    if (screenShake.intensity > 0) {
        // Random shake offset
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;

        // Decay
        screenShake.intensity -= 60 * dt; // v2.92: Faster decay (Snappier)
        if (screenShake.intensity < 0) {
            screenShake.intensity = 0;
            screenShake.x = 0;
            screenShake.y = 0;
        }
    }

    // v3.105: Update Speedometer Opacity
    let showSpeedometer = false;
    if (gameState === STATE.DRIFTING) {
        showSpeedometer = true;
    } else if (gameState === STATE.PLAYING) {
        // v3.107: タイトル・GO表示を過ぎるまで表示しない (GOは+400あたり)
        // car.x が titleFlowStartX + 600 を超えたら表示開始
        if (car.x > titleFlowStartX + 670) {
            showSpeedometer = true;
        }
    }

    if (showSpeedometer) {
        speedometerOpacity += 2.0 * dt; // Fade in
        if (speedometerOpacity > 1.0) speedometerOpacity = 1.0;
    } else {
        speedometerOpacity -= 2.0 * dt; // Fade out
        if (speedometerOpacity < 0) speedometerOpacity = 0;
    }
}

function checkCollisions() {
    const carBounds = getCarBounds();
    for (const c of round.cars) {
        if (checkRectOverlap(carBounds, c)) {
            triggerCrash(c);
            return;
        }
    }
}

function triggerCrash(obstacle) {
    const isFirstHit = (gameState !== STATE.CRASHED);
    gameState = STATE.CRASHED;

    if (isFirstHit) {
        addScreenShake(20); // v2.40: Crash Impact Shake (First Hit Only)
        targetZoom = 1.4;   // v2.95: Crash Zoom (Action!)
        soundManager.playCrash(); // v3.00: Crash Sound
    }

    // v2.30.4: Realistic AABB Collision Response
    // Calculate overlap to determine collision normal
    const bounds = getCarBounds();
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const ox = obstacle.x + obstacle.w / 2;
    const oy = obstacle.y + obstacle.h / 2;

    const halfW = bounds.w / 2 + obstacle.w / 2;
    const halfH = bounds.h / 2 + obstacle.h / 2;

    const overlapX = halfW - Math.abs(cx - ox);
    const overlapY = halfH - Math.abs(cy - oy);

    // v2.30.5: "Dull Thud" - Absorbs energy, effectively stopping on axis
    const restitution = 0.1; // Almost no bounce
    const friction = 0.9;    // High sliding friction (grinding)

    let contactX = cx;
    let contactY = cy;

    // Resolve on shallowest axis
    if (overlapX < overlapY) {
        // Horizontal Hit
        car.vx = -car.vx * restitution;
        car.vy *= friction;
        // v2.61: Contact Point Calculation
        contactX = (cx < ox) ? (ox - obstacle.w / 2) : (ox + obstacle.w / 2);
        contactY = Math.max(obstacle.y, Math.min(obstacle.y + obstacle.h, cy));
    } else {
        // 垂直ヒット
        car.vy = -car.vy * restitution;
        car.vx *= friction;
        // v2.61: Contact Point Calculation
        contactY = (cy < oy) ? (oy - obstacle.h / 2) : (oy + obstacle.h / 2);
        contactX = Math.max(obstacle.x, Math.min(obstacle.x + obstacle.w, cx));
    }

    // Impact Spin: Proportional to impact speed
    const impactSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    car.spin = (Math.random() > 0.5 ? 1 : -1) * Math.min(0.5, impactSpeed * 0.05);

    // v2.37: Spawn Shatter Particles on Impact
    // Use obstacle color and position to simulate it shattering
    // v2.90: World Space Debris

    // v2.91: Calculate Normal for Debris Direction
    // car.vx/vy are already modified by response, so we deduce from impact axis
    let normalX = 0;
    let normalY = 0;

    // overlapX < overlapY means Horizontal Hit
    if (overlapX < overlapY) {
        // If car center is Left of Obstacle center, hit was on Left face.
        // Debris should fly LEFT (-1).
        // Wait, debris comes from Obstacle? Or Car?
        // User said "Only the hit place shatters" - like obstacle is breaking.
        // So debris should fly INTO the car (opposite of normal) or SCATTER OUT from contact?
        // Usually, if I hit a wall, fragments fly OUT from the wall.
        // Wall Normal points OUT.
        // If I hit Left Face (Car < Obs), Normal is (-1, 0).
        // Debris should fly predominantly Left (-1).

        normalX = (cx < ox) ? -1 : 1;
    } else {
        // 垂直ヒット
        normalY = (cy < oy) ? -1 : 1;
    }

    // Add some car velocity influence?
    // If I hit hard, debris flies faster.
    const debrisImpulse = { x: normalX * 2.5, y: normalY * 2.5 }; // v2.92: Higher Impulse

    if (isFirstHit) {
        // v2.99: Tilt Camera based on normal
        // If normalX is -1 (Hit Right side, debris goes Left), tilt?
        // Let's tilt towards the impact or away?
        // Random is also good for chaos.
        // Let's try: Tilt in direction of impact normal (Visualizing force)
        // normalX = -1 -> Tilt -0.1 ?
        cameraAngle = normalX * 0.15 + (Math.random() - 0.5) * 0.05;

        spawnShatterParticles(contactX, contactY, obstacle.color, 'world', debrisImpulse);

        setTimeout(() => {
            failRound("CRASH");
        }, 800);
    }
}

function getCarBounds() {
    const absAngle = Math.abs(car.angle);
    const isVertical = absAngle > Math.PI * 0.3 && absAngle < Math.PI * 0.7;
    const w = isVertical ? CAR_WIDTH : CAR_HEIGHT;
    const h = isVertical ? CAR_HEIGHT : CAR_WIDTH;
    return { x: car.x - w / 2, y: car.y - h / 2, w: w, h: h };
}

function checkRectOverlap(r1, r2) {
    return !(r1.x > r2.x + r2.w || r1.x + r1.w < r2.x || r1.y > r2.y + r2.h || r1.y + r1.h < r2.y);
}

function checkResult() {
    // v3.97: Safety check
    if (!round || !round.spot) {
        console.warn("checkResult: round.spot missing");
        failRound("ERROR");
        return;
    }

    const bounds = getCarBounds();
    const spot = round.spot;

    const angleErr = Math.abs(Math.abs(car.angle) - Math.PI);
    // v3.72: ドーナツドリフトは角度制限を緩和（スタイリッシュさ優先）
    // v3.72: ドーナツドリフトは角度制限を緩和（スタイリッシュさ優先）
    // v3.103: 'donut_finish' も判定対象に含める
    if (car.driftType === 'donut' || car.driftType === 'donut_finish') {
        // ドーナツは回転終了後（0度）で止まるため、角度チェックはスキップ
    } else {
        if (angleErr > 0.8) {
            failRound("BAD ANGLE");
            return;
        }
    }

    const carCenter = bounds.x + bounds.w / 2;
    const spotCenter = spot.x;
    const dist = Math.abs(carCenter - spotCenter);
    const parkedY = spot.y;
    const carY = bounds.y + bounds.h / 2;
    const distY = Math.abs(carY - parkedY);
    const totalDiff = Math.sqrt(dist * dist + distY * distY);

    if (totalDiff < 50) {
        // v3.72: ドーナツ成功なら特別評価
        if (car.driftType === 'donut' || car.driftType === 'donut_finish') nextRound("STYLISH!");
        else nextRound("PERFECT");
    }
    else if (totalDiff < 100) { nextRound("GREAT"); }
    else if (totalDiff < 150) { nextRound("OK"); }
    else { failRound("BAD PARK"); }
}

function failRound(reason) {
    // v2.30.9: Prevent double-trigger (Gakugaku fix)
    // If we are already showing result/level up, don't reset flow.
    if (gameState === STATE.RESULT || gameState === STATE.LEVEL_UP || gameState === STATE.SCROLLING) return;

    gameState = STATE.RESULT;
    resultText = reason;
    resultColor = '#ff4444';

    // Setup Ui Flow
    resultFlowStartX = car.x;
    isResultFlowing = true;

    if (isDemoDrifting) {
        titleDemoState = 2;
        gameState = STATE.TITLE;
        titleIdleTimer = 0;
        titleParkX = car.x;
        isDemoDrifting = false; // Reset logic flag
        return;
    }

    // v3.75: Spaceキーでのリトライを可能にするため、即座に入力ロック（LEVEL_UP）しない
    // gameState = STATE.LEVEL_UP; // Lock input <-- Removed to allow retry

    setTimeout(() => {
        // ユーザーが既にリスタートしているか確認
        if (gameState !== STATE.RESULT) return;

        // Start Scrolling
        scrollFocusX = car.x;
        targetZoom = 1.0; // v3.00: Reset Zoom for next round
        cameraAngle = 0;   // v3.00: Reset Tilt for next round
        gameState = STATE.SCROLLING;
    }, 1500);

    // v2.38: Check High Score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('preSpaceHighScore', highScore);
    }

    consecutiveWins = 0;
    perfectCombo = 0; // Reset Combo on Fail
}

function nextRound(rank) {
    // v2.27 Title Demo Ghost-AI return
    if (isDemoDrifting) {
        resultText = rank;
        resultColor = '#44ff44';
        resultFlowStartX = car.x;
        isResultFlowing = true;
        titleDemoState = 2;
        gameState = STATE.TITLE;
        titleIdleTimer = 0;
        titleParkX = car.x;
        isDemoDrifting = false; // Reset logic flag
        return;
    }

    // v2.30.30: New Scoring Logic (Level * Rank)
    // PERFECT:100, GREAT:50, OK:25, BAD:10
    let basePoints = 10;
    let comboMultiplier = 1;
    let bonusCoin = false; // v2.95 Bonus Coin Flag

    if (rank === "PERFECT") {
        basePoints = 100;
        addScreenShake(10); // v2.40: Perfect Impact Shake

        // v2.41: Combo Logic
        perfectCombo++;
        if (perfectCombo > 1) {
            comboMultiplier = 1 + (perfectCombo * 0.5); // 1.5x, 2.0x, 2.5x...
        }

        // v2.95: Sweet Spot Check (Center alignment)
        // car.x is compared to round.spot.x
        // Sweet spot width is 30% of spot (set in startRound or effectively calculated)
        // round.spot.w is gapSize.
        const sweetSpotHalf = (round.spot.w * 0.3) / 2;
        if (Math.abs(car.x - round.spot.x) < sweetSpotHalf) {
            bonusCoin = true;
            coins++;
            saveGameData();
            soundManager.playCoin(); // v3.00: Coin Sound
        }
    }
    else {
        // Reset Combo if not Perfect
        perfectCombo = 0;
        if (rank === "GREAT") basePoints = 50;
        else if (rank === "OK") basePoints = 25;
    }

    // v3.20: Refined Scoring Rules
    // Score: only for Standard Parking between cars
    // Coins: only for Coin Spot OR Game Clear
    let earned = 0;
    let scoreText = "";

    if (round.isCoinSpot) {
        // Coin Spot: No Score (or very low), +1 Coin on PERFECT
        if (bonusCoin) {
            scoreText = "+1 COIN";
            earned = 0; // No score for coin spot as per rule
        } else {
            scoreText = rank; // Just show rank if not perfect
        }
    } else {
        // Standard Parking: Score based on Level and Rank
        earned = Math.floor(level * basePoints * comboMultiplier);
        scoreText = "+" + earned;
        if (comboMultiplier > 1) {
            scoreText += ` (x${comboMultiplier.toFixed(1)})`;
        }
    }

    if (bonusCoin) {
        // Spawn extra particles for coin
        spawnShatterParticles(car.x, car.y - 20, '#ffd700', 'world');
    }

    floatingScore = {
        val: earned,
        x: car.x,
        y: car.y - 50,
        text: scoreText,
        state: 0,
        timer: 0,
        type: (round.isCoinSpot && bonusCoin) ? 'coin' : 'score' // v3.50: Tag type
    };

    // v3.50: Coin Spot does NOT increase level
    if (!round.isCoinSpot) {
        level++;
    }

    // v2.30.29: Level 5 Cap - Game Clear
    if (level > 5) {
        gameClear();
        return;
    }

    // v2.30.21: Set up Road Marking for Next Level
    // v2.30.34: Pull closer (600) so it is actually seen during the scroll! (1500 was off-screen)
    levelMarking = {
        x: car.x + canvas.width,
        level: level
    };

    resultText = rank;
    resultColor = '#44ff44';

    // Snap Removed (v2.9) - Relying on physics precision
    // car.y = round.spot.y;
    // car.angle = -Math.PI;
    // car.vx = 0;
    // car.vy = 0;

    // Setup Ui Flow
    resultFlowStartX = car.x;
    isResultFlowing = true;

    gameState = STATE.LEVEL_UP;

    setTimeout(() => {
        // Start Scrolling
        scrollFocusX = car.x;
        targetZoom = 1.0; // v3.00: Reset Zoom for next round
        cameraAngle = 0;   // v3.00: Reset Tilt for next round
        gameState = STATE.SCROLLING;
    }, 1500);
}

function gameClear() {
    // v2.30.29: All Clear Logic
    gameState = STATE.RESULT;
    resultText = "ALL CLEAR!";
    resultColor = '#ffff00'; // Gold

    // Setup UI Flow (Result Screen)
    resultFlowStartX = car.x;
    isResultFlowing = true;

    // Do NOT transition to STATE.SCROLLING or STATE.LEVEL_UP
    // Just stay here until restart (Space logic in handleInput should handle reset)

    // v2.38: Check High Score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('preSpaceHighScore', highScore);
    }

    // v2.50: Award Coin
    coins++;
    saveGameData();
    soundManager.playCoin(); // v3.00: Coin Sound

    resultText += "\nCOIN GET!"; // Show User
}

function saveGameData() {
    localStorage.setItem('preSpaceCoins', coins);
    localStorage.setItem('preSpaceSkins', JSON.stringify(unlockedSkins));
    localStorage.setItem('preSpaceCurrentSkin', currentSkinId);
}

function tryBuySkin(index) {
    const skin = SKINS[index];
    if (unlockedSkins.includes(skin.id)) {
        // Equip
        currentSkinId = skin.id;
        saveGameData();
        addScreenShake(5);
    } else {
        // Buy
        if (coins >= skin.price) {
            coins -= skin.price;
            unlockedSkins.push(skin.id);
            currentSkinId = skin.id;
            saveGameData();
            addScreenShake(10);
            spawnShatterParticles(canvas.width / 2, canvas.height / 2, skin.color);
        } else {
            // Fail
            addScreenShake(2); // Negative feedback
        }
    }
}

function getCameraFocusX() {
    if (gameState === STATE.SCROLLING) {
        return scrollFocusX; // v3.105: ENTRY now follows car.x
    }
    return car.x;
}

function draw() {
    // v3.21: Explicitly reset context state to prevent ghosting/afterimages
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.filter = 'none';

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    const focusX = getCameraFocusX();
    // v2.17.5 Shift camera significantly forward (0.4) to accommodate "Behind" HUD
    const cameraX = focusX - canvas.width * 0.4;

    // v2.95: Apply Zoom (Centered on focus point roughly)
    const zoomCenterX = canvas.width * 0.4;
    const zoomCenterY = canvas.height / 2;

    ctx.translate(zoomCenterX, zoomCenterY);
    ctx.scale(cameraZoom, cameraZoom);
    // v2.99: Apply Tilt
    ctx.rotate(cameraAngle);
    ctx.translate(-zoomCenterX, -zoomCenterY);

    // v2.40: Apply Screen Shake
    ctx.translate(-cameraX + screenShake.x, screenShake.y);

    const centerY = canvas.height / 2;
    const roadHalfWidth = 140;
    const roadTop = centerY - roadHalfWidth;
    const roadBottom = centerY + roadHalfWidth;

    ctx.fillStyle = '#2e2e2e'; // v2.70: Brightened Parking Lane (was #222)
    ctx.fillRect(cameraX, roadTop - 120, canvas.width + 1000, 120);

    ctx.fillStyle = '#333';
    ctx.fillRect(cameraX, roadTop, canvas.width + 1000, roadHalfWidth * 2);

    // Center Line
    ctx.beginPath();
    ctx.strokeStyle = '#DAA520';
    ctx.lineWidth = 4;
    ctx.setLineDash([40, 40]);

    // v3.96: Restore missing Center Line drawing (was accidentally removed?)
    const dashPeriod = 80;
    const startXUnrounded = cameraX - 2000;
    const worldStartX = Math.floor(startXUnrounded / dashPeriod) * dashPeriod;
    const worldEndX = cameraX + canvas.width + 2000;

    ctx.lineDashOffset = 0;
    ctx.moveTo(worldStartX, centerY);
    ctx.lineTo(worldEndX, centerY);
    ctx.stroke();
    ctx.setLineDash([]); // Reset for other drawings

    // v3.67: Refined Road Markings - UI only (GO/SHOP)
    // v3.95: Allow to flow away in PLAYING state (removed state check)
    if (isTitleFlowing) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '900 80px Inter, sans-serif';
        // Removed skew (User request: "Not italic")

        // "GO" Marking (Main Lane)
        // Always visible (or dimmed if not selected, but user didn't say hide it)
        // v3.95: Use titleFlowStartX (Anchor) instead of car.x so it freezes when game starts
        const goX = titleFlowStartX + 400;
        const goY = centerY + 70; // v3.98: Perfectly centered in lane (was +64)

        ctx.textBaseline = 'middle'; // Center vertically
        ctx.fillStyle = (selectLane === 0) ? '#ffffff' : 'rgba(255,255,255,0.4)';
        ctx.fillText("GO", goX, goY);
        ctx.textBaseline = 'alphabetic'; // Reset

        // v3.72: Highway Style Straight Arrow
        if (selectLane === 0) {
            ctx.save();
            const ax = goX + 160; // Moved more right
            const ay = goY; // Perfectly centered on lane (matches goY now)
            ctx.translate(ax, ay);

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();

            // Standard Highway Straight Arrow (Elongated)
            // Head
            ctx.moveTo(60, 0);    // Point
            ctx.lineTo(20, -35);  // Top Left
            ctx.lineTo(20, -12);  // Shaft Top
            ctx.lineTo(-60, -12); // Shaft Tail Top
            ctx.lineTo(-60, 12);  // Shaft Tail Bottom
            ctx.lineTo(20, 12);   // Shaft Bottom
            ctx.lineTo(20, 35);   // Bottom Left
            ctx.closePath();

            ctx.fill();
            ctx.restore();
        }

        // "SHOP" Lane Interaction
        // Use outer variables: centerY, roadHalfWidth, roadBottom
        const shopLaneY = roadBottom + 70;
        const shopX = titleFlowStartX + 400;

        if (selectLane === 0) {
            // v3.85: Hint Text "PRESS ↓" floating in empty space
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // Ghostly
            ctx.font = '900 30px Inter, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center'; // Ensure center alignment
            ctx.fillText("PRESS ↓,go to shop", shopX + 50, shopLaneY);
            ctx.restore();
        }
        else if (selectLane === 1) {
            // v3.95: Reverted to Straight Third Lane (User feedback: Curve looked weird)

            // Draw Third Lane Asphalt
            ctx.fillStyle = '#333';
            ctx.fillRect(cameraX, roadBottom, canvas.width + 1000, 140);

            // Lane Divider (Dashed)
            ctx.beginPath();
            ctx.strokeStyle = '#DAA520';
            ctx.lineWidth = 4;
            ctx.setLineDash([40, 40]);
            const dashPeriod = 80;
            const startXUnrounded = cameraX - 2000;
            const worldStartX = Math.floor(startXUnrounded / dashPeriod) * dashPeriod;
            const worldEndX = cameraX + canvas.width + 2000;
            ctx.lineDashOffset = 0;
            ctx.moveTo(worldStartX, roadBottom);
            ctx.lineTo(worldEndX, roadBottom);
            ctx.stroke();
            ctx.setLineDash([]);

            // Lane White Edge
            ctx.fillStyle = '#fff';
            ctx.fillRect(cameraX, roadBottom + 134, canvas.width + 1000, 6);

            // SHOP Text (Centered in Lane)
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText("SHOP     ", shopX, shopLaneY);
            ctx.textBaseline = 'alphabetic';

            // Arrow (Highway Style)
            ctx.save();
            const ax = shopX + 160;
            const ay = shopLaneY;
            ctx.translate(ax, ay);

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            // Standard Highway Straight Arrow (Elongated)
            ctx.moveTo(60, 0);
            ctx.lineTo(20, -35);
            ctx.lineTo(20, -12);
            ctx.lineTo(-60, -12);
            ctx.lineTo(-60, 12);
            ctx.lineTo(20, 12);
            ctx.lineTo(20, 35);
            ctx.closePath();

            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    ctx.fillStyle = '#fff';
    ctx.fillRect(cameraX, roadTop, canvas.width + 1000, 6);
    ctx.fillRect(cameraX, roadBottom, canvas.width + 1000, 6);

    // v3.70 - v3.32: Old Pit-In Code REMOVED


    // v3.32: Natural Exit Ramp Blending (Gore Area + Chevrons)
    if (gameState === STATE.EXITING) {
        ctx.save();
        const startX = exitTargetX;
        const startY = exitStartY;

        // 1. Ramp Asphalt with Gradient Blending
        const rampGrad = ctx.createLinearGradient(startX, roadBottom, startX + 300, roadBottom);
        rampGrad.addColorStop(0, '#333'); // Matches main road
        rampGrad.addColorStop(1, '#111'); // Darker pit lane
        ctx.fillStyle = rampGrad;

        ctx.beginPath();
        ctx.moveTo(startX, roadBottom - 20);
        ctx.bezierCurveTo(startX + 300, roadBottom - 20, startX + 500, roadBottom + 150, startX + 800, roadBottom + 400);
        ctx.lineTo(startX + 800, roadBottom + 700);
        ctx.lineTo(startX - 200, roadBottom + 700);
        ctx.lineTo(startX - 200, roadBottom - 20);
        ctx.closePath();
        ctx.fill();

        // 2. Gore Area (Triangular divider)
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(startX, roadBottom - 6);
        ctx.lineTo(startX + 400, roadBottom - 6);
        ctx.bezierCurveTo(startX + 300, roadBottom - 6, startX + 200, roadBottom - 6, startX, roadBottom - 6);
        ctx.closePath();
        ctx.fill();

        // 3. Chevrons in Gore Area
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 4;
        for (let i = 0; i < 5; i++) {
            const cx = startX + 50 + i * 60;
            const cy = roadBottom - 6;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + 30, cy + 30);
            ctx.stroke();
        }

        // 4. White edge lines (Double)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 6;

        ctx.beginPath();
        ctx.moveTo(startX, roadBottom - 20);
        ctx.bezierCurveTo(startX + 300, roadBottom - 20, startX + 500, roadBottom + 130, startX + 800, roadBottom + 380);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(startX, roadBottom + 10);
        ctx.bezierCurveTo(startX + 300, roadBottom + 10, startX + 500, roadBottom + 170, startX + 800, roadBottom + 420);
        ctx.stroke();
        ctx.restore();
    }

    // Tire Marks (v2.6)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (const m of round.tireMarks) {
        // Optimization: Don't draw if off screen
        if (m.x2 < cameraX - 100 || m.x1 > cameraX + canvas.width + 100) continue;

        ctx.moveTo(m.x1, m.y1);
        ctx.lineTo(m.x2, m.y2);
    }
    ctx.stroke();

    // v2.98: Coin Spot Visual (Moved to earlier layer for correct layering)
    if (round.isCoinSpot) {
        ctx.save();
        const sweetSpotW = round.spot.w;
        const sweetSpotX = round.spot.x;
        const spotY = round.spot.y;

        // Realistic White Frame (Solid)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.setLineDash([]); // Solid
        const frameW = sweetSpotW;
        const frameH = 60;
        ctx.strokeRect(sweetSpotX - frameW / 2, spotY - frameH / 2, frameW, frameH);

        // v3.10: Detailed Parking Meter Object
        const meterX = sweetSpotX - frameW / 2 - 20; // Slightly left of spot
        const meterY = spotY - frameH / 2 - 10;    // Slightly above

        // 1. Pole with Metallic Gradient
        const poleGrad = ctx.createLinearGradient(meterX - 3, 0, meterX + 3, 0);
        poleGrad.addColorStop(0, '#444');
        poleGrad.addColorStop(0.5, '#aaa');
        poleGrad.addColorStop(1, '#444');
        ctx.fillStyle = poleGrad;
        ctx.fillRect(meterX - 3, meterY - 20, 6, 35); // Slightly thicker pole

        // 2. Head Housing (Trapezoid/Rounded)
        ctx.fillStyle = '#222';
        const headW = 18;
        const headH = 24;

        // Base of the head
        ctx.beginPath();
        ctx.moveTo(meterX - headW / 2, meterY - 15);
        ctx.lineTo(meterX + headW / 2, meterY - 15);
        ctx.lineTo(meterX + headW / 2 + 2, meterY - 25);
        ctx.lineTo(meterX - headW / 2 - 2, meterY - 25);
        ctx.fill();

        // Main Body (Dome top)
        ctx.beginPath();
        ctx.arc(meterX, meterY - 32, headW / 2 + 2, Math.PI, 0); // Dome
        ctx.lineTo(meterX + headW / 2 + 2, meterY - 25);
        ctx.lineTo(meterX - headW / 2 - 2, meterY - 25);
        ctx.closePath();
        ctx.fill();

        // 3. Digital Screen (Glowing)
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(meterX - 6, meterY - 34, 12, 8);

        ctx.fillStyle = '#00ff44';
        ctx.font = '900 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("$", meterX, meterY - 28); // "P" would also work

        // 4. Glossy Highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(meterX, meterY - 32, headW / 2, Math.PI * 1.2, Math.PI * 1.5);
        ctx.stroke();

        // Text (Cleaner style)
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("COIN SPOT", sweetSpotX, spotY + 10);
        ctx.font = '700 16px Inter, sans-serif';
        ctx.fillText("PERFECT = COIN", sweetSpotX, spotY + 35);

        ctx.restore();
    }

    // DRAW UI TEXT ON ROAD (BEHIND CARS)

    // Title
    if (isTitleFlowing) {
        // Define titleX (Center of camera view)
        // v2.18.1 Fix: Camera is at focusX - 0.4*W. So screen left is focusX - 0.4*W.
        // Center is focusX + 0.1*W. (0.5 - 0.4 = 0.1)
        const titleX = titleFlowStartX + canvas.width * 0.1;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.save();
        // Title: Center
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';
        ctx.font = '900 120px Inter, sans-serif';
        // HTML was translateY(0). Flex centered. 
        // v2.18.2 Move to Left Lane Center (centerY - 70) -> v2.18.3 Lowered to -40 (User feedback)
        ctx.fillText("presSpace", titleX, centerY - 40);

        // Instruction: 2rem margin top (approx 32px)
        if (showTitleInstruction && (gameState === STATE.TITLE || gameState === STATE.SELECT_MODE)) {
            ctx.font = '24px Inter, sans-serif';
            // Add simple blink effect
            const blinkOp = (Math.sin(performance.now() / 300) + 1) / 2 * 0.5 + 0.3; // 0.3 to 0.8
            ctx.fillStyle = `rgba(255, 255, 255, ${blinkOp})`;
            ctx.fillText("TAP / SPACE", titleX, centerY + 60);
        }

        // v3.57: 入力モードを確認してUI要素（スコア、オプション、バージョン）のみを表示 -> v3.95: 常に表示（流れていくように）
        if (true) {
            // v2.38: Display High Score on Title
            ctx.font = '900 30px Inter, sans-serif';
            ctx.fillStyle = 'rgba(255, 215, 0, 0.9)'; // Goldish
            ctx.fillText(`BEST: ${highScore}`, titleX, centerY + 130);

            // v3.66: Road Markings moved to world space loop
            ctx.textAlign = 'right';

            ctx.textAlign = 'right';
            ctx.fillStyle = 'white'; // Reset
            ctx.font = '900 20px Inter, sans-serif';
            const verX = titleX + 320; // Moved right as requested
            const verY = centerY - 10; // v3.98: Moved down
            ctx.fillText("Ver01.11.16.61s", verX, verY);


        }

        ctx.restore();
    }

    // Result
    if (isResultFlowing) {
        ctx.save();
        const resX = resultFlowStartX + 200; // Offset slightly from car
        ctx.textAlign = 'center';

        ctx.fillStyle = resultColor;
        ctx.font = '900 80px Inter, sans-serif';
        ctx.fillText(resultText, resX, centerY - 20);

        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '30px Inter, sans-serif';
        ctx.fillText(`SCORE: ${score}`, resX, centerY + 40);

        // v2.30.21: Removed floating "NEXT LEVEL" (Moved to Road Marking)

        ctx.restore();
    }

    // v2.30.21: Draw Level Up Road Markings (World Space)
    if (levelMarking.x !== null) {
        // Only draw if within reasonable distance (optimization)
        if (levelMarking.x > cameraX - 1000 && levelMarking.x < cameraX + canvas.width + 1000) {
            ctx.save();
            ctx.textAlign = 'center';
            // v2.30.27: 垂直方向中央揃え（100pxフォント用に+35オフセット）
            const leftLaneY = centerY - 70;
            const drivingY = centerY + 68;

            ctx.fillStyle = 'rgba(238, 187, 0, 0.8)'; // Road Yellow
            ctx.font = '900 100px Inter, sans-serif';

            // Left Lane: "LEVEL"
            ctx.fillText("LEVEL", levelMarking.x, leftLaneY + 35);

            // Right Lane: Number
            ctx.fillText(levelMarking.level.toString(), levelMarking.x, drivingY + 35);

            ctx.restore();
        }
    }

    // v2.30.30: Draw Flying Score
    // v2.30.30: Draw Flying Score (World Space Phase)
    if (floatingScore && !floatingScore.isScreenSpace) {
        ctx.save();
        ctx.fillStyle = '#ffff00';
        ctx.font = '900 40px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 10;
        ctx.fillText(floatingScore.text, floatingScore.x, floatingScore.y);
        ctx.restore();
    }

    // v2.40: Draw Smoke Particles (World Space, Behind Cars)
    for (const p of smokeParticles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = '#DDDDDD'; // White/Grey Smoke
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // v2.90: Draw World Space Particles (Debris)
    for (const p of scoreParticles) {
        if (p.space !== 'world') continue;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        if (p.rotation !== undefined) {
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            p.rotation += p.rotSpeed * 0.016; // Update rotation
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.restore();
    }

    for (const c of round.cars) {
        ctx.fillStyle = c.color;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(c.x + 20, c.y + 5, c.w - 40, c.h - 10);
        ctx.fillStyle = '#111';
        ctx.fillRect(c.x + 25, c.y + 8, c.w - 50, c.h - 16);
    }

    ctx.save(); // v2.30.15: Isolate Car Transform
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    // v2.50: Dynamic Skin
    // const currentSkin = SKINS.find(s => s.id === currentSkinId) || SKINS[0]; (Unused local var)
    // const renderSkin = (gameState === STATE.SHOP) ? SKINS[shopSelection] : currentSkin; (Unused logic for MAIN draw)

    const skin = SKINS.find(s => s.id === currentSkinId) || SKINS[0];

    // v2.80: Detailed Car Render
    // v2.80: Detailed Car Render
    drawCar(0, 0, skin, 1.0); // 0,0 because we are already translated/rotated
    ctx.restore(); // v2.30.15: Back to Camera Space for HUD

    // v3.65: Player-Side HUD (Restored)
    // v3.102: Hide in Title/Select/Entry modes (Too early) -> v3.105: Use Opacity Fade
    if (speedometerOpacity > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${speedometerOpacity})`; // v3.105: Dynamic Opacity
        ctx.font = '900 16px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;

        // Calculate values
        const currentSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
        const kmh = Math.floor(currentSpeed * 10);
        const km = (totalDistance / 2000).toFixed(1);

        ctx.fillText(`${kmh} km/h`, car.x - 60, car.y - 10);
        ctx.fillText(`${km} km`, car.x - 60, car.y + 10);

        // Progress Bar to Next Level? Optional. Just text for now.
        ctx.restore();
    }


    // v3.65: Player-Side HUD (Restored) - NOW HANDLED IN renderHUD

    ctx.restore(); // Restore Camera Transform (Back to Screen Space)

    // v2.30.38: Draw Flying Score (Screen Space Phase)
    if (floatingScore && floatingScore.isScreenSpace) {
        ctx.save();
        ctx.fillStyle = '#ffff00';
        ctx.font = '900 40px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 10;
        ctx.fillText(floatingScore.text, floatingScore.x, floatingScore.y);
        ctx.restore();
    }

    // v2.30.40: Draw Particles (Screen Space)
    for (const p of scoreParticles) {
        if (p.space === 'world') continue; // Skip world particles
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        // v2.62: Rotation support
        if (p.rotation !== undefined) {
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            p.rotation += p.rotSpeed * 0.016; // Update rotation
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.restore();
    }

    // UI Layer
    renderHUD();

    if (gameState === STATE.SELECT_MODE) {
        renderSelectMode(cameraX);
    }

    if (gameState === STATE.SHOP) {
        renderShop();
    }

    // v3.40: Audio Settings Overlay
    if (showAudioMenu) {
        drawAudioSettings();
    }

    // v3.55: Draw Mute Button (Always on top)
    drawMuteButton();
}

function renderHUD() {
    // Player HUD (Top Left / Or Player Side)

    // 1. Text Based HUD (Top Left)
    // Always show HUD
    ctx.fillStyle = 'white';
    ctx.font = '900 30px Inter, sans-serif'; // Matches floating score style
    ctx.textAlign = 'left';

    // Calculate display values
    const currentSpeed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    const kmh = Math.floor(currentSpeed * 10);
    // Distance: pixels / 1000 = km? roughly.
    const km = (totalDistance / 2000).toFixed(1);

    ctx.fillText(`LEVEL ${level}  |  SCORE: ${score}  |  COINS: ${coins}`, 40, 50);
    // ctx.fillText(`SPEED: ${kmh} km/h  |  DIST: ${km} km`, 40, 85); // Optional

    // 2. Player Side HUD (Near Car) - Only in active states
    if (gameState === STATE.PLAYING || gameState === STATE.DRIFTING || gameState === STATE.ENTRY || gameState === STATE.SELECT_MODE) {
        ctx.save();
        // Note: We are in Screen Space here. But we want to draw near the car.
        // If we want to draw relative to the car in screen space:
        // We need the car's screen position.
        // Earlier code was doing this inside `ctx.translate(car.x, car.y)` block which was CAMERA SPACE (relative to 0,0 center).
        // But here we are in SCREEN SPACE (0,0 is top left).
        // Wait, the original code for Player-Side HUD (lines 2242) was inside the Camera Transform block.
        // If I move it here (Screen Space), I need to project it?
        // OR I should have kept it in the Camera Transform block?
        // The original code passed `draw()` did: `ctx.restore(); // Back to Screen Space` at line 2263.
        // The block at 2242 was BEFORE 2263.
        // So `renderHUD` is called AFTER 2263 (in Screen Space).
        // So the Player-Side HUD logic (2242) CANNOT simply be moved here unless we project coordinates.
        // However, I can omit the Player-Side HUD from `renderHUD` and leave it in `draw`?
        // BUT the refactor plan said "Extract HUD".
        // Let's check `draw` again in my previous view.
        // Lines 2263 is Restore.
        // Lines 2242 is BEFORE Restore.
        // Lines 2297 is AFTER Restore.
        // So there are TWO HUD blocks. One world-attached (2242), one screen-attached (2297).
        // I will extract the Screen-Attached one to `renderHUD`.
        // I will LEAVE the World-Attached one in place (or extract a `renderWorldHUD`?).
        // For simplicity and "safe refactor", I will leave the World-Attached one (2242) where it is (inside the camera transform).
        // The block I am replacing (2297 to 2454) is entirely Screen Space.
        // So `renderHUD` will only contain the Screen Space HUD (Level/Score).
        // The unused `kmh` calculation at 2304 was used for... nothing in the screen space block?
        // It was used for the commented out line 2387.
        // So it's fine.
    }
}

function renderSelectMode(cameraX) {
    ctx.save();
    const centerY = canvas.height / 2;

    // Draw Highway Gantry (Overhead)
    // Positioned ahead of the car
    const gantryX = (Math.floor(car.x / 4000) + 1) * 4000;

    // v3.05: Draw Exit Ramp visual starting to peel off
    ctx.strokeStyle = 'rgba(85, 85, 85, 0.8)';
    ctx.lineWidth = 140; // Match road width
    ctx.setLineDash([]);
    ctx.beginPath();
    // Starts straight, then curves down (Y+) starting at gantryX
    ctx.moveTo(gantryX - 400, centerY + 64);
    ctx.bezierCurveTo(gantryX + 200, centerY + 64, gantryX + 200, centerY + 300, gantryX + 1000, centerY + 500);
    ctx.stroke();

    // Check if visible
    if (gantryX > cameraX - 100 && gantryX < cameraX + canvas.width + 1000) {
        ctx.fillStyle = '#333';
        // Pillars
        ctx.fillRect(gantryX - 10, centerY - 300, 20, 500); // Behind main road
        ctx.fillRect(gantryX + 800, centerY - 300, 20, 700); // Far side (Exit ramp pillar)

        // Beam
        ctx.fillRect(gantryX - 10, centerY - 300, 830, 40);

        // Signs

        // Sign 1: GO! (Main) - Left Sign (Over Main Lane)
        ctx.fillStyle = '#0033aa'; // Blue Sign
        ctx.fillRect(gantryX + 100, centerY - 280, 250, 100);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.strokeRect(gantryX + 100, centerY - 280, 250, 100);

        ctx.fillStyle = 'white';
        ctx.font = '900 60px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("GO!", gantryX + 225, centerY - 210);

        // Sign 2: SHOP (Exit) - Right Sign (Over Exit Lane)
        ctx.fillStyle = '#00aa00'; // Green Sign
        ctx.fillRect(gantryX + 450, centerY - 280, 250, 100);
        ctx.strokeRect(gantryX + 450, centerY - 280, 250, 100);

        ctx.fillStyle = 'white';
        ctx.font = '900 40px Inter, sans-serif';
        ctx.fillText("SHOP", gantryX + 575, centerY - 220);
        ctx.font = '900 20px Inter, sans-serif';
        ctx.fillText("EXIT ↘", gantryX + 575, centerY - 190);
    }

    // Instruction Text (Screen Space) -> Wait, gantry drawing uses gantryX (World).
    // The previous code block (2313) started with ctx.save() but NO transform change.
    // BUT the context was restored to Screen Space (Identity) at 2263.
    // So drawing at gantryX (e.g. 4000) with Identity Transform draws at x=4000 on screen.
    // If the canvas is 1920 wide, x=4000 is invisible.
    // THIS MEANS THE GANTRY CODE WAS BUGGED/INVISIBLE previously unless cameraX was somehow involved in transform.
    // It wasn't.
    // For now, I preserve the logic as requested (Refactor, not fix unrequested bugs).
    // However, if I want to "Fix" it I should subtract cameraX?
    // "ctx.translate(-cameraX, 0);"?
    // The user didn't ask to fix bugs, but seeing as I am touching it...
    // The logic `gantryX > cameraX` implies it expects cameraX to matter.
    // I will ADD `ctx.translate(-cameraX, 0);` to make it work, assuming it was intended to be visible.
    // BUT `Select Mode` Gantry is for "Highway Exit Selection" which implies it should be visible.
    // Actually, `Select Mode` starts at `car.x=0`. `gantryX` is 4000.
    // The user sees the Road Markings (1801).
    // The Gantry is for endless scrolling where you pass gantries every 4km.
    // Since we only just implemented Select Mode as a start screen, we never reach 4km.
    // So this code is effectively dead/future-proofing.
    // I will leave it as is (Screen Space but using World coords = Invisible).

    ctx.restore(); // Back to Screen (Undo save at start)

    // Instruction Text (Screen Space)
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.font = '900 30px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.fillText("LANE [↑/↓]  SELECT [SPACE]", canvas.width / 2, canvas.height - 100);
    ctx.restore();
}

function renderShop() {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Overlay

    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';

    ctx.font = '900 40px Inter, sans-serif';
    ctx.fillText("SKIN SHOP", canvas.width / 2, 100);
    ctx.font = '900 20px Inter, sans-serif';
    ctx.fillText(`COINS: ${coins}`, canvas.width / 2, 140);

    // Draw Selected Skin Preview (Large)
    const skin = SKINS[shopSelection];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // v2.90: Use new renderer
    drawCar(cx, cy, skin, 2.0); // Scale 2.0

    // Info
    ctx.fillStyle = 'white';
    ctx.font = '900 30px Inter, sans-serif';
    ctx.fillText(skin.name, cx, cy + 150);

    // Status
    let statusText = `${skin.price} COIN`;
    let statusColor = '#ffff00';

    if (unlockedSkins.includes(skin.id)) {
        if (currentSkinId === skin.id) {
            statusText = "EQUIPPED";
            statusColor = '#00ff00';
        } else {
            statusText = "OWNED (SPACE TO EQUIP)";
            statusColor = '#ffffff';
        }
    } else {
        if (coins < skin.price) {
            statusText = `NEED ${skin.price} COIN`;
            statusColor = '#ff4444';
        } else {
            statusText = `BUY FOR ${skin.price} COIN (SPACE)`;
        }
    }

    ctx.fillStyle = statusColor;
    ctx.font = '900 24px Inter, sans-serif';
    ctx.fillText(statusText, cx, cy + 190);

    // Arrows
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText("< LEFT / RIGHT >", cx, cy + 240);
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText("[S] or [ESC] to RETURN", cx, canvas.height - 40);
}

function drawMuteButton() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Screen Space

    const btnSize = 40;
    const margin = 25;
    const x = canvas.width - margin - btnSize;
    const y = margin;

    // Hit area visual
    // ctx.fillStyle = 'rgba(255,00,0,0.3)';
    // ctx.fillRect(x, y, btnSize, btnSize);

    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.lineWidth = 3;

    if (soundManager.isMuted) {
        // Muted Icon (Speaker with X)
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 12);
        ctx.lineTo(x + 15, y + 12);
        ctx.lineTo(x + 25, y + 2);
        ctx.lineTo(x + 25, y + 38);
        ctx.lineTo(x + 15, y + 28);
        ctx.lineTo(x + 5, y + 28);
        ctx.closePath();
        ctx.stroke();

        // X
        ctx.beginPath();
        ctx.moveTo(x + 30, y + 15);
        ctx.lineTo(x + 40, y + 25);
        ctx.moveTo(x + 40, y + 15);
        ctx.lineTo(x + 30, y + 25);
        ctx.stroke();
    } else {
        // Unmuted Icon (Speaker with waves)
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 12);
        ctx.lineTo(x + 15, y + 12);
        ctx.lineTo(x + 25, y + 2);
        ctx.lineTo(x + 25, y + 38);
        ctx.lineTo(x + 15, y + 28);
        ctx.lineTo(x + 5, y + 28);
        ctx.closePath();
        ctx.fill(); // Filled for clarity

        // Waves
        ctx.beginPath();
        ctx.arc(x + 22, y + 20, 10, -0.3, 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 22, y + 20, 16, -0.4, 0.4);
        ctx.stroke();
    }

    ctx.restore();
}

function drawAudioSettings() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Screen Space

    const w = 400;
    const h = 350;
    const x = canvas.width / 2 - w / 2;
    const y = canvas.height / 2 - h / 2;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = '900 30px Inter, sans-serif';
    ctx.fillText("AUDIO OPTIONS", x + w / 2, y + 60);

    const options = [
        { label: "MOTOR SOUND", key: "engine" },
        { label: "SFX", key: "sfx" },
        { label: "UI SOUNDS", key: "ui" }
    ];

    options.forEach((opt, i) => {
        const oy = y + 130 + i * 60;
        const isSelected = (audioMenuSelection === i);
        const isOn = audioSettings[opt.key];

        ctx.fillStyle = isSelected ? '#ffff00' : 'white';
        ctx.font = isSelected ? '900 24px Inter, sans-serif' : '700 24px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(opt.label, x + 50, oy);

        // Toggle Switch Visual
        const sw = 60;
        const sh = 30;
        const sx = x + w - 50 - sw;
        const sy = oy - 22;

        ctx.fillStyle = isOn ? '#00bb00' : '#444';
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, 15);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.beginPath();
        const knobX = isOn ? sx + sw - 15 : sx + 15;
        ctx.arc(knobX, sy + sh / 2, 10, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected) {
            ctx.fillText(">", x + 25, oy);
        }
    });

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("[UP/DOWN] SELECT  [SPACE] TOGGLE  [A/ESC] CLOSE", x + w / 2, y + h - 30);

    ctx.restore();
}

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(dt, dt); // v3.12: Constant Speed
    updateUIFlow();
    draw();
    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// v2.90: Detailed Car Renderer (Multi-Model)
function drawCar(x, y, skin, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const length = CAR_HEIGHT; // 100
    const width = CAR_WIDTH;   // 60

    // Drop Shadow (Common)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.filter = 'blur(10px)';
    ctx.beginPath();
    ctx.roundRect(-length / 2 + 5, -width / 2 + 10, length, width - 10, 10);
    ctx.fill();
    ctx.filter = 'none';

    const model = skin.model || 'coupe';

    if (model === 'supercar') {
        drawSuperCar(skin, length, width);
    } else if (model === 'van') {
        drawVan(skin, length, width);
    } else {
        drawCoupe(skin, length, width);
    }

    // v3.110: Blinker Logic (Right Blinker for Shop Selection)
    if (gameState === STATE.SELECT_MODE && selectLane === 1) {
        // Blink every 300ms
        const blink = Math.floor(Date.now() / 300) % 2 === 0;
        if (blink) {
            ctx.fillStyle = '#ff8800'; // Bright Orange
            ctx.shadowColor = '#ff8800';
            ctx.shadowBlur = 20; // Stronger glow
            ctx.fillRect(-55, 20, 10, 10); // Much bigger for visibility check

            // Side/Front?
            ctx.fillRect(40, 25, 6, 6); // Front Right
            ctx.shadowBlur = 0;
        }
    }

    ctx.restore();
}

// Retro Coupe (Existing Logic)
function drawCoupe(skin, length, width) {
    const halfL = length / 2; // 50
    const w = width / 2;      // 30

    // Chassis
    ctx.beginPath();
    ctx.fillStyle = skin.body;
    ctx.moveTo(-halfL, -w + 3); // Rear Left
    ctx.lineTo(halfL - 5, -w + 3); // Front Left
    ctx.lineTo(halfL, -w + 10); // Nose Left Angle
    ctx.lineTo(halfL, w - 10);  // Nose Right Angle
    ctx.lineTo(halfL - 5, w - 3);  // Front Right
    ctx.lineTo(-halfL, w - 3);  // Rear Right
    ctx.lineTo(-halfL, -w + 3); // Close
    ctx.fill();

    // Side Molding
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(-halfL + 5, -w + 5);
    ctx.lineTo(halfL - 10, -w + 5);
    ctx.moveTo(-halfL + 5, w - 5);
    ctx.lineTo(halfL - 10, w - 5);
    ctx.stroke();

    // Cabin
    ctx.fillStyle = '#111';
    const grad = ctx.createLinearGradient(-30, -20, 20, 20);
    grad.addColorStop(0, '#222');
    grad.addColorStop(0.5, '#000');
    grad.addColorStop(1, '#111');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-28, -w + 8);
    ctx.lineTo(15, -w + 10);
    ctx.lineTo(25, -w + 14);
    ctx.lineTo(25, w - 14);
    ctx.lineTo(15, w - 10);
    ctx.lineTo(-28, w - 8);
    ctx.closePath();
    ctx.fill();

    // Headlights (Pop-up open)
    ctx.fillStyle = skin.body;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.fillRect(halfL - 25, -w + 8, 12, 12);
    ctx.strokeRect(halfL - 25, -w + 8, 12, 12);
    ctx.fillRect(halfL - 25, w - 20, 12, 12);
    ctx.strokeRect(halfL - 25, w - 20, 12, 12);

    ctx.fillStyle = '#ccffff';
    ctx.shadowColor = '#ccffff';
    ctx.shadowBlur = 15;
    ctx.fillRect(halfL - 14, -w + 8, 4, 12);
    ctx.fillRect(halfL - 14, w - 20, 4, 12);
    ctx.shadowBlur = 0;

    // Spoiler
    ctx.fillStyle = skin.detail;
    ctx.fillRect(-halfL, -w + 5, 6, width - 10);

    // Taillights
    ctx.fillStyle = '#cc0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 10;
    ctx.fillRect(-halfL, -w + 6, 2, width - 12);
    ctx.shadowBlur = 0;
}

// Supercar Logic
function drawSuperCar(skin, length, width) {
    const halfL = length / 2;
    const w = width / 2;

    // シャーシ - 非常に空気抵抗が少ない
    ctx.beginPath();
    ctx.fillStyle = skin.body;
    ctx.moveTo(-halfL, -w + 5);
    ctx.quadraticCurveTo(0, -w, halfL, -w + 15); // Smooth side to nose
    ctx.lineTo(halfL, w - 15);
    ctx.quadraticCurveTo(0, w, -halfL, w - 5);
    ctx.fill();

    // Cabin - Jet Fighter Bubble center
    ctx.fillStyle = '#111';
    const grad = ctx.createLinearGradient(-10, -10, 10, 10);
    grad.addColorStop(0, '#000');
    grad.addColorStop(0.5, '#444');
    grad.addColorStop(1, '#000');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Engine Bay (Rear)
    ctx.fillStyle = '#222';
    ctx.fillRect(-halfL + 10, -15, 20, 30);

    // Slats
    ctx.fillStyle = '#000';
    for (let i = 0; i < 3; i++) ctx.fillRect(-halfL + 12 + i * 6, -14, 2, 28);

    // Huge Wing
    ctx.fillStyle = skin.detail;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.roundRect(-halfL - 5, -w, 15, width, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Splitter (Front)
    ctx.fillStyle = '#111';
    ctx.fillRect(halfL - 2, -w + 15, 4, width - 30);

    // Lights
    ctx.fillStyle = '#00ffff'; // Cyber Blue
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(halfL - 10, -w + 10);
    ctx.lineTo(halfL, -w + 5);
    ctx.lineTo(halfL - 5, -w + 18);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(halfL - 10, w - 10);
    ctx.lineTo(halfL, w - 5);
    ctx.lineTo(halfL - 5, w - 18);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Afterburner Glow (Rear)
    if (Math.random() > 0.5) {
        ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(-halfL, 0, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Van Logic
function drawVan(skin, length, width) {
    const halfL = length / 2;
    const w = width / 2;

    // Boxy Chassis
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.roundRect(-halfL, -w, length, width, 2); // Slightly rounded corners
    ctx.fill();

    // Roof
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(-halfL + 5, -w + 5, length - 10, width - 10);

    // Windshield (Flat)
    ctx.fillStyle = '#333';
    ctx.fillRect(halfL - 20, -w + 5, 10, width - 10);

    // Rear Windows
    ctx.fillStyle = '#222';
    ctx.fillRect(-halfL + 5, -w + 5, 10, 15); // L
    ctx.fillRect(-halfL + 5, w - 20, 10, 15); // R

    // Roof Rack / Detail
    ctx.fillStyle = skin.detail;
    ctx.fillRect(-10, -w, 5, width);
    ctx.fillRect(10, -w, 5, width);

    // Headlights (Round)
    ctx.fillStyle = '#ffffcc';
    ctx.shadowColor = '#ffffcc';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(halfL, -w + 10, 5, 0, Math.PI * 2);
    ctx.arc(halfL, w - 10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // テールライト（垂直）
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(-halfL, -w + 5, 2, 10);
    ctx.fillRect(-halfL, w - 15, 2, 10);
}

