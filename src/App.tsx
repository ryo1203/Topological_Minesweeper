import { GameCanvas } from './components/GameCanvas';
import './App.css'; // デフォルトのスタイルリセット用

function App() {
  return (
    <div className="App">
      <GameCanvas 
        config={{
          width: 48,
          height: 24,
          mines: 256,
          topologyType: 'TORUS' // ここを 'SQUARE' に変えれば通常モード
        }} 
      />
    </div>
  );
}

export default App;