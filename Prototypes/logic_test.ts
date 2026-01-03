/**
 * logic_test_v4.ts
 * 目的: 「背理法（仮定と矛盾）」を実装し、24x48 / 256個の壁を突破する。
 */

// TypeScriptにprocessの存在を教える
declare var process: any;

const CONFIG = {
    WIDTH: 48,
    HEIGHT: 24,
    MINES: 256,    // 高難易度
    MAX_RETRY: 100 // 背理法は強力なので試行回数は少なくて済むはず
};

// --- トポロジー定義 (変更なし) ---
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

// --- 盤面クラス (複製機能を追加) ---
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

    // シミュレーション用に盤面を複製するメソッド
    clone(): Board {
        const newBoard = new Board(this.topology);
        // minesは正解データなのでコピー不要（推論には使わないため）
        // statusとneighborMineCountsの状態だけコピー
        newBoard.status = [...this.status];
        newBoard.neighborMineCounts = [...this.neighborMineCounts];
        // knownMines/SafeはSolverが持つのでBoardはこれだけで良い
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

// --- ソルバー (背理法搭載版) ---
class Solver {
    board: Board;
    topology: Topology;
    knownMines: Set<number>;
    knownSafe: Set<number>;
    isValidState: boolean; // 矛盾が発生していないか

    constructor(board: Board) {
        this.board = board;
        this.topology = board.topology;
        this.knownMines = new Set();
        this.knownSafe = new Set();
        this.isValidState = true;
    }

    // クローン用コンストラクタ
    static fromSnapshot(original: Solver): Solver {
        const newSolver = new Solver(original.board.clone()); // Boardも複製
        newSolver.knownMines = new Set(original.knownMines);
        newSolver.knownSafe = new Set(original.knownSafe);
        return newSolver;
    }

    // 基本的な推論 (エラーならfalseを返す)
    solveBasicStep(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;

        for (let i = 0; i < size; i++) {
            if (this.board.status[i] === 'OPENED' && this.board.neighborMineCounts[i] > 0) {
                const neighbors = this.topology.getNeighbors(i);
                
                // 既知の安全/地雷を考慮
                const hiddenNeighbors = neighbors.filter(n => 
                    this.board.status[n] === 'HIDDEN' && 
                    !this.knownSafe.has(n) && 
                    !this.knownMines.has(n)
                );
                
                // ここで矛盾チェック: 既知の地雷数が、数字を超えていたら矛盾
                const knownMinesCount = neighbors.filter(n => this.knownMines.has(n)).length;
                if (knownMinesCount > this.board.neighborMineCounts[i]) {
                    this.isValidState = false;
                    return false;
                }

                const remainingMines = this.board.neighborMineCounts[i] - knownMinesCount;

                // 矛盾チェック: 残りの空きマスより、必要な地雷数が多ければ矛盾
                if (remainingMines > hiddenNeighbors.length) {
                    this.isValidState = false;
                    return false;
                }
                // 矛盾チェック: 必要地雷数が負なら矛盾
                if (remainingMines < 0) {
                    this.isValidState = false;
                    return false;
                }

                // 確定処理
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

    // 背理法 (Contradiction Logic)
    // 「仮にここに地雷を置いてみて、矛盾したら安全」「仮に安全としてみて、矛盾したら地雷」
    solveDeepLogic(): boolean {
        let changed = false;
        const size = this.topology.width * this.topology.height;

        // 調査対象: 「数字マスの隣にある未確定マス」のみ（フロンティア）
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

        // 各フロンティアセルに対して仮定を行う
        for (const targetIdx of frontierCells) {
            // --- ケース1: 仮に「地雷」と仮定してみる ---
            const simMine = Solver.fromSnapshot(this);
            simMine.knownMines.add(targetIdx);
            
            // 少しだけ基本推論を回してみる（矛盾が出るまで、あるいは進展がなくなるまで）
            let subChanged = true;
            while(subChanged && simMine.isValidState) {
                subChanged = simMine.solveBasicStep();
            }

            // もし矛盾が発生していたら -> 「地雷」という仮定が間違い -> 「安全」確定
            if (!simMine.isValidState) {
                if (!this.knownSafe.has(targetIdx)) {
                    this.knownSafe.add(targetIdx);
                    changed = true;
                    continue; // 確定したら次のセルへ
                }
            }

            // --- ケース2: 仮に「安全」と仮定してみる ---
            const simSafe = Solver.fromSnapshot(this);
            simSafe.knownSafe.add(targetIdx);

            subChanged = true;
            while(subChanged && simSafe.isValidState) {
                subChanged = simSafe.solveBasicStep();
            }

            // もし矛盾が発生していたら -> 「安全」という仮定が間違い -> 「地雷」確定
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
            // 1. 基本推論
            let changed = this.solveBasicStep();
            
            // 2. 基本で進まなければ背理法（重いので必要な時だけ）
            if (!changed) {
                changed = this.solveDeepLogic();
            }

            // 確定した安全マスを開く
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
        console.log(`=== トポロジカル・マインスイーパー 背理法搭載版テスト ===`);
        console.log(`設定: ${CONFIG.WIDTH}x${CONFIG.HEIGHT}, 地雷: ${CONFIG.MINES}`);
        
        const topology = new Topology(CONFIG.WIDTH, CONFIG.HEIGHT);
        const startTime = Date.now();
        let attempts = 0;
        let success = false;

        console.log("生成ループを開始します...");

        while (!success && attempts < CONFIG.MAX_RETRY) {
            attempts++;
            if (attempts % 1 === 0) {
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
            console.log(`\n判定: 背理法の実装により、高難易度盤面の生成に成功しました。`);
        } else {
            console.log(`[失敗] まだ解けません。ロジックのさらなる強化か、再帰レベルを深くする必要があります。`);
        }

    } catch (e) {
        console.error(e);
    }
}

runTest();