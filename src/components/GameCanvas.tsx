import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Board, generateBoardAsync, type GameConfig } from '../logic/GameCore.ts';

interface GameCanvasProps {
    config: GameConfig;
    isDarkMode: boolean;
    onGameStateChange: (state: 'INIT' | 'GENERATING' | 'PLAYING' | 'WON' | 'LOST') => void;
    onMineCountChange: (count: number) => void;
    requestReset: number;
    isReviewing: boolean;
}

const CELL_SIZE = 40;

const THEME = {
    LIGHT: {
        BG: '#f0f2f5',
        CELL_HIDDEN: '#e4e6eb',
        CELL_OPEN: '#ffffff',
        CELL_BORDER: '#bcc0c4',
        TEXT: '#050505',
        MINE_BG: '#ffcccc',
        FLAG: '#ff4d4d',
        MAIN_BORDER: '#1877f2'
    },
    DARK: {
        BG: '#18191a',
        CELL_HIDDEN: '#242526',
        CELL_OPEN: '#3a3b3c',
        CELL_BORDER: '#4e4f50',
        TEXT: '#e4e6eb',
        MINE_BG: '#501010',
        FLAG: '#ff6666',
        MAIN_BORDER: '#4dabf5'
    }
};

const NUMBER_COLORS = ['', '#1877f2', '#42b72a', '#f5533d', '#7b1fa2', '#ff9800', '#00bcd4', '#000000', '#7f8c8d'];

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
    config, isDarkMode, onGameStateChange, onMineCountChange, requestReset, isReviewing 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // パフォーマンスのためRefで座標管理
    const cameraRef = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 });
    
    const [board, setBoard] = useState<Board | null>(null);
    const [gameState, setGameState] = useState<'INIT' | 'GENERATING' | 'PLAYING' | 'WON' | 'LOST'>('INIT');
    
    const colors = isDarkMode ? THEME.DARK : THEME.LIGHT;

    // --- 初期化（位置合わせ） ---
    const resetCamera = useCallback(() => {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const boardW = config.width * CELL_SIZE;
        const boardH = config.height * CELL_SIZE;
        
        // X座標: 常に画面中央
        const centerX = Math.floor((screenW - boardW) / 2);

        // Y座標: 中央寄せするが、ヘッダー(約80px)より上には行かないように制限
        // これにより、盤面が画面より大きい場合でも上端が見える位置から始まる
        const centerY = Math.floor((screenH - boardH) / 2);
        const safeY = Math.max(80, centerY);

        cameraRef.current = {
            x: centerX,
            y: safeY
        };
    }, [config]);

    // リセット処理
    useEffect(() => {
        resetCamera();
        setBoard(null);
        setGameState('INIT');
        onGameStateChange('INIT');
        onMineCountChange(config.mines);
    }, [config, requestReset, resetCamera, onGameStateChange, onMineCountChange]);

    // --- 描画ループ ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 背景クリア
        ctx.fillStyle = colors.BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cam = cameraRef.current;

        // 描画範囲の計算
        const startCol = Math.floor(-cam.x / CELL_SIZE);
        const startRow = Math.floor(-cam.y / CELL_SIZE);
        const endCol = startCol + Math.ceil(canvas.width / CELL_SIZE) + 1;
        const endRow = startRow + Math.ceil(canvas.height / CELL_SIZE) + 1;

        // マスの描画
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                // スクリーン描画位置
                const px = Math.floor(col * CELL_SIZE + cam.x);
                const py = Math.floor(row * CELL_SIZE + cam.y);

                // 論理座標への変換
                let tx = col;
                let ty = row;

                if (config.topologyType === 'TORUS') {
                    // ループ処理
                    tx = (col % config.width + config.width) % config.width;
                    ty = (row % config.height + config.height) % config.height;
                } else {
                    // スクエアの場合は範囲外を描画しない
                    if (tx < 0 || tx >= config.width || ty < 0 || ty >= config.height) continue;
                }

                // 盤面データ取得
                let status = 'HIDDEN';
                let neighbors = 0;
                let isMine = false;
                
                if (board) {
                    const idx = ty * config.width + tx;
                    status = board.status[idx];
                    neighbors = board.neighborMineCounts[idx];
                    isMine = board.mines[idx];
                    
                    if ((gameState === 'LOST' || isReviewing) && isMine && status === 'HIDDEN') {
                        status = 'REVEALED_MINE'; 
                    }
                }

                // 色決定
                if (status === 'OPENED') {
                    ctx.fillStyle = isMine ? colors.MINE_BG : colors.CELL_OPEN;
                } else if (status === 'REVEALED_MINE') {
                    ctx.fillStyle = isDarkMode ? '#50101088' : '#ffcccc88'; 
                } else {
                    ctx.fillStyle = colors.CELL_HIDDEN;
                }
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

                // 枠線
                ctx.strokeStyle = colors.CELL_BORDER;
                ctx.lineWidth = 1;
                ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

                // 中身
                if ((status === 'OPENED' || status === 'REVEALED_MINE') && isMine) {
                    ctx.fillStyle = isDarkMode ? '#ff4d4d' : '#333';
                    ctx.beginPath();
                    ctx.arc(px + CELL_SIZE/2, py + CELL_SIZE/2, CELL_SIZE/3.5, 0, Math.PI*2);
                    ctx.fill();
                } else if (status === 'FLAGGED') {
                    ctx.fillStyle = colors.FLAG;
                    ctx.font = '20px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🚩', px + CELL_SIZE / 2, py + CELL_SIZE / 2 + 2);
                    
                    if ((gameState === 'LOST' || isReviewing) && board && !board.mines[ty * config.width + tx]) {
                        // 間違った旗にはバツ印
                        ctx.strokeStyle = 'red';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(px + 8, py + 8); ctx.lineTo(px + CELL_SIZE - 8, py + CELL_SIZE - 8);
                        ctx.moveTo(px + CELL_SIZE - 8, py + 8); ctx.lineTo(px + 8, py + CELL_SIZE - 8);
                        ctx.stroke();
                    }

                } else if (status === 'OPENED' && neighbors > 0) {
                    ctx.fillStyle = NUMBER_COLORS[neighbors] || colors.TEXT;
                    ctx.font = 'bold 20px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(neighbors.toString(), px + CELL_SIZE / 2, py + CELL_SIZE / 2);
                }
            }
        }

        // メインエリアの青い枠線（基準位置）
        const mainW = config.width * CELL_SIZE;
        const mainH = config.height * CELL_SIZE;
        
        ctx.strokeStyle = colors.MAIN_BORDER;
        ctx.lineWidth = 3;
        ctx.strokeRect(cam.x, cam.y, mainW, mainH);

    }, [board, config, colors, isDarkMode, gameState, isReviewing]);

    // アニメーションループ
    useEffect(() => {
        let animationId: number;
        const render = () => {
            draw();
            animationId = requestAnimationFrame(render);
        };
        render();
        return () => cancelAnimationFrame(animationId);
    }, [draw]);


    // --- 操作イベント ---
    
    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        dragStartPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        
        let newCamX = cameraRef.current.x + dx;
        let newCamY = cameraRef.current.y + dy;

        // トーラス時の座標正規化（無限スクロールしても座標を中央付近に戻す）
        if (config.topologyType === 'TORUS') {
            const boardW = config.width * CELL_SIZE;
            const boardH = config.height * CELL_SIZE;
            const screenCenterW = window.innerWidth / 2;
            const screenCenterH = window.innerHeight / 2;
            const currentCenterX = newCamX + boardW / 2;
            const currentCenterY = newCamY + boardH / 2;

            if (currentCenterX > screenCenterW + boardW) newCamX -= boardW;
            if (currentCenterX < screenCenterW - boardW) newCamX += boardW;
            if (currentCenterY > screenCenterH + boardH) newCamY -= boardH;
            if (currentCenterY < screenCenterH - boardH) newCamY += boardH;
        }

        cameraRef.current = { x: newCamX, y: newCamY };
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        isDragging.current = false;
        const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
        
        if (dist < 5) {
            handleCellClick(e.nativeEvent.offsetX, e.nativeEvent.offsetY, e.button === 2);
        }
    };

    const handleCellClick = async (canvasX: number, canvasY: number, isRightClick: boolean) => {
        if (gameState === 'LOST' || gameState === 'WON' || gameState === 'GENERATING' || isReviewing) return;

        const cam = cameraRef.current;
        const col = Math.floor((canvasX - cam.x) / CELL_SIZE);
        const row = Math.floor((canvasY - cam.y) / CELL_SIZE);

        let tx = col;
        let ty = row;

        if (config.topologyType === 'TORUS') {
            tx = (col % config.width + config.width) % config.width;
            ty = (row % config.height + config.height) % config.height;
        } else {
            if (tx < 0 || tx >= config.width || ty < 0 || ty >= config.height) return;
        }

        const index = ty * config.width + tx;

        if (gameState === 'INIT') {
            if (isRightClick) return;
            setGameState('GENERATING');
            onGameStateChange('GENERATING');

            const newBoard = await generateBoardAsync(config, index, () => {});
            
            if (newBoard) {
                setBoard(newBoard);
                setGameState('PLAYING');
                onGameStateChange('PLAYING');
                onMineCountChange(config.mines - newBoard.countFlags());
            } else {
                alert("Generation failed. Please try again.");
                setGameState('INIT');
                onGameStateChange('INIT');
            }
            return;
        }

        if (board) {
            const newBoard = board.clone();
            
            if (isRightClick) {
                newBoard.toggleFlag(index);
                onMineCountChange(config.mines - newBoard.countFlags());
            } else {
                const exploded = newBoard.open(index);
                if (exploded) {
                    setGameState('LOST');
                    onGameStateChange('LOST');
                } else {
                    if (newBoard.checkWin()) {
                        setGameState('WON');
                        onGameStateChange('WON');
                        onMineCountChange(0);
                    }
                }
            }
            setBoard(newBoard);
        }
    };

    return (
        <canvas
            ref={canvasRef}
            width={window.innerWidth}
            height={window.innerHeight}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { isDragging.current = false; }}
            onContextMenu={(e) => e.preventDefault()}
            style={{ display: 'block', cursor: isDragging.current ? 'grabbing' : 'pointer' }}
        />
    );
};