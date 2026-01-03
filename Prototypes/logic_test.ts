/**
 * logic_test_v3.ts (修正版)
 * 目的: 集合推論（Set Analysis）を実装し、24x48 / 256個の高難易度設定で
 * 高速に「運ゲーなし盤面」が生成できるか検証する。
 */

// TypeScriptにprocess（Node.js固有機能）の存在を教える魔法の1行
declare var process: any;

const CONFIG = {
    WIDTH: 48,
    HEIGHT: 24,
    MINES: 220,    // 地雷数をUnambi仕様に合わせ増加
    MAX_RETRY: 1000 // 試行回数上限
};

// --- トポロジー定義 ---
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

// --- 盤面クラス ---
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
        let safety = 0;
        
        while (placed < mineCount && safety < size * 20) {
            safety++;
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

// --- ソルバー (強化版: 集合推論付き) ---
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

    // 基本的な推論
    solveBasicStep(): boolean {
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

    // 集合推論 (Set Analysis)
    solveSetLogic(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;
        
        // 境界にある数字マスのリストを作成
        const frontierCells: number[] = [];
        for(let i=0; i<size; i++) {
            if (this.board.status[i] === 'OPENED' && this.board.neighborMineCounts[i] > 0) {
                const neighbors = this.topology.getNeighbors(i);
                const hasHidden = neighbors.some(n => this.board.status[n] === 'HIDDEN' && !this.knownSafe.has(n) && !this.knownMines.has(n));
                if (hasHidden) frontierCells.push(i);
            }
        }

        // ペアごとの比較
        for (let i = 0; i < frontierCells.length; i++) {
            for (let j = i + 1; j < frontierCells.length; j++) {
                const idxA = frontierCells[i];
                const idxB = frontierCells[j];

                const getUnknownNeighbors = (centerIdx: number) => {
                    const all = this.topology.getNeighbors(centerIdx);
                    const unknown = all.filter(n => this.board.status[n] === 'HIDDEN' && !this.knownSafe.has(n) && !this.knownMines.has(n));
                    const knownMinesCount = all.filter(n => this.knownMines.has(n)).length;
                    const remainingMines = this.board.neighborMineCounts[centerIdx] - knownMinesCount;
                    return { unknown, remainingMines };
                };

                const infoA = getUnknownNeighbors(idxA);
                const infoB = getUnknownNeighbors(idxB);

                if (infoA.unknown.length === 0 || infoB.unknown.length === 0) continue;
                
                // 簡易距離チェック
                const shareNeighbors = infoA.unknown.some(u => infoB.unknown.includes(u));
                if (!shareNeighbors && !infoB.unknown.some(u => infoA.unknown.includes(u))) continue;

                // A ⊆ B チェック
                const isASubsetOfB = infoA.unknown.every(val => infoB.unknown.includes(val));
                
                if (isASubsetOfB) {
                    const diffMines = infoB.remainingMines - infoA.remainingMines;
                    const diffCells = infoB.unknown.filter(x => !infoA.unknown.includes(x));

                    if (diffMines === diffCells.length && diffCells.length > 0) {
                        for (const d of diffCells) {
                            if (!this.knownMines.has(d)) {
                                this.knownMines.add(d);
                                changed = true;
                            }
                        }
                    }
                    if (diffMines === 0 && diffCells.length > 0) {
                        for (const d of diffCells) {
                            if (!this.knownSafe.has(d)) {
                                this.knownSafe.add(d);
                                changed = true;
                            }
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
            let changed = this.solveBasicStep();
            if (!changed) {
                changed = this.solveSetLogic();
            }

            let openChanged = false;
            const safeList = Array.from(this.knownSafe);
            for (const safeIdx of safeList) {
                if (this.board.status[safeIdx] === 'HIDDEN') {
                    this.board.open(safeIdx);
                    openChanged = true;
                }
            }

            if (!changed && !openChanged) {
                stuck = true;
            }
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
        console.log(`=== トポロジカル・マインスイーパー 強化版テスト ===`);
        console.log(`設定: ${CONFIG.WIDTH}x${CONFIG.HEIGHT}, 地雷: ${CONFIG.MINES}`);
        
        const topology = new Topology(CONFIG.WIDTH, CONFIG.HEIGHT);
        const startTime = Date.now();
        let attempts = 0;
        let success = false;

        console.log("生成ループを開始します...");

        while (!success && attempts < CONFIG.MAX_RETRY) {
            attempts++;
            // 以前のまま process を使用 (一行で更新)
            if (attempts % 10 === 0) {
                process.stdout.write(`\r試行中... ${attempts}回目`);
            }

            const board = new Board(topology);
            const startNode = Math.floor(Math.random() * (CONFIG.WIDTH * CONFIG.HEIGHT));
            board.placeMines(CONFIG.MINES, startNode);

            const solver = new Solver(board);
            if (solver.checkSolvability(startNode)) {
                success = true;
            }
        }
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        console.log(`\n-------------------------------------------------------`);
        if (success) {
            console.log(`[成功] 生成完了`);
            console.log(`試行回数: ${attempts}回`);
            console.log(`総経過時間: ${totalTime}ms`);
            console.log(`平均時間: ${(totalTime / attempts).toFixed(2)}ms`);
        } else {
            console.log(`[失敗] ${CONFIG.MAX_RETRY}回試行しましたが生成できませんでした。`);
            console.log(`(さらに高度な「背理法ソルバー」が必要な可能性があります)`);
        }

    } catch (e) {
        console.error(e);
    }
}

runTest();