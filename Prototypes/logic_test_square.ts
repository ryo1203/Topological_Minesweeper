/**
 * logic_test_square.ts
 * 目的:
 * 1. 通常の正方形盤面（端がある）での生成テスト
 * 2. 「残り地雷数」を用いた全体推論（Global Count）の実装確認
 */

declare var process: any;

const CONFIG = {
    WIDTH: 48,
    HEIGHT: 24,
    MINES: 256,
    MAX_RETRY: 500
};

// --- トポロジー定義（通常版：ループなし） ---
class StandardTopology {
    width: number;
    height: number;
    adjacencyList: number[][];

    constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this.adjacencyList = [];
        this.buildSquareGraph();
    }

    toIndex(x: number, y: number): number {
        return y * this.width + x;
    }

    toCoord(index: number): { x: number, y: number } {
        return { x: index % this.width, y: Math.floor(index / this.width) };
    }

    private buildSquareGraph() {
        const total = this.width * this.height;
        for (let i = 0; i < total; i++) {
            const { x, y } = this.toCoord(i);
            const neighbors: number[] = [];
            
            // 通常の隣接チェック（範囲外に出ないか確認）
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    const nx = x + dx;
                    const ny = y + dy;

                    // 盤面の外に出ていないかチェック（ここがトーラスとの違い）
                    if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                        neighbors.push(this.toIndex(nx, ny));
                    }
                }
            }
            this.adjacencyList[i] = neighbors;
        }
    }

    getNeighbors(index: number): number[] {
        return this.adjacencyList[index];
    }
}

// --- 盤面クラス (Board) ---
class Board {
    topology: StandardTopology;
    mines: boolean[];
    status: ('HIDDEN' | 'OPENED' | 'FLAGGED')[];
    neighborMineCounts: number[];

    constructor(topology: StandardTopology) {
        this.topology = topology;
        const size = topology.width * topology.height;
        this.mines = new Array(size).fill(false);
        this.status = new Array(size).fill('HIDDEN');
        this.neighborMineCounts = new Array(size).fill(0);
    }

    clone(): Board {
        const newBoard = new Board(this.topology);
        newBoard.status = [...this.status];
        newBoard.neighborMineCounts = [...this.neighborMineCounts];
        return newBoard;
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

// --- ソルバー ---
class Solver {
    board: Board;
    topology: StandardTopology;
    knownMines: Set<number>;
    knownSafe: Set<number>;
    isValidState: boolean;
    totalMines: number; // 全体の地雷数設定

    constructor(board: Board, totalMines: number) {
        this.board = board;
        this.topology = board.topology;
        this.knownMines = new Set();
        this.knownSafe = new Set();
        this.isValidState = true;
        this.totalMines = totalMines;
    }

    static fromSnapshot(original: Solver): Solver {
        const newSolver = new Solver(original.board.clone(), original.totalMines);
        newSolver.knownMines = new Set(original.knownMines);
        newSolver.knownSafe = new Set(original.knownSafe);
        return newSolver;
    }

    // 1. 基本推論
    solveBasicStep(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;

        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'OPENED' && this.board.neighborMineCounts[i] > 0) {
                const neighbors = this.topology.getNeighbors(i);
                
                const hiddenNeighbors = neighbors.filter(n => 
                    this.board.status[n] === 'HIDDEN' && 
                    !this.knownSafe.has(n) && 
                    !this.knownMines.has(n)
                );
                
                const knownMinesCount = neighbors.filter(n => this.knownMines.has(n)).length;
                if (knownMinesCount > this.board.neighborMineCounts[i]) {
                    this.isValidState = false; 
                    return false;
                }

                const remainingMines = this.board.neighborMineCounts[i] - knownMinesCount;

                if (remainingMines > hiddenNeighbors.length) {
                    this.isValidState = false; 
                    return false;
                }
                if (remainingMines < 0) {
                    this.isValidState = false;
                    return false;
                }

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

    // 2. 全体地雷数からの推論 (Global Count Logic)
    // 【重要】これが通常の正方形盤面では必須になります
    solveGlobalLogic(): boolean {
        const size = this.topology.width * this.topology.height;
        let unknownCells: number[] = [];
        
        // 未確定マスを全列挙
        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'HIDDEN' && !this.knownSafe.has(i) && !this.knownMines.has(i)) {
                unknownCells.push(i);
            }
        }

        if (unknownCells.length === 0) return false;

        const currentFoundMines = this.knownMines.size;
        const minesLeft = this.totalMines - currentFoundMines;

        // 矛盾チェック
        if (minesLeft < 0 || minesLeft > unknownCells.length) {
            this.isValidState = false;
            return false;
        }

        // ルールA: 残り地雷数 == 未確定マス数 -> 全て地雷
        if (minesLeft === unknownCells.length) {
            for (const idx of unknownCells) {
                this.knownMines.add(idx);
            }
            return true;
        }

        // ルールB: 残り地雷数 == 0 -> 全て安全
        if (minesLeft === 0) {
            for (const idx of unknownCells) {
                this.knownSafe.add(idx);
            }
            return true;
        }

        return false;
    }

    // 3. 背理法
    solveDeepLogic(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;
        const frontierCells = new Set<number>();

        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'OPENED' && this.board.neighborMineCounts[i] > 0) {
                const neighbors = this.topology.getNeighbors(i);
                for (const n of neighbors) {
                    if (this.board.status[n] === 'HIDDEN' && !this.knownSafe.has(n) && !this.knownMines.has(n)) {
                        frontierCells.add(n);
                    }
                }
            }
        }

        for (const targetIdx of frontierCells) {
            // Case 1: Assume Mine
            const simMine = Solver.fromSnapshot(this);
            simMine.knownMines.add(targetIdx);
            
            let subChanged = true;
            while(subChanged && simMine.isValidState) {
                subChanged = simMine.solveBasicStep();
                // 背理法の中でもグローバルカウントは有効
                if(subChanged) subChanged = simMine.solveGlobalLogic(); 
            }

            if (!simMine.isValidState) {
                if (!this.knownSafe.has(targetIdx)) {
                    this.knownSafe.add(targetIdx);
                    changed = true;
                    continue; 
                }
            }

            // Case 2: Assume Safe
            const simSafe = Solver.fromSnapshot(this);
            simSafe.knownSafe.add(targetIdx);

            subChanged = true;
            while(subChanged && simSafe.isValidState) {
                subChanged = simSafe.solveBasicStep();
                if(subChanged) subChanged = simSafe.solveGlobalLogic();
            }

            if (!simSafe.isValidState) {
                if (!this.knownMines.has(targetIdx)) {
                    this.knownMines.add(targetIdx);
                    changed = true;
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
            
            // 基本推論で止まったら全体カウント
            if (!changed) changed = this.solveGlobalLogic();

            // それでも止まったら背理法
            if (!changed) changed = this.solveDeepLogic();

            // 確定マスを開く
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
        console.log(`=== 通常正方形・全体カウント付きテスト ===`);
        console.log(`設定: ${CONFIG.WIDTH}x${CONFIG.HEIGHT}, 地雷: ${CONFIG.MINES}`);
        
        const topology = new StandardTopology(CONFIG.WIDTH, CONFIG.HEIGHT);
        const startTime = Date.now();
        let attempts = 0;
        let success = false;

        console.log("生成ループを開始します...");

        while (!success && attempts < CONFIG.MAX_RETRY) {
            attempts++;
            if (attempts % 1 === 0) process.stdout.write(`\r試行中... ${attempts}回目`);

            const board = new Board(topology);
            const startNode = Math.floor(Math.random() * (CONFIG.WIDTH * CONFIG.HEIGHT));
            board.placeMines(CONFIG.MINES, startNode);

            const solver = new Solver(board, CONFIG.MINES);
            if (solver.checkSolvability(startNode)) {
                success = true;
            }
        }
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        console.log(`\n-------------------------------------------------------`);
        if (success) {
            console.log(`[成功] 通常正方形盤面の生成完了`);
            console.log(`試行回数: ${attempts}回`);
            console.log(`総経過時間: ${totalTime}ms`);
            console.log(`平均時間: ${(totalTime / attempts).toFixed(2)}ms`);
        } else {
            console.log(`[失敗] 生成できませんでした。角や端の詰まりが原因の可能性があります。`);
        }

    } catch (e) {
        console.error(e);
    }
}

runTest();