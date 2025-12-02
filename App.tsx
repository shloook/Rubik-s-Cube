import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { RubiksCube, RubiksCubeRef } from './components/RubiksCube.tsx';
import { Move, Axis, getMoveFromNotation } from './types.ts';

export default function App() {
  const cubeRef = useRef<RubiksCubeRef>(null);
  const [history, setHistory] = useState<Move[]>([]);
  const [isBusy, setIsBusy] = useState(false); 
  
  // Solve/Reset State
  const isSolving = useRef(false);
  const [solveProgress, setSolveProgress] = useState<{current: number, total: number} | null>(null);

  // --- Move Handler ---
  const handleMoveComplete = useCallback((move: Move) => {
    if (isSolving.current) {
      // If solving/resetting, we update progress
      setSolveProgress(prev => {
        if (!prev) return null;
        return { ...prev, current: prev.current + 1 };
      });
    } else {
      // Normal operation or scrambling
      setHistory(prev => [...prev, move]);
    }
  }, []);

  // Monitor solve/reset completion
  useEffect(() => {
    if (solveProgress && solveProgress.current >= solveProgress.total && solveProgress.total > 0) {
      // Reset finished
      setIsBusy(false);
      isSolving.current = false;
      setSolveProgress(null);
      setHistory([]); // Clear history after reset is complete
    }
  }, [solveProgress]);

  // --- Button Actions ---
  const performNotationMove = (notation: string) => {
    if (isBusy || !cubeRef.current) return;
    const move = getMoveFromNotation(notation);
    cubeRef.current.addMove(move, 1.5); 
  };

  // --- Scramble ---
  const handleScramble = () => {
    // Disable if busy OR if history exists (already scrambled or moved)
    if (isBusy || !cubeRef.current || history.length > 0) return;
    
    setIsBusy(true);
    setHistory([]); // Ensure history is clean (though it should be if button was enabled)

    const moves: Move[] = [];
    const axes: Axis[] = ['x', 'y', 'z'];
    const slices = [-1, 0, 1];
    const dirs: (1|-1)[] = [1, -1];

    for (let i = 0; i < 20; i++) {
      moves.push({
        axis: axes[Math.floor(Math.random() * axes.length)],
        slice: slices[Math.floor(Math.random() * slices.length)],
        direction: dirs[Math.floor(Math.random() * dirs.length)],
      });
    }

    cubeRef.current.addMoves(moves, 6); // Fast speed for scramble
    
    // Simple timeout to unlock UI after scramble
    setTimeout(() => setIsBusy(false), 1500); 
  };

  // --- Reset (formerly Solve) ---
  const handleReset = () => {
    if (isBusy || !cubeRef.current || history.length === 0) return;
    
    // 1. Calculate solution (inverse of history)
    const reverseMoves = [...history].reverse().map(m => ({
      ...m,
      direction: (m.direction * -1) as 1 | -1
    }));
    
    // 2. Lock UI and setup progress
    setIsBusy(true);
    isSolving.current = true;
    setSolveProgress({ current: 0, total: reverseMoves.length });
    
    // 3. Execute moves
    cubeRef.current.addMoves(reverseMoves, 3.0);
  };

  const MoveButton = ({ n }: { n: string }) => (
    <button
      onClick={() => performNotationMove(n)}
      disabled={isBusy}
      className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 active:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-mono font-bold text-lg shadow-md transition-colors border border-zinc-700/50"
    >
      {n}
    </button>
  );

  return (
    <div className="relative w-full h-full bg-zinc-950 text-white font-sans overflow-hidden select-none">
      
      {/* 3D Scene */}
      <Canvas camera={{ position: [5, 4, 6], fov: 45 }} shadows dpr={[1, 2]}>
        <color attach="background" args={['#09090b']} />
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        <Environment preset="studio" />

        <RubiksCube 
          ref={cubeRef}
          onMoveComplete={handleMoveComplete}
        />
      </Canvas>

      {/* Header */}
      <div className="absolute top-0 left-0 w-full p-4 md:p-6 flex justify-between items-start pointer-events-none">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white/90 drop-shadow-md">Rubik's 3D</h1>
          <p className="text-white/50 text-xs md:text-sm mt-1">Realistic Interactive Cube</p>
        </div>
        <div className="pointer-events-auto bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-3">
           <div className="flex flex-col items-end">
             <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Moves</span>
             <span className="text-sm font-mono font-bold text-white leading-none">{history.length}</span>
           </div>
        </div>
      </div>

      {/* Reset/Solve Progress Overlay */}
      {solveProgress && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-8 py-6 rounded-2xl backdrop-blur-xl border border-white/10 flex flex-col items-center gap-3 z-50 pointer-events-none shadow-2xl">
           <div className="text-xl font-bold tracking-tight animate-pulse text-red-400">Resetting...</div>
           <div className="text-2xl font-mono font-bold">{solveProgress.current} <span className="text-white/30 text-lg">/ {solveProgress.total}</span></div>
           <div className="w-48 h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-2">
              <div 
                className="h-full bg-red-500 transition-all duration-300 ease-out" 
                style={{ width: `${(solveProgress.current / solveProgress.total) * 100}%` }}
              />
           </div>
        </div>
      )}

      {/* Control Panel (Bottom) */}
      <div className={`absolute bottom-0 left-0 w-full flex flex-col items-center pb-6 md:pb-8 pointer-events-auto bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-20 transition-opacity duration-300 ${isBusy ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        
        {/* Notation Grid */}
        <div className="flex gap-4 md:gap-6 mb-8 overflow-x-auto px-4 max-w-full pb-2 no-scrollbar mask-linear-fade">
           <div className="flex flex-col gap-2 items-center">
              <div className="flex gap-2"><MoveButton n="L" /><MoveButton n="L'" /></div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Left</span>
           </div>
           <div className="flex flex-col gap-2 items-center">
              <div className="flex gap-2"><MoveButton n="R" /><MoveButton n="R'" /></div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Right</span>
           </div>
           <div className="flex flex-col gap-2 items-center">
              <div className="flex gap-2"><MoveButton n="U" /><MoveButton n="U'" /></div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Up</span>
           </div>
           <div className="flex flex-col gap-2 items-center">
              <div className="flex gap-2"><MoveButton n="D" /><MoveButton n="D'" /></div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Down</span>
           </div>
           <div className="flex flex-col gap-2 items-center">
              <div className="flex gap-2"><MoveButton n="F" /><MoveButton n="F'" /></div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Front</span>
           </div>
           <div className="flex flex-col gap-2 items-center">
              <div className="flex gap-2"><MoveButton n="B" /><MoveButton n="B'" /></div>
              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Back</span>
           </div>
        </div>

        {/* Main Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleScramble}
            disabled={isBusy || history.length > 0} // Disabled if busy OR if any moves have been made
            className="flex items-center gap-2 px-6 py-3 bg-zinc-800/80 hover:bg-zinc-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold shadow-lg border border-white/5 backdrop-blur-sm transition-all text-sm md:text-base group"
          >
            <svg className="text-zinc-400 group-hover:text-white transition-colors" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l14.2-12.6c.8-1.1 2-1.7 3.3-1.7H26"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l14.2 12.6c.8 1.1 2 1.7 3.3 1.7H26"/></svg>
            Scramble
          </button>

          <button
            onClick={handleReset}
            disabled={isBusy || history.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed rounded-xl font-semibold shadow-lg shadow-red-900/20 transition-all text-sm md:text-base"
          >
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
             </svg>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}