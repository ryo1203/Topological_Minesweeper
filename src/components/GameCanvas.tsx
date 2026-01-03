/**
 * src/components/GameCanvas.tsx
 * Canvas描画と操作、勝利判定の呼び出し
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Board, generateBoardAsync, type GameConfig } from '../logic/GameCore.ts';

interface GameCanvasProps {
    config: GameConfig;
    isDarkMode: boolean;
    onGameStateChange: (state: 'INIT' | 'GENERATING' | 'PLAYING' | 'WON' | 'LOST') => void;
    onMineCountChange: (count: number) => void; // 残り地雷数通知用
    requestReset: number;
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

export const GameCanvas: React.FC<GameCanvasProps> = ({ config, isDarkMode, onGameStateChange, onMineCountChange, requestReset }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [board, setBoard] = useState<Board | null>(null);
    const [gameState, setGameState] = useState<'INIT' | 'GENERATING' | 'PLAYING' | 'WON' | 'LOST'>('INIT');
    
    // カメラ座標
    const [camera, setCamera] = useState({ x: 0, y: 0 });

    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 });

    const colors = isDarkMode ? THEME.DARK : THEME.LIGHT;

    // 初期化
    const resetCamera = useCallback(() => {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const boardW = config.width * CELL_SIZE;
        const boardH = config.height * CELL_SIZE;
        
        setCamera({
            x: Math.floor((screenW - boardW) / 2),
            y: Math.floor((screenH - boardH) / 2)
        });
    }, [config]);

    useEffect(() => {
        resetCamera();
        setBoard(null);
        setGameState('INIT');
        onGameStateChange('INIT');
        onMineCountChange(config.mines); // 初期状態は最大数
    }, [config, requestReset, resetCamera, onGameStateChange, onMineCountChange]);

    // 描画ループ
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = colors.BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const buffer = 2;
        const startCol = Math.floor(-camera.x / CELL_SIZE) - buffer;
        const startRow = Math.floor(-camera.y / CELL_SIZE) - buffer;
        const endCol = startCol + Math.ceil(canvas.width / CELL_SIZE) + buffer * 2;
        const endRow = startRow + Math.ceil(canvas.height / CELL_SIZE) + buffer * 2;

        const mainBoardX = camera.x;
        const mainBoardY = camera.y;
        const mainBoardW = config.width * CELL_SIZE;
        const mainBoardH = config.height * CELL_SIZE;

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const px = col * CELL_SIZE + camera.x;
                const py = row * CELL_SIZE + camera.y;

                let tx = col;
                let ty = row;

                if (config.topologyType === 'TORUS') {
                    tx = (col % config.width + config.width) % config.width;
                    ty = (row % config.height + config.height) % config.height;
                } else {
                    if (tx < 0 || tx >= config.width || ty < 0 || ty >= config.height) continue;
                }

                let status = 'HIDDEN';
                let neighbors = 0;
                let isMine = false;

                if (board) {
                    const idx = ty * config.width + tx;
                    status = board.status[idx];
                    neighbors = board.neighborMineCounts[idx];
                    isMine = board.mines[idx];
                }

                // マス描画
                ctx.fillStyle = status === 'OPENED' ? colors.CELL_OPEN : colors.CELL_HIDDEN;
                if (status === 'OPENED' && isMine) ctx.fillStyle = colors.MINE_BG;
                
                ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = colors.CELL_BORDER;
                ctx.lineWidth = 1;
                ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

                if (status === 'OPENED' && !isMine && neighbors > 0) {
                    ctx.fillStyle = NUMBER_COLORS[neighbors] || colors.TEXT;
                    ctx.font = 'bold 20px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(neighbors.toString(), px + CELL_SIZE / 2, py + CELL_SIZE / 2);
                }
                if (status === 'OPENED' && isMine) {
                    ctx.fillStyle = isDarkMode ? '#ff4d4d' : '#333';
                    ctx.beginPath();
                    ctx.arc(px + CELL_SIZE/2, py + CELL_SIZE/2, CELL_SIZE/3.5, 0, Math.PI*2);
                    ctx.fill();
                }
                if (status === 'FLAGGED') {
                    ctx.fillStyle = colors.FLAG;
                    ctx.font = '20px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🚩', px + CELL_SIZE / 2, py + CELL_SIZE / 2 + 2);
                }
            }
        }

        // メイン枠線
        ctx.strokeStyle = colors.MAIN_BORDER;
        ctx.lineWidth = 3;
        ctx.strokeRect(mainBoardX, mainBoardY, mainBoardW, mainBoardH);

    }, [board, camera, config, colors, isDarkMode]);

    useEffect(() => {
        let animationId: number;
        const renderLoop = () => { draw(); animationId = requestAnimationFrame(renderLoop); };
        renderLoop();
        return () => cancelAnimationFrame(animationId);
    }, [draw]);

    // 操作ハンドラ
    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        dragStartPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        
        let newCamX = camera.x + dx;
        let newCamY = camera.y + dy;

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

        setCamera({ x: newCamX, y: newCamY });
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
        if (gameState === 'LOST' || gameState === 'WON' || gameState === 'GENERATING') return;

        const col = Math.floor((canvasX - camera.x) / CELL_SIZE);
        const row = Math.floor((canvasY - camera.y) / CELL_SIZE);

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

            const newBoard = await generateBoardAsync(config, index, (count) => {});
            
            if (newBoard) {
                setBoard(newBoard);
                setGameState('PLAYING');
                onGameStateChange('PLAYING');
                // 生成直後もカウント更新
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
                // フラグ数を更新して通知
                onMineCountChange(config.mines - newBoard.countFlags());
            } else {
                const exploded = newBoard.open(index);
                if (exploded) {
                    setGameState('LOST');
                    onGameStateChange('LOST');
                } else {
                    // 正確な勝利判定: 地雷以外が全て開いているか？
                    if (newBoard.checkWin()) {
                        setGameState('WON');
                        onGameStateChange('WON');
                        onMineCountChange(0); // クリア時は0にする
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
            onContextMenu={(e) => e.preventDefault()}
            style={{ display: 'block', cursor: isDragging.current ? 'grabbing' : 'pointer' }}
        />
    );
};