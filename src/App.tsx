import { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { type GameConfig, DIFFICULTY_PRESETS } from './logic/GameCore.ts';
import './App.css';

function App() {
  const [config, setConfig] = useState<GameConfig>({
    width: 9,
    height: 9,
    mines: 10,
    topologyType: 'TORUS'
  });
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [gameState, setGameState] = useState<'INIT' | 'GENERATING' | 'PLAYING' | 'WON' | 'LOST'>('INIT');
  const [showSettings, setShowSettings] = useState(true);
  const [minesLeft, setMinesLeft] = useState(10);
  
  // レビューモード（クリア後に盤面を見る状態）
  const [isReviewing, setIsReviewing] = useState(false);
  
  const [resetCounter, setResetCounter] = useState(0);

  // --- アクション ---
  const handleTryAgain = () => {
    setResetCounter(c => c + 1);
    setGameState('INIT');
    setIsReviewing(false);
  };

  const handleBackToSettings = () => {
    setShowSettings(true);
    setResetCounter(c => c + 1);
    setGameState('INIT');
    setIsReviewing(false);
  };

  const handleViewBoard = () => {
    setIsReviewing(true); // モーダルを閉じて盤面を見せる
  };

  const applyPreset = (presetIndex: number) => {
    const p = DIFFICULTY_PRESETS[presetIndex];
    setConfig(prev => ({ ...prev, width: p.width, height: p.height, mines: p.mines }));
  };

  return (
    <div className={`app-container ${isDarkMode ? 'dark' : 'light'}`}>
      
      <GameCanvas 
        config={config} 
        isDarkMode={isDarkMode}
        onGameStateChange={setGameState}
        onMineCountChange={setMinesLeft}
        requestReset={resetCounter}
        isReviewing={isReviewing}
      />

      {/* ヘッダー */}
      <header style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: isDarkMode ? 'rgba(24,25,26, 0.85)' : 'rgba(255,255,255, 0.85)',
        backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${isDarkMode ? '#3a3b3c' : '#e4e6eb'}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        pointerEvents: 'none',
        zIndex: 50
      }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', letterSpacing: '-0.5px' }}>
            Topological Minesweeper (beta)
          </h1>
          <div style={{ display: 'flex', gap: '8px' }}>
             <span style={badgeStyle(isDarkMode)}>
               {config.topologyType}
             </span>
             <span style={{ ...badgeStyle(isDarkMode), color: minesLeft < 0 ? '#ff4d4d' : 'inherit' }}>
               💣 {minesLeft}
             </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', pointerEvents: 'auto' }}>
          {/* レビュー中はここにアクションボタンを表示 */}
          {isReviewing ? (
            <>
              <button onClick={handleBackToSettings} style={secondaryBtnStyle(isDarkMode)}>
                Settings
              </button>
              <button onClick={handleTryAgain} style={primaryBtnStyle}>
                Try Again
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsDarkMode(!isDarkMode)} style={btnStyle(isDarkMode)}>
                {isDarkMode ? '☀' : '🌙'}
              </button>
              <button onClick={() => setShowSettings(true)} style={btnStyle(isDarkMode)}>
                ⚙ Settings
              </button>
            </>
          )}
        </div>
      </header>

      {/* 設定モーダル */}
      {showSettings && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle(isDarkMode)}>
            <h2 style={{ marginTop: 0 }}>Game Settings</h2>
            
            <section style={{ marginBottom: '24px' }}>
              <h3 style={sectionTitleStyle}>Difficulty</h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                {DIFFICULTY_PRESETS.map((p, idx) => {
                  const isActive = config.width === p.width && config.mines === p.mines;
                  return (
                    <button key={idx} onClick={() => applyPreset(idx)} style={presetBtnStyle(isDarkMode, isActive)}>
                      <span style={{ fontWeight: 'bold' }}>{p.label}</span>
                      <span style={{ opacity: 0.8, fontSize: '0.9em' }}>{p.width}×{p.height} / 💣{p.mines}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={{ marginBottom: '24px' }}>
              <h3 style={sectionTitleStyle}>Topology</h3>
              <div style={{ display: 'flex', gap: '12px' }}>
                {['TORUS', 'SQUARE'].map((type) => (
                  <button 
                    key={type}
                    onClick={() => setConfig(prev => ({ ...prev, topologyType: type as any }))}
                    style={{
                      ...presetBtnStyle(isDarkMode, config.topologyType === type),
                      flex: 1, justifyContent: 'center', textAlign: 'center'
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </section>

            <div style={{ textAlign: 'right', marginTop: '32px' }}>
              <button 
                onClick={() => { setShowSettings(false); setResetCounter(c => c+1); }} 
                style={primaryBtnStyle}
              >
                Start Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ローディング */}
      {gameState === 'GENERATING' && (
        <div style={modalOverlayStyle}>
          <div style={{ color: 'white', textAlign: 'center' }}>
            <div className="spinner" style={{ 
              width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.3)', 
              borderTopColor: '#fff', borderRadius: '50%', margin: '0 auto 16px',
              animation: 'spin 1s linear infinite'
            }}></div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Generating...</div>
          </div>
        </div>
      )}

      {/* ゲームオーバー / クリア表示 (レビュー中は表示しない) */}
      {(gameState === 'LOST' || gameState === 'WON') && !isReviewing && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalContentStyle(isDarkMode), textAlign: 'center' }}>
            <h2 style={{ 
              color: gameState === 'WON' ? '#42b72a' : '#ff4d4d',
              fontSize: '2rem', margin: '0 0 16px'
            }}>
              {gameState === 'WON' ? 'YOU WON!' : 'GAME OVER'}
            </h2>
            <p style={{ marginBottom: '32px', fontSize: '1.1rem' }}>
              {gameState === 'WON' ? 'All safe cells opened!' : 'You stepped on a mine.'}
            </p>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {/* 盤面を見るボタン */}
              <button onClick={handleViewBoard} style={secondaryBtnStyle(isDarkMode)}>
                👁 View Board
              </button>
              
              <button onClick={handleTryAgain} style={primaryBtnStyle}>
                Try Again
              </button>
              
              <button onClick={handleBackToSettings} style={{...secondaryBtnStyle(isDarkMode), border: 'none', opacity: 0.7, fontSize: '0.9rem'}}>
                Settings
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// --- Styles ---
const btnStyle = (dark: boolean) => ({
  padding: '8px 16px',
  background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.9rem'
});

const badgeStyle = (dark: boolean) => ({
  fontSize: '0.85rem', 
  fontWeight: 'bold',
  background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
  padding: '4px 8px', 
  borderRadius: '6px'
});

const presetBtnStyle = (dark: boolean, active: boolean) => ({
  padding: '12px 16px',
  background: active ? '#1877f2' : (dark ? '#242526' : '#f0f2f5'),
  color: active ? 'white' : 'inherit',
  border: active ? '2px solid #1877f2' : `2px solid transparent`,
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  transition: 'all 0.2s'
});

const primaryBtnStyle = {
  padding: '12px 32px',
  background: '#1877f2',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '1rem',
  boxShadow: '0 4px 12px rgba(24, 119, 242, 0.4)'
};

const secondaryBtnStyle = (dark: boolean) => ({
  padding: '12px 24px',
  background: 'transparent',
  color: 'inherit',
  border: `2px solid ${dark ? '#4e4f50' : '#ddd'}`,
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '1rem'
});

const modalOverlayStyle = {
  position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(4px)',
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  zIndex: 1000
};

const modalContentStyle = (dark: boolean) => ({
  background: dark ? '#242526' : 'white',
  padding: '32px',
  borderRadius: '16px',
  width: '100%',
  maxWidth: '400px',
  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
  border: `1px solid ${dark ? '#3a3b3c' : 'transparent'}`
});

const sectionTitleStyle = {
  fontSize: '0.9rem', 
  textTransform: 'uppercase' as const, 
  opacity: 0.7, 
  marginBottom: '8px'
};

export default App;