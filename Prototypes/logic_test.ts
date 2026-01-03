/**
 * logic_test_v2.ts
 * 修正版: 進捗表示機能付き、Date.now()使用
 */

// 設定値
const CONFIG = {
    WIDTH: 48,      // 幅
    HEIGHT: 24,     // 高さ
    MINES: 256,     // 地雷数
    MAX_RETRY: 10000  // 最大試行回数
};

// --- ここからクラス定義 ---

class Topology {
    width: number;
    height: number;
    adjacencyList: number[][];

    constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.adjacencyList = [];
        this.buildTorusGraph();
    }

    toIndex(x: number, y: number): number {
        return y * this.width + x;
    }

    toCoord(index: number): { x: number, y: number } {
        return { x: index % this.width, y: Math.floor(index / this.width) };
    }

    private buildTorusGraph() {
        const total = this.width * this.height;
        for (let i = 0; i < total; i++) {
            const { x, y } = this.toCoord(i);
            const neighbors: number[] = [];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    // トーラス処理: 座標をループさせる
                    const nx = (x + dx + this.width) % this.width;
                    const ny = (y + dy + this.height) % this.height;
                    neighbors.push(this.toIndex(nx, ny));
                }
            }
            this.adjacencyList[i] = neighbors;
        }
    }

    getNeighbors(index: number): number[] {
        return this.adjacencyList[index];
    }
}

class Board {
    topology: Topology;
    mines: boolean[];
    status: ('HIDDEN' | 'OPENED' | 'FLAGGED')[];
    neighborMineCounts: number[];

    constructor(topology: Topology) {
        this.topology = topology;
        const size = topology.width * topology.height;
        this.mines = new Array(size).fill(false);
        this.status = new Array(size).fill('HIDDEN');
        this.neighborMineCounts = new Array(size).fill(0);
    }

    placeMines(mineCount: number, startIndex: number) {
        const size = this.topology.width * this.topology.height;
        const safeZone = new Set([startIndex, ...this.topology.getNeighbors(startIndex)]);
        let placed = 0;
        
        // 無限ループ防止用のカウンター
        let safetyCounter = 0;
        while (placed < mineCount && safetyCounter < size * 10) {
            safetyCounter++;
            const idx = Math.floor(Math.random() * size);
            if (!this.mines[idx] && !safeZone.has(idx)) {
                this.mines[idx] = true;
                placed++;
            }
        }
        this.calcNumbers();
    }

    private calcNumbers() {
        const size = this.mines.length;
        for (let i = 0; i < size; i++) {
            if (this.mines[i]) {
                this.neighborMineCounts[i] = -1;
            } else {
                let count = 0;
                for (const neighbor of this.topology.getNeighbors(i)) {
                    if (this.mines[neighbor]) count++;
                }
                this.neighborMineCounts[i] = count;
            }
        }
    }

    open(index: number) {
        if (this.status[index] !== 'HIDDEN') return;
        this.status[index] = 'OPENED';
        if (this.neighborMineCounts[index] === 0) {
            for (const n of this.topology.getNeighbors(index)) {
                this.open(n);
            }
        }
    }
}

class Solver {
    board: Board;
    topology: Topology;
    knownMines: Set<number>;
    knownSafe: Set<number>;

    constructor(board: Board) {
        this.board = board;
        this.topology = board.topology;
        this.knownMines = new Set();
        this.knownSafe = new Set();
    }

    solveStep(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;

        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'OPENED' && this.board.neighborMineCounts[i] > 0) {
                const neighbors = this.topology.getNeighbors(i);
                const hiddenNeighbors = neighbors.filter(n => this.board.status[n] === 'HIDDEN' && !this.knownSafe.has(n));
                const flaggedNeighbors = neighbors.filter(n => this.knownMines.has(n));
                const remainingMines = this.board.neighborMineCounts[i] - flaggedNeighbors.length;

                if (remainingMines === hiddenNeighbors.length && remainingMines > 0) {
                    for (const n of hiddenNeighbors) {
                        if (!this.knownMines.has(n)) {
                            this.knownMines.add(n);
                            changed = true;
                        }
                    }
                }

                if (remainingMines === 0 && hiddenNeighbors.length > 0) {
                    for (const n of hiddenNeighbors) {
                        if (!this.knownSafe.has(n) && !this.knownMines.has(n)) {
                            this.knownSafe.add(n);
                            changed = true;
                        }
                    }
                }
            }
        }
        return changed;
    }

    checkSolvability(startIndex: number): boolean {
        this.board.open(startIndex);
        let stuck = false;
        while (!stuck) {
            const logicChanged = this.solveStep();
            let openChanged = false;
            const safeList = Array.from(this.knownSafe);
            for (const safeIdx of safeList) {
                if (this.board.status[safeIdx] === 'HIDDEN') {
                    this.board.open(safeIdx);
                    openChanged = true;
                }
            }
            if (!logicChanged && !openChanged) stuck = true;
        }

        const size = this.topology.width * this.topology.height;
        for (let i = 0; i < size; i++) {
            if (!this.board.mines[i] && this.board.status[i] !== 'OPENED') {
                return false;
            }
        }
        return true;
    }
}

// --- メイン実行部 ---

async function runTest() {
    try {
        console.log("プログラムを開始します..."); // 【確認用ログ1】
        
        console.log(`=== トポロジカル・マインスイーパー 診断モード ===`);
        console.log(`設定: ${CONFIG.WIDTH}x${CONFIG.HEIGHT}, 地雷: ${CONFIG.MINES}`);

        const topology = new Topology(CONFIG.WIDTH, CONFIG.HEIGHT);
        
        // Date.now() を使用
        const startTime = Date.now();
        let attempts = 0;
        let success = false;

        console.log("生成ループを開始します..."); // 【確認用ログ2】

        while (!success && attempts < CONFIG.MAX_RETRY) {
            attempts++;
            
            // 進捗を表示 (これが出れば動いています)
            if (attempts % 1 === 0) {
                process.stdout.write(`\r試行中... ${attempts}回目`);
            }

            const board = new Board(topology);
            const startNode = Math.floor(Math.random() * (CONFIG.WIDTH * CONFIG.HEIGHT));
            
            board.placeMines(CONFIG.MINES, startNode);

            const solver = new Solver(board);
            const isSolvable = solver.checkSolvability(startNode);

            if (isSolvable) {
                success = true;
                console.log("\n-> 成功！解ける盤面が見つかりました。");
            }
        }
        
        console.log("\n-------------------------------------------------------");
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        if (success) {
            console.log(`結果: [成功]`);
            console.log(`試行回数: ${attempts}回`);
            console.log(`総経過時間: ${totalTime}ms`);
            console.log(`平均時間: ${(totalTime / attempts).toFixed(2)}ms`);
        } else {
            console.log(`結果: [失敗]`);
            console.log(`指定回数(${CONFIG.MAX_RETRY}回)以内に生成できませんでした。`);
        }

    } catch (e) {
        console.error("\n[エラーが発生しました]");
        console.error(e);
    }
}

runTest();