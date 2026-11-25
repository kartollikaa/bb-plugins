import { maxX, type Direction } from "./pet.ts";

export const HOLD_MS = 480;
export const FLOOR_GAP = 2;
export const PET_HEIGHT = 29;
export const GRIP_Y = 4;
export const maxLift = (height: number) => Math.max(0, height - PET_HEIGHT - FLOOR_GAP);

export interface Point {
  x: number;
  y: number;
}

export function carryPosition(point: Point, direction: Direction, width: number, height: number) {
  const gripX = direction === 1 ? 33 : 15;
  return {
    x: Math.max(0, Math.min(point.x - gripX, maxX(width))),
    lift: Math.max(0, Math.min(height - FLOOR_GAP - PET_HEIGHT + GRIP_Y - point.y, maxLift(height))),
  };
}

export function sniffDistance(petX: number, direction: Direction, point: Point, height: number) {
  const noseX = petX + (direction === 1 ? 45 : 3);
  const distance = (point.x - noseX) * direction;
  const aboveFloor = height - point.y - FLOOR_GAP;
  return distance >= 5 && distance <= 34 && aboveFloor >= 2 && aboveFloor <= 24 ? distance : null;
}
