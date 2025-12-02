import React, { useMemo, forwardRef } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import { RoundedBox } from '@react-three/drei';
import { CUBE_SIZE, COLORS } from '../types.ts';

interface CubieProps {
  position: [number, number, number];
  rotation: [number, number, number];
  initialPosition: [number, number, number]; // [x, y, z] -1, 0, 1
}

const STICKER_SIZE = 0.88;
const OFFSET = CUBE_SIZE / 2; // 0.5

// Sticker is now a simple mesh that will be a child of the Cubie mesh
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

export const Cubie = forwardRef<Mesh, CubieProps>(({ position, rotation, initialPosition }, ref) => {
  
  const [ix, iy, iz] = initialPosition;

  // Material for the black plastic body
  const baseMaterial = useMemo(() => 
    new MeshStandardMaterial({ color: COLORS.base, roughness: 0.5, metalness: 0.1 }), 
  []);

  // CRITICAL FIX: We use RoundedBox as the root mesh and place Stickers INSIDE it.
  // This ensures that when RubiksCube attaches the 'ref' (this mesh) to the pivot, 
  // the stickers move along with it.
  return (
    <RoundedBox
      ref={ref}
      args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} 
      radius={0.08} 
      smoothness={4}
      userData={{ isCubie: true }} // Important for raycasting
      material={baseMaterial}
      position={position}
      rotation={rotation}
    >
      {/* Stickers - Positioned relative to the cube center */}
      
      {/* Right (x=1) - Red */}
      {ix === 1 && <Sticker color={COLORS.right} position={[OFFSET + 0.01, 0, 0]} rotation={[0, Math.PI / 2, 0]} />}
      
      {/* Left (x=-1) - Orange */}
      {ix === -1 && <Sticker color={COLORS.left} position={[-OFFSET - 0.01, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />}
      
      {/* Top (y=1) - White */}
      {iy === 1 && <Sticker color={COLORS.top} position={[0, OFFSET + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} />}
      
      {/* Bottom (y=-1) - Yellow */}
      {iy === -1 && <Sticker color={COLORS.bottom} position={[0, -OFFSET - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]} />}
      
      {/* Front (z=1) - Green */}
      {iz === 1 && <Sticker color={COLORS.front} position={[0, 0, OFFSET + 0.01]} rotation={[0, 0, 0]} />}
      
      {/* Back (z=-1) - Blue */}
      {iz === -1 && <Sticker color={COLORS.back} position={[0, 0, -OFFSET - 0.01]} rotation={[0, Math.PI, 0]} />}
      
    </RoundedBox>
  );
});

Cubie.displayName = 'Cubie';