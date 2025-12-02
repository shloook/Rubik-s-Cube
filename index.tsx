import React, { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import ReactDOM from 'react-dom/client';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, RoundedBox } from '@react-three/drei';
import { Vector3, MeshStandardMaterial, Group, Mesh } from 'three';

// --- TYPES & CONSTANTS ---

export type Axis = 'x' | 'y' | 'z';

export interface CubieData {
  id: number;
  position: [number, number, number]; 
  rotation: [number, number, number];
  initialPosition: [number, number, number]; 
}

export interface Move {
  axis: Axis;
  slice: number; // -1, 0, 1
  direction: 1 | -1; // 1 = 90deg (CCW), -1 = -90deg (CW)
}

export const CUBE_GAP = 0.02;
export const CUBE_SIZE = 1;

export const COLORS = {
  base: '#111111', // Black plastic
  right: '#b90000', // Red
  left: '#ff5900', // Orange
  top: '#ffffff', // White
  bottom: '#ffd500', // Yellow
  front: '#009b48', // Green
  back: '#0045ad', // Blue
};

export const getMoveFromNotation = (notation: string): Move => {
  const isPrime = notation.includes("'");
  const base = notation.replace("'", "");
  
  let move: Move = { axis: 'x', slice: 0, direction: 1 };

  switch (base) {
    case 'R': move = { axis: 'x', slice: 1, direction: -1 }; break;
    case 'L': move = { axis: 'x', slice: -1, direction: 1 }; break;
    case 'U': move = { axis: 'y', slice: 1, direction: -1 }; break;
    case 'D': move = { axis: 'y', slice: -1, direction: 1 }; break;
    case 'F': move = { axis: 'z', slice: 1, direction: -1 }; break;
    case 'B': move = { axis: 'z', slice: -1, direction: 1 }; break;
  }

  if (isPrime) {
    move.direction *= -1;
  }
  
  move.direction = move.direction as 1 | -1;
  return move;
};

// --- COMPONENT: CUBIE ---

interface CubieProps {
  position: [number, number, number];
  rotation: [number, number, number];
  initialPosition: [number, number, number];
}

const STICKER_SIZE = 0.88;
const OFFSET = CUBE_SIZE / 2;

const Sticker = ({ color, position, rotation }: { color: string, position: [number,number,number], rotation: [number,number,number] }) => (
  <mesh position={position} rotation={rotation}>
    <planeGeometry args={[STICKER_SIZE, STICKER_SIZE]} />
    <meshStandardMaterial 
      color={color} 
      roughness={0.2} 
      metalness={0.0}
      polygonOffset
      polygonOffsetFactor={-1} 
    />
  </mesh>
);

const Cubie = forwardRef<Mesh, CubieProps>(({ position, rotation, initialPosition }, ref) => {
  const [ix, iy, iz] = initialPosition;
  const baseMaterial = useMemo(() => 
    new MeshStandardMaterial({ color: COLORS.base, roughness: 0.5, metalness: 0.1 }), 
  []);

  return (
    <RoundedBox
      ref={ref}
      args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} 
      radius={0.08} 
      smoothness={4}
      userData={{ isCubie: true }}
      material={baseMaterial}
      position={position}
      rotation={rotation}
    >
      {ix === 1 && <Sticker color={COLORS.right} position={[OFFSET + 0.01, 0, 0]} rotation={[0, Math.PI / 2, 0]} />}
      {ix === -1 && <Sticker color={COLORS.left} position={[-OFFSET - 0.01, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />}
      {iy === 1 && <Sticker color={COLORS.top} position={[0, OFFSET + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} />}
      {iy === -1 && <Sticker color={COLORS.bottom} position={[0, -OFFSET - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]} />}
      {iz === 1 && <Sticker color={COLORS.front} position={[0, 0, OFFSET + 0.01]} rotation={[0, 0, 0]} />}
      {iz === -1 && <Sticker color={COLORS.back} position={[0, 0, -OFFSET - 0.01]} rotation={[0, Math.PI, 0]} />}
    </RoundedBox>
  );
});

Cubie.displayName = 'Cubie';

// --- COMPONENT: RUBIKS CUBE ---

export interface RubiksCubeRef {
  addMove: (move: Move, speedMultiplier?: number) => void;
  addMoves: (moves: Move[], speedMultiplier?: number) => void;
}

interface RubiksCubeProps {
  onMoveComplete: (move: Move) => void;
}

const RubiksCube = forwardRef<RubiksCubeRef, RubiksCubeProps>(({ onMoveComplete }, ref) => {
  const { scene } = useThree();
  const [cubies, setCubies] = useState<CubieData[]>([]);
  const cubieRefs = useRef<(Mesh | null)[]>([]);
  
  const isAnimating = useRef(false);
  const moveQueue = useRef<{ move: Move, speed: number }[]>([]);
  const currentMove = useRef<{ move: Move, speed: number } | null>(null);
  const currentAngle = useRef(0);
  const pivotRef = useRef<Group>(null);
  const activeCubieIndices = useRef<number[]>([]);

  const orbitRef = useRef<any>(null);
  const dragStart = useRef<{ x: number, y: number } | null>(null);
  const intersectedFaceNormal = useRef<Vector3 | null>(null);
  const intersectedCubieIndex = useRef<number>(-1);

  useImperativeHandle(ref, () => ({
    addMove: (move: Move, speedMultiplier = 1) => {
      moveQueue.current.push({ move, speed: speedMultiplier });
    },
    addMoves: (moves: Move[], speedMultiplier = 1) => {
      moves.forEach(move => moveQueue.current.push({ move, speed: speedMultiplier }));
    }
  }));

  useEffect(() => {
    const initialCubies: CubieData[] = [];
    let id = 0;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          initialCubies.push({
            id: id++,
            position: [x * (1 + CUBE_GAP), y * (1 + CUBE_GAP), z * (1 + CUBE_GAP)],
            rotation: [0, 0, 0],
            initialPosition: [x, y, z]
          });
        }
      }
    }
    setCubies(initialCubies);
  }, []);

  const getCubiesInSlice = (axis: 'x'|'y'|'z', sliceIndex: number): number[] => {
    const indices: number[] = [];
    const epsilon = 0.1;
    cubieRefs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const pos = new Vector3();
      mesh.getWorldPosition(pos);
      let val = 0;
      if (axis === 'x') val = pos.x;
      if (axis === 'y') val = pos.y;
      if (axis === 'z') val = pos.z;
      const normalizedVal = val / (1 + CUBE_GAP);
      if (Math.abs(normalizedVal - sliceIndex) < epsilon) {
        indices.push(index);
      }
    });
    return indices;
  };

  useFrame((state, delta) => {
    if (isAnimating.current && currentMove.current && pivotRef.current) {
      const baseSpeed = 5.0 * delta;
      const speed = baseSpeed * currentMove.current.speed;
      const targetAngle = (Math.PI / 2) * currentMove.current.move.direction;
      let step = targetAngle > 0 ? speed : -speed;
      
      const remaining = targetAngle - currentAngle.current;
      if (Math.abs(remaining) < Math.abs(step)) {
        step = remaining;
      }

      pivotRef.current.rotation[currentMove.current.move.axis] += step;
      currentAngle.current += step;

      if (Math.abs(currentAngle.current) >= Math.PI / 2 - 0.001) {
        finishMove();
      }
    } else {
      if (moveQueue.current.length > 0 && !isAnimating.current) {
        const next = moveQueue.current.shift();
        if (next) startMove(next.move, next.speed);
      }
    }
  });

  const startMove = (move: Move, speed: number) => {
    if (!pivotRef.current) return;
    isAnimating.current = true;
    currentMove.current = { move, speed };
    currentAngle.current = 0;
    
    const indices = getCubiesInSlice(move.axis, move.slice);
    activeCubieIndices.current = indices;

    pivotRef.current.rotation.set(0, 0, 0);
    pivotRef.current.position.set(0, 0, 0);
    pivotRef.current.updateMatrixWorld();

    indices.forEach(idx => {
      const mesh = cubieRefs.current[idx];
      if (mesh && pivotRef.current) {
        pivotRef.current.attach(mesh);
      }
    });
  };

  const finishMove = () => {
    if (!pivotRef.current || !currentMove.current) return;
    const moveObj = currentMove.current.move;

    pivotRef.current.rotation[moveObj.axis] = (Math.PI / 2) * moveObj.direction;
    pivotRef.current.updateMatrixWorld();

    activeCubieIndices.current.forEach(idx => {
      const mesh = cubieRefs.current[idx];
      if (mesh) {
        scene.attach(mesh);
        const pos = mesh.position;
        const rot = mesh.rotation;
        const snap = (val: number, grid: number) => Math.round(val / grid) * grid;
        mesh.position.set(
          snap(pos.x, 1 + CUBE_GAP),
          snap(pos.y, 1 + CUBE_GAP),
          snap(pos.z, 1 + CUBE_GAP)
        );
        mesh.rotation.set(
          Math.round(rot.x / (Math.PI / 2)) * (Math.PI / 2),
          Math.round(rot.y / (Math.PI / 2)) * (Math.PI / 2),
          Math.round(rot.z / (Math.PI / 2)) * (Math.PI / 2)
        );
        mesh.updateMatrixWorld();
      }
    });

    pivotRef.current.rotation.set(0,0,0);
    onMoveComplete(moveObj);
    isAnimating.current = false;
    currentMove.current = null;
    activeCubieIndices.current = [];
  };

  const handlePointerDown = (e: any) => {
    if (isAnimating.current || moveQueue.current.length > 0) return;
    if (e.object.userData.isCubie) {
      e.stopPropagation();
      if (orbitRef.current) orbitRef.current.enabled = false;
      const normal = e.face.normal.clone();
      normal.transformDirection(e.object.matrixWorld).round();
      intersectedFaceNormal.current = normal;
      intersectedCubieIndex.current = cubieRefs.current.indexOf(e.object);
      dragStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = () => {
    if (orbitRef.current) orbitRef.current.enabled = true;
    dragStart.current = null;
    intersectedFaceNormal.current = null;
    intersectedCubieIndex.current = -1;
  };

  const handlePointerMove = (e: any) => {
    if (!dragStart.current || intersectedCubieIndex.current === -1 || !intersectedFaceNormal.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.sqrt(dx*dx + dy*dy) < 15) return;
    triggerMoveFromGesture(dx, dy);
    dragStart.current = null; 
    intersectedFaceNormal.current = null;
    intersectedCubieIndex.current = -1;
    if (orbitRef.current) orbitRef.current.enabled = true;
  };

  const triggerMoveFromGesture = (dx: number, dy: number) => {
    const normal = intersectedFaceNormal.current!;
    const mesh = cubieRefs.current[intersectedCubieIndex.current];
    if (!mesh) return;
    const worldPos = new Vector3();
    mesh.getWorldPosition(worldPos);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const isHorizontal = absDx > absDy;
    let move: Move | null = null;
    
    if (Math.abs(normal.x) > 0.5) { 
      if (isHorizontal) {
        move = { axis: 'y', slice: Math.round(worldPos.y / (1 + CUBE_GAP)), direction: (dx > 0 ? -1 : 1) as 1|-1 }; 
        if (normal.x < 0) move.direction = (move.direction * -1) as 1|-1;
      } else {
        move = { axis: 'z', slice: Math.round(worldPos.z / (1 + CUBE_GAP)), direction: (dy > 0 ? -1 : 1) as 1|-1 };
        if (normal.x < 0) move.direction = (move.direction * -1) as 1|-1;
      }
    } else if (Math.abs(normal.y) > 0.5) {
      if (isHorizontal) {
        move = { axis: 'z', slice: Math.round(worldPos.z / (1 + CUBE_GAP)), direction: (dx > 0 ? -1 : 1) as 1|-1 }; 
         if (normal.y < 0) move.direction = (move.direction * -1) as 1|-1;
      } else {
        move = { axis: 'x', slice: Math.round(worldPos.x / (1 + CUBE_GAP)), direction: (dy > 0 ? -1 : 1) as 1|-1 };
         if (normal.y < 0) move.direction = (move.direction * -1) as 1|-1;
      }
    } else {
      if (isHorizontal) {
        move = { axis: 'y', slice: Math.round(worldPos.y / (1 + CUBE_GAP)), direction: (dx > 0 ? 1 : -1) as 1|-1 };
        if (normal.z < 0) move.direction = (move.direction * -1) as 1|-1;
      } else {
        move = { axis: 'x', slice: Math.round(worldPos.x / (1 + CUBE_GAP)), direction: (dy > 0 ? 1 : -1) as 1|-1 };
        if (normal.z < 0) move.direction = (move.direction * -1) as 1|-1;
      }
    }
    if (move) moveQueue.current.push({ move, speed: 1 });
  };

  return (
    <>
      <OrbitControls 
        ref={orbitRef} 
        enablePan={false} 
        enableDamping 
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={15}
      />
      <group 
        onPointerDown={handlePointerDown} 
        onPointerUp={handlePointerUp} 
        onPointerMove={handlePointerMove}
      >
        {cubies.map((data, i) => (
          <Cubie
            key={data.id}
            ref={(el) => { cubieRefs.current[i] = el; }} 
            position={data.position}
            rotation={data.rotation}
            initialPosition={data.initialPosition}
          />
        ))}
        <group ref={pivotRef} />
      </group>
    </>
  );
});

RubiksCube.displayName = 'RubiksCube';

// --- COMPONENT: APP ---

function App() {
  const cubeRef = useRef<RubiksCubeRef>(null);
  const [history, setHistory] = useState<Move[]>([]);
  const [isBusy, setIsBusy] = useState(false); 
  const isSolving = useRef(false);
  const [solveProgress, setSolveProgress] = useState<{current: number, total: number} | null>(null);

  const handleMoveComplete = useCallback((move: Move) => {
    if (isSolving.current) {
      setSolveProgress(prev => {
        if (!prev) return null;
        return { ...prev, current: prev.current + 1 };
      });
    } else {
      setHistory(prev => [...prev, move]);
    }
  }, []);

  useEffect(() => {
    if (solveProgress && solveProgress.current >= solveProgress.total && solveProgress.total > 0) {
      setIsBusy(false);
      isSolving.current = false;
      setSolveProgress(null);
      setHistory([]); 
    }
  }, [solveProgress]);

  const performNotationMove = (notation: string) => {
    if (isBusy || !cubeRef.current) return;
    const move = getMoveFromNotation(notation);
    cubeRef.current.addMove(move, 1.5); 
  };

  const handleScramble = () => {
    if (isBusy || !cubeRef.current || history.length > 0) return;
    setIsBusy(true);
    setHistory([]);

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

    cubeRef.current.addMoves(moves, 6);
    setTimeout(() => setIsBusy(false), 1500); 
  };

  const handleReset = () => {
    if (isBusy || !cubeRef.current || history.length === 0) return;
    const reverseMoves = [...history].reverse().map(m => ({
      ...m,
      direction: (m.direction * -1) as 1 | -1
    }));
    setIsBusy(true);
    isSolving.current = true;
    setSolveProgress({ current: 0, total: reverseMoves.length });
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
      <Canvas camera={{ position: [5, 4, 6], fov: 45 }} shadows dpr={[1, 2]}>
        <color attach="background" args={['#09090b']} />
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        <Environment preset="studio" />
        <RubiksCube ref={cubeRef} onMoveComplete={handleMoveComplete} />
      </Canvas>

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

      <div className={`absolute bottom-0 left-0 w-full flex flex-col items-center pb-6 md:pb-8 pointer-events-auto bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-20 transition-opacity duration-300 ${isBusy ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
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

        <div className="flex gap-4">
          <button
            onClick={handleScramble}
            disabled={isBusy || history.length > 0} 
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);