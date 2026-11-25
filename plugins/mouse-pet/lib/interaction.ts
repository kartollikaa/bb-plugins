import { maxX, PET_WIDTH, type Direction } from "./pet.ts";

export const HOLD_MS = 480;
export const FLOOR_GAP = 2;
export const PET_HEIGHT = 29;
export const GRIP_X = 33;
export const GRIP_Y = 4;
export const maxLift = (height: number) => Math.max(0, height - PET_HEIGHT - FLOOR_GAP);

export interface Point {
  x: number;
  y: number;
}

export function gripArmPath(near: boolean, angle: number, scale: Point, offset: Point) {
  const radians = angle * Math.PI / 180;
  const shoulderX = ((near ? 34 : 29) - GRIP_X) * scale.x;
  const shoulderY = ((near ? 18 : 16) - GRIP_Y) * scale.y;
  const x = GRIP_X + offset.x + shoulderX * Math.cos(radians) - shoulderY * Math.sin(radians);
  const y = GRIP_Y + offset.y + shoulderX * Math.sin(radians) + shoulderY * Math.cos(radians);
  const pawX = near ? GRIP_X : GRIP_X - 2;
  const pawY = near ? GRIP_Y : GRIP_Y + 1;
  const elbowX = x * .65 + pawX * .35 + (near ? 2.5 : -2);
  const elbowY = y * .56 + pawY * .44;
  return `M${x.toFixed(2)} ${y.toFixed(2)}Q${elbowX.toFixed(2)} ${elbowY.toFixed(2)} ${pawX} ${pawY}`;
}

export function carryPosition(point: Point, direction: Direction, width: number, height: number) {
  const gripX = direction === 1 ? GRIP_X : PET_WIDTH - GRIP_X;
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
