import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, Group, Mesh } from 'three';
import { OrbitControls } from '@react-three/drei';
import { Cubie } from './Cubie.tsx';
import { CubieData, Move, CUBE_GAP } from '../types.ts';

export interface RubiksCubeRef {
  addMove: (move: Move, speedMultiplier?: number) => void;
  addMoves: (moves: Move[], speedMultiplier?: number) => void;
}

interface RubiksCubeProps {
  onMoveComplete: (move: Move) => void;
}

export const RubiksCube = forwardRef<RubiksCubeRef, RubiksCubeProps>(({ onMoveComplete }, ref) => {
  const { scene } = useThree();
  const [cubies, setCubies] = useState<CubieData[]>([]);
  const cubieRefs = useRef<(Mesh | null)[]>([]);
  
  // Logic state
  const isAnimating = useRef(false);
  const moveQueue = useRef<{ move: Move, speed: number }[]>([]);
  const currentMove = useRef<{ move: Move, speed: number } | null>(null);
  const currentAngle = useRef(0);
  const pivotRef = useRef<Group>(null);
  const activeCubieIndices = useRef<number[]>([]);

  // Interaction state
  const orbitRef = useRef<any>(null);
  const dragStart = useRef<{ x: number, y: number } | null>(null);
  const intersectedFaceNormal = useRef<Vector3 | null>(null);
  const intersectedCubieIndex = useRef<number>(-1);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    addMove: (move: Move, speedMultiplier = 1) => {
      moveQueue.current.push({ move, speed: speedMultiplier });
    },
    addMoves: (moves: Move[], speedMultiplier = 1) => {
      moves.forEach(move => moveQueue.current.push({ move, speed: speedMultiplier }));
    }
  }));

  // Initialize Cubies
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
      // Base speed is ~5 radians per second. fast moves are much faster.
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
    
    // Notify parent to update history
    onMoveComplete(moveObj);

    isAnimating.current = false;
    currentMove.current = null;
    activeCubieIndices.current = [];
  };

  // --- Interaction Logic ---
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
    
    if (Math.sqrt(dx*dx + dy*dy) < 15) return; // Sensitivity threshold

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
    const dirMult = isHorizontal ? (dx > 0 ? 1 : -1) : (dy > 0 ? 1 : -1);

    // Simplified gesture mapping
    if (Math.abs(normal.x) > 0.5) { // Right/Left Face
      if (isHorizontal) {
        move = { axis: 'y', slice: Math.round(worldPos.y / (1 + CUBE_GAP)), direction: (dx > 0 ? -1 : 1) as 1|-1 }; 
        if (normal.x < 0) move.direction = (move.direction * -1) as 1|-1;
      } else {
        move = { axis: 'z', slice: Math.round(worldPos.z / (1 + CUBE_GAP)), direction: (dy > 0 ? -1 : 1) as 1|-1 };
        if (normal.x < 0) move.direction = (move.direction * -1) as 1|-1;
      }
    } else if (Math.abs(normal.y) > 0.5) { // Top/Bottom Face
      if (isHorizontal) {
        move = { axis: 'z', slice: Math.round(worldPos.z / (1 + CUBE_GAP)), direction: (dx > 0 ? -1 : 1) as 1|-1 }; 
         if (normal.y < 0) move.direction = (move.direction * -1) as 1|-1;
      } else {
        move = { axis: 'x', slice: Math.round(worldPos.x / (1 + CUBE_GAP)), direction: (dy > 0 ? -1 : 1) as 1|-1 };
         if (normal.y < 0) move.direction = (move.direction * -1) as 1|-1;
      }
    } else { // Front/Back Face (Z)
      if (isHorizontal) {
        move = { axis: 'y', slice: Math.round(worldPos.y / (1 + CUBE_GAP)), direction: (dx > 0 ? 1 : -1) as 1|-1 };
        if (normal.z < 0) move.direction = (move.direction * -1) as 1|-1;
      } else {
        move = { axis: 'x', slice: Math.round(worldPos.x / (1 + CUBE_GAP)), direction: (dy > 0 ? 1 : -1) as 1|-1 };
        if (normal.z < 0) move.direction = (move.direction * -1) as 1|-1;
      }
    }

    if (move) {
      // Add to queue via internal ref logic
      moveQueue.current.push({ move, speed: 1 });
    }
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