import { Vector3, Euler } from 'three';

export type Axis = 'x' | 'y' | 'z';

export interface CubieData {
  id: number;
  // We use simple arrays for state storage to avoid serialization issues with Three.js classes in some contexts
  position: [number, number, number]; 
  rotation: [number, number, number];
  // Initial position determines which stickers are applied (x=1 -> Right face sticker, etc)
  initialPosition: [number, number, number]; 
}

export interface Move {
  axis: Axis;
  slice: number; // -1, 0, 1
  direction: 1 | -1; // 1 = 90deg (CCW), -1 = -90deg (CW)
}

export const CUBE_GAP = 0.02;
export const CUBE_SIZE = 1;
export const TOTAL_SIZE = (CUBE_SIZE + CUBE_GAP) * 3;

// Colors matching standard scheme
// Right (x+): Red
// Left (x-): Orange
// Top (y+): White
// Bottom (y-): Yellow
// Front (z+): Green
// Back (z-): Blue
export const COLORS = {
  base: '#111111', // Black plastic
  right: '#b90000', // Red
  left: '#ff5900', // Orange
  top: '#ffffff', // White
  bottom: '#ffd500', // Yellow
  front: '#009b48', // Green
  back: '#0045ad', // Blue
};

// Standard Notation Helper
// Returns the Move object for a given notation string (e.g., "U", "R'")
export const getMoveFromNotation = (notation: string): Move => {
  const isPrime = notation.includes("'");
  const base = notation.replace("'", "");
  
  // Direction 1 is generally CCW around the axis.
  // We map standard notation to our axis/slice/direction.
  // R (Right): x=1. Clockwise (-1)
  // L (Left): x=-1. Clockwise (1)
  // U (Up): y=1. Clockwise (-1)
  // D (Down): y=-1. Clockwise (1)
  // F (Front): z=1. Clockwise (-1)
  // B (Back): z=-1. Clockwise (1)

  let move: Move = { axis: 'x', slice: 0, direction: 1 };

  switch (base) {
    case 'R': move = { axis: 'x', slice: 1, direction: -1 }; break;
    case 'L': move = { axis: 'x', slice: -1, direction: 1 }; break;
    case 'U': move = { axis: 'y', slice: 1, direction: -1 }; break;
    case 'D': move = { axis: 'y', slice: -1, direction: 1 }; break;
    case 'F': move = { axis: 'z', slice: 1, direction: -1 }; break;
    case 'B': move = { axis: 'z', slice: -1, direction: 1 }; break;
    case 'M': move = { axis: 'x', slice: 0, direction: 1 }; break; // Like L
    case 'E': move = { axis: 'y', slice: 0, direction: 1 }; break; // Like D
    case 'S': move = { axis: 'z', slice: 0, direction: -1 }; break; // Like F
  }

  if (isPrime) {
    move.direction *= -1;
  }
  
  // Cast direction back to 1 | -1 because multiplication can result in number
  move.direction = move.direction as 1 | -1;

  return move;
};