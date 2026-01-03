/**
 * src/logic/GameCore.ts
 * マインスイーパーのコアロジック（トポロジー、盤面、ソルバー）を統合
 */

// --- 型定義 ---
export type TopologyType = 'TORUS' | 'SQUARE';
export type CellStatus = 'HIDDEN' | 'OPENED' | 'FLAGGED';

// ★ここがエラーの原因だった箇所です。必ず export をつけてください★
export interface GameConfig {
    width: number;
    height: number;
    mines: number;
    topologyType: TopologyType;
}

// =========================================================
// 1. Topology: 空間のつながりを管理
// =========================================================
export class Topology {
    width: number;
    height: number;
    type: TopologyType;
    adjacencyList: number[][];

    constructor(w: number, h: number, type: TopologyType) {
        this.width = w;
        this.height = h;
        this.type = type;
        this.adjacencyList = [];
        this.buildGraph();
    }

    toIndex(x: number, y: number): number {
        return y * this.width + x;
    }

    toCoord(index: number): { x: number, y: number } {
        return { x: index % this.width, y: Math.floor(index / this.width) };
    }

    private buildGraph() {
        const total = this.width * this.height;
        for (let i = 0; i < total; i++) {
            const { x, y } = this.toCoord(i);
            const neighbors: number[] = [];
            
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    let nx = x + dx;
                    let ny = y + dy;
                    let valid = true;

                    if (this.type === 'TORUS') {
                        // トーラス: ループさせる
                        nx = (nx + this.width) % this.width;
                        ny = (ny + this.height) % this.height;
                    } else {
                        // スクエア: 範囲外なら無効
                        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
                            valid = false;
                        }
                    }

                    if (valid) {
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

// =========================================================
// 2. Board: 盤面の状態管理
// =========================================================
export class Board {
    topology: Topology;
    mines: boolean[];
    status: CellStatus[];
    neighborMineCounts: number[];

    constructor(topology: Topology) {
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
        // minesはコピーしない（ソルバーはminesを知らない前提のため）
        return newBoard;
    }

    // 地雷配置と数字計算
    placeMines(mineCount: number, startIndex: number) {
        const size = this.topology.width * this.topology.height;
        // 初手とその周囲は安全地帯
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

    // 開封処理（戻り値: 爆発したかどうか）
    open(index: number): boolean {
        if (this.status[index] !== 'HIDDEN') return false;
        
        if (this.mines[index]) {
            this.status[index] = 'OPENED'; // 爆発表示用
            return true; // GAME OVER
        }

        this.status[index] = 'OPENED';
        if (this.neighborMineCounts[index] === 0) {
            for (const n of this.topology.getNeighbors(index)) {
                this.open(n);
            }
        }
        return false;
    }

    toggleFlag(index: number) {
        if (this.status[index] === 'HIDDEN') {
            this.status[index] = 'FLAGGED';
        } else if (this.status[index] === 'FLAGGED') {
            this.status[index] = 'HIDDEN';
        }
    }
}

// =========================================================
// 3. Solver: 運ゲー判定・厳密モード判定用
// =========================================================
export class Solver {
    board: Board;
    topology: Topology;
    knownMines: Set<number>;
    knownSafe: Set<number>;
    isValidState: boolean;
    totalMines: number;

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

    // --- ロジックLv1: 基本推論 ---
    solveBasicStep(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;

        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'OPENED' && this.board.neighborMineCounts[i] > 0) {
                const neighbors = this.topology.getNeighbors(i);
                
                // 「未知」かつ「未確定」なマス
                const hiddenNeighbors = neighbors.filter(n => 
                    this.board.status[n] === 'HIDDEN' && 
                    !this.knownSafe.has(n) && 
                    !this.knownMines.has(n)
                );
                
                const knownMinesCount = neighbors.filter(n => this.knownMines.has(n)).length;
                
                // 矛盾チェック
                if (knownMinesCount > this.board.neighborMineCounts[i]) {
                    this.isValidState = false; return false;
                }
                const remainingMines = this.board.neighborMineCounts[i] - knownMinesCount;
                if (remainingMines > hiddenNeighbors.length || remainingMines < 0) {
                    this.isValidState = false; return false;
                }

                // 確定処理
                if (remainingMines === hiddenNeighbors.length && remainingMines > 0) {
                    for (const n of hiddenNeighbors) {
                        if (!this.knownMines.has(n)) { this.knownMines.add(n); changed = true; }
                    }
                }
                if (remainingMines === 0 && hiddenNeighbors.length > 0) {
                    for (const n of hiddenNeighbors) {
                        if (!this.knownSafe.has(n) && !this.knownMines.has(n)) { this.knownSafe.add(n); changed = true; }
                    }
                }
            }
        }
        return changed;
    }

    // --- ロジックLv2: 全体カウント (Global Count) ---
    solveGlobalLogic(): boolean {
        const size = this.topology.width * this.topology.height;
        let unknownCells: number[] = [];
        
        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'HIDDEN' && !this.knownSafe.has(i) && !this.knownMines.has(i)) {
                unknownCells.push(i);
            }
        }
        if (unknownCells.length === 0) return false;

        const currentFoundMines = this.knownMines.size;
        const minesLeft = this.totalMines - currentFoundMines;

        if (minesLeft < 0 || minesLeft > unknownCells.length) {
            this.isValidState = false; return false;
        }

        if (minesLeft === unknownCells.length) {
            for (const idx of unknownCells) this.knownMines.add(idx);
            return true;
        }
        if (minesLeft === 0) {
            for (const idx of unknownCells) this.knownSafe.add(idx);
            return true;
        }
        return false;
    }

    // --- ロジックLv3: 背理法 (Deep Logic) ---
    solveDeepLogic(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;
        
        // フロンティア（数字マスの隣にある未確定マス）のみを対象にする
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
            // 仮定1: 地雷だとしたら？
            const simMine = Solver.fromSnapshot(this);
            simMine.knownMines.add(targetIdx);
            let subChanged = true;
            while(subChanged && simMine.isValidState) {
                subChanged = simMine.solveBasicStep();
                if(subChanged) subChanged = simMine.solveGlobalLogic();
            }
            if (!simMine.isValidState) {
                if (!this.knownSafe.has(targetIdx)) { this.knownSafe.add(targetIdx); changed = true; continue; }
            }

            // 仮定2: 安全だとしたら？
            const simSafe = Solver.fromSnapshot(this);
            simSafe.knownSafe.add(targetIdx);
            subChanged = true;
            while(subChanged && simSafe.isValidState) {
                subChanged = simSafe.solveBasicStep();
                if(subChanged) subChanged = simSafe.solveGlobalLogic();
            }
            if (!simSafe.isValidState) {
                if (!this.knownMines.has(targetIdx)) { this.knownMines.add(targetIdx); changed = true; }
            }
        }
        return changed;
    }

    // 運ゲーなしで解けるかチェック
    checkSolvability(startIndex: number): boolean {
        this.board.open(startIndex);
        let stuck = false;
        while (!stuck) {
            let changed = this.solveBasicStep();
            if (!changed) changed = this.solveGlobalLogic();
            if (!changed) changed = this.solveDeepLogic(); // 重いので最後

            // 安全確定を開く
            let openChanged = false;
            const safeList = Array.from(this.knownSafe);
            for (const safeIdx of safeList) {
                if (this.board.status[safeIdx] === 'HIDDEN') {
                    this.board.open(safeIdx);
                    openChanged = true;
                }
            }
            if (!changed && !openChanged) stuck = true;
        }

        // 全ての非地雷マスが開かれたか
        const size = this.topology.width * this.topology.height;
        for (let i = 0; i < size; i++) {
            if (!this.board.mines[i] && this.board.status[i] !== 'OPENED') return false;
        }
        return true;
    }
}

// --- ユーティリティ: 盤面生成 ---
export function generateBoard(config: GameConfig, startIndex: number): Board | null {
    const topology = new Topology(config.width, config.height, config.topologyType);
    const board = new Board(topology);
    board.placeMines(config.mines, startIndex);

    const solver = new Solver(board, config.mines);
    if (solver.checkSolvability(startIndex)) {
        // 解ける盤面なら、Boardの状態をHIDDENに戻して返す
        // (Solverでシミュレーション開封されているため)
        for(let i=0; i<board.status.length; i++) {
            board.status[i] = 'HIDDEN';
        }
        // スタート位置だけは開けておく
        board.open(startIndex);
        return board;
    }
    return null;
}