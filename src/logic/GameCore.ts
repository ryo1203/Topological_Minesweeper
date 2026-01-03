/**
 * src/logic/GameCore.ts
 * コアロジック: トポロジー、盤面管理、ソルバー、勝利判定
 */

export type TopologyType = 'TORUS' | 'SQUARE';
export type CellStatus = 'HIDDEN' | 'OPENED' | 'FLAGGED';

export interface GameConfig {
    width: number;
    height: number;
    mines: number;
    topologyType: TopologyType;
}

export const DIFFICULTY_PRESETS = [
    { label: '初級 (Beginner)', width: 9, height: 9, mines: 10 },
    { label: '中級 (Intermediate)', width: 16, height: 16, mines: 40 },
    { label: '上級 (Expert)', width: 30, height: 16, mines: 99 },
    { label: '超上級 (Maniac)', width: 48, height: 24, mines: 256 },
];

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
                        nx = (nx + this.width) % this.width;
                        ny = (ny + this.height) % this.height;
                    } else {
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
        newBoard.mines = [...this.mines];
        return newBoard;
    }

    placeMines(mineCount: number, startIndex: number) {
        const size = this.topology.width * this.topology.height;
        const safeZone = new Set([startIndex, ...this.topology.getNeighbors(startIndex)]);
        
        let placed = 0;
        let safety = 0;
        this.mines.fill(false);
        
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

    open(index: number): boolean {
        if (this.status[index] !== 'HIDDEN') return false;
        
        if (this.mines[index]) {
            this.status[index] = 'OPENED'; 
            return true; // 爆発
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

    // フラグの数を数える
    countFlags(): number {
        return this.status.filter(s => s === 'FLAGGED').length;
    }

    // 勝利判定: 地雷以外の全てのマスが開いているか
    checkWin(): boolean {
        const size = this.topology.width * this.topology.height;
        for (let i = 0; i < size; i++) {
            // 地雷じゃないのに、開いていないマスがあればまだ勝利ではない
            if (!this.mines[i] && this.status[i] !== 'OPENED') {
                return false;
            }
        }
        return true;
    }
}

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
                if (knownMinesCount > this.board.neighborMineCounts[i]) { this.isValidState = false; return false; }
                
                const remainingMines = this.board.neighborMineCounts[i] - knownMinesCount;
                if (remainingMines > hiddenNeighbors.length || remainingMines < 0) { this.isValidState = false; return false; }

                if (remainingMines === hiddenNeighbors.length && remainingMines > 0) {
                    for (const n of hiddenNeighbors) { if (!this.knownMines.has(n)) { this.knownMines.add(n); changed = true; } }
                }
                if (remainingMines === 0 && hiddenNeighbors.length > 0) {
                    for (const n of hiddenNeighbors) { if (!this.knownSafe.has(n) && !this.knownMines.has(n)) { this.knownSafe.add(n); changed = true; } }
                }
            }
        }
        return changed;
    }

    solveGlobalLogic(): boolean {
        const size = this.topology.width * this.topology.height;
        let unknownCells: number[] = [];
        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'HIDDEN' && !this.knownSafe.has(i) && !this.knownMines.has(i)) unknownCells.push(i);
        }
        if (unknownCells.length === 0) return false;

        const currentFoundMines = this.knownMines.size;
        const minesLeft = this.totalMines - currentFoundMines;

        if (minesLeft < 0 || minesLeft > unknownCells.length) { this.isValidState = false; return false; }

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

    solveDeepLogic(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;
        const frontierCells = new Set<number>();
        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'OPENED' && this.board.neighborMineCounts[i] > 0) {
                const neighbors = this.topology.getNeighbors(i);
                for (const n of neighbors) {
                    if (this.board.status[n] === 'HIDDEN' && !this.knownSafe.has(n) && !this.knownMines.has(n)) frontierCells.add(n);
                }
            }
        }

        for (const targetIdx of frontierCells) {
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

    checkSolvability(startIndex: number): boolean {
        this.board.open(startIndex);
        let stuck = false;
        while (!stuck) {
            let changed = this.solveBasicStep();
            if (!changed) changed = this.solveGlobalLogic();
            if (!changed) changed = this.solveDeepLogic();

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

        const size = this.topology.width * this.topology.height;
        for (let i = 0; i < size; i++) {
            if (!this.board.mines[i] && this.board.status[i] !== 'OPENED') return false;
        }
        return true;
    }
}

export async function generateBoardAsync(
    config: GameConfig, 
    startIndex: number, 
    onProgress: (count: number) => void
): Promise<Board | null> {
    
    const topology = new Topology(config.width, config.height, config.topologyType);
    const MAX_RETRY = 2000;
    const TIME_SLICE = 15;

    let attempts = 0;
    let lastYield = Date.now();

    while (attempts < MAX_RETRY) {
        attempts++;
        
        if (Date.now() - lastYield > TIME_SLICE) {
            onProgress(attempts);
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYield = Date.now();
        }

        const board = new Board(topology);
        board.placeMines(config.mines, startIndex);

        const solver = new Solver(board, config.mines);
        
        if (solver.checkSolvability(startIndex)) {
            for(let i=0; i<board.status.length; i++) {
                board.status[i] = 'HIDDEN';
            }
            board.open(startIndex);
            return board;
        }
    }
    return null;
}