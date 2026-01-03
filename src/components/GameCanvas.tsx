/**
 * src/components/GameCanvas.tsx
 * Canvas APIを使用したマインスイーパーの描画と操作
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Board, generateBoard, type GameConfig } from '../logic/GameCore.ts';

interface GameCanvasProps {
    config: GameConfig;
}

// デザイン定数
const CELL_SIZE = 30;
const COLORS = {
    HIDDEN: '#bbbbbb',
    OPENED: '#e0e0e0',
    FLAGGED: '#ffaaaa',
    BORDER: '#888888',
    TEXT: '#333333',
    MINE: '#000000',
    NUMBERS: [
        '', '#0000ff', '#008000', '#ff0000', '#000080', 
        '#800000', '#008080', '#000000', '#808080'
    ]
};

export const GameCanvas: React.FC<GameCanvasProps> = ({ config }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [board, setBoard] = useState<Board | null>(null);
    const [gameState, setGameState] = useState<'INIT' | 'PLAYING' | 'WON' | 'LOST'>('INIT');
    
    // カメラ位置 (ピクセル単位のオフセット)
    const [camera, setCamera] = useState({ x: 0, y: 0 });
    
    // ドラッグ操作用
    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 }); // クリックかドラッグかの判定用

    // --- 描画ループ ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 画面クリア
        ctx.fillStyle = '#333'; // 背景色
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 描画範囲の計算（画面に見えている範囲のマスだけ描画する）
        // カメラ座標をCELL_SIZEで割って、どのインデックスから描画すべきか求める
        const startCol = Math.floor(-camera.x / CELL_SIZE);
        const startRow = Math.floor(-camera.y / CELL_SIZE);
        const endCol = startCol + Math.ceil(canvas.width / CELL_SIZE) + 1;
        const endRow = startRow + Math.ceil(canvas.height / CELL_SIZE) + 1;

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                // 描画座標 (スクリーン座標)
                const px = col * CELL_SIZE + camera.x;
                const py = row * CELL_SIZE + camera.y;

                // --- トーラス/正方形の座標変換ロジック ---
                // 無限に続くcol, rowを、実際の盤面サイズ(0 ~ width-1)に丸める
                let tx = col;
                let ty = row;

                if (config.topologyType === 'TORUS') {
                    // 負の値の剰余対策: (a % n + n) % n
                    tx = (col % config.width + config.width) % config.width;
                    ty = (row % config.height + config.height) % config.height;
                } else {
                    // SQUAREの場合、範囲外は描画しない
                    if (tx < 0 || tx >= config.width || ty < 0 || ty >= config.height) {
                        continue; 
                    }
                }

                // 盤面データ取得
                // まだ盤面が生成されていない(INIT)場合は「すべてHIDDEN」として描画
                let status = 'HIDDEN';
                let neighbors = 0;
                let isMine = false;

                if (board) {
                    const idx = ty * config.width + tx;
                    status = board.status[idx];
                    neighbors = board.neighborMineCounts[idx];
                    isMine = board.mines[idx];
                }

                // --- マスの描画 ---
                // 背景
                if (status === 'OPENED') {
                    ctx.fillStyle = isMine ? '#ff0000' : COLORS.OPENED;
                } else if (status === 'FLAGGED') {
                    ctx.fillStyle = COLORS.FLAGGED;
                } else {
                    ctx.fillStyle = COLORS.HIDDEN;
                }
                ctx.fillRect(px, py, CELL_SIZE - 1, CELL_SIZE - 1); // -1はグリッド線代わり

                // 文字・アイコン
                if (status === 'OPENED' && !isMine && neighbors > 0) {
                    ctx.fillStyle = COLORS.NUMBERS[neighbors] || 'black';
                    ctx.font = 'bold 20px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(neighbors.toString(), px + CELL_SIZE / 2, py + CELL_SIZE / 2);
                }
                if (status === 'OPENED' && isMine) {
                    ctx.fillStyle = 'black';
                    ctx.beginPath();
                    ctx.arc(px + CELL_SIZE/2, py + CELL_SIZE/2, CELL_SIZE/4, 0, Math.PI*2);
                    ctx.fill();
                }
                if (status === 'FLAGGED') {
                    ctx.fillStyle = 'red';
                    ctx.font = '16px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🚩', px + CELL_SIZE / 2, py + CELL_SIZE / 2 + 2);
                }
            }
        }
    }, [board, camera, config]);

    // アニメーションフレームで再描画
    useEffect(() => {
        let animationId: number;
        const renderLoop = () => {
            draw();
            animationId = requestAnimationFrame(renderLoop);
        };
        renderLoop();
        return () => cancelAnimationFrame(animationId);
    }, [draw]);


    // --- マウス操作ハンドラ ---

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        dragStartPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        
        setCamera(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        isDragging.current = false;

        // ドラッグ距離が短い場合のみ「クリック」とみなす
        const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
        if (dist < 5) {
            handleCellClick(e.nativeEvent.offsetX, e.nativeEvent.offsetY, e.button === 2); // 右クリックならフラグ
        }
    };

    const handleCellClick = (canvasX: number, canvasY: number, isRightClick: boolean) => {
        if (gameState === 'LOST' || gameState === 'WON') return;

        // クリックされた座標から論理座標(tx, ty)を計算
        const worldX = canvasX - camera.x;
        const worldY = canvasY - camera.y;
        
        const col = Math.floor(worldX / CELL_SIZE);
        const row = Math.floor(worldY / CELL_SIZE);

        let tx = col;
        let ty = row;

        // トーラス座標変換
        if (config.topologyType === 'TORUS') {
            tx = (col % config.width + config.width) % config.width;
            ty = (row % config.height + config.height) % config.height;
        } else {
            if (tx < 0 || tx >= config.width || ty < 0 || ty >= config.height) return;
        }

        const index = ty * config.width + tx;

        // --- ゲーム進行ロジック ---
        
        // 1. 初回クリック時: 盤面生成
        if (gameState === 'INIT') {
            if (isRightClick) return; // 初手右クリックは無視

            // ここでGameCoreの生成関数を呼ぶ（運ゲー排除ロジックが走る）
            // ※トーラスなら100ms程度だが、重い場合は非同期化が必要
            const newBoard = generateBoard(config, index);
            
            if (newBoard) {
                setBoard(newBoard);
                setGameState('PLAYING');
            } else {
                alert("盤面生成に失敗しました（リトライ回数超過）。もう一度クリックしてください。");
                return;
            }
        }

        // 2. プレイ中: 開封 or フラグ
        if (board) {
            // ReactのStateは不変性が原則なので、複製して変更を加える
            // (GameCore内でcloneメソッドを用意したのはこのため)
            const newBoard = board.clone();
            
            if (isRightClick) {
                newBoard.toggleFlag(index);
            } else {
                const exploded = newBoard.open(index);
                if (exploded) {
                    setGameState('LOST');
                    // 爆発したら全地雷を表示するなどの処理をここで入れる
                }
                // クリア判定（手抜き: ここではBoard側にクリア判定関数を追加するか、簡易的にチェック）
                // (今回は省略)
            }
            setBoard(newBoard);
        }
    };

    // 右クリックメニュー禁止
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', background: 'rgba(0,0,0,0.5)', padding: '5px', pointerEvents: 'none' }}>
                Mode: {config.topologyType} <br/>
                State: {gameState} <br/>
                Left Click: Open / Right Click: Flag / Drag: Move
            </div>
            
            <canvas
                ref={canvasRef}
                width={window.innerWidth}
                height={window.innerHeight}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onContextMenu={handleContextMenu}
                style={{ cursor: isDragging.current ? 'grabbing' : 'pointer' }}
            />
        </div>
    );
};