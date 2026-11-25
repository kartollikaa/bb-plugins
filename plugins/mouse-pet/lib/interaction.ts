import { maxX, PET_WIDTH, type Direction } from "./pet.ts";

export const DRAG_START_PX = 3;
export const LONG_PRESS_MS = 480;
export const FLOOR_GAP = 2;
export const PET_HEIGHT = 29;
export const GRIP_X = 29;
export const GRIP_Y = 9;
export const maxLift = (height: number) => Math.max(0, height - PET_HEIGHT - FLOOR_GAP);

export interface Point {
  x: number;
  y: number;
}

export function screenGripX(direction: Direction) {
  return direction === 1 ? GRIP_X : PET_WIDTH - GRIP_X;
}

export function gripPoint(point: Point, initialOffset: Point, age: number): Point {
  const blend = Math.exp(-Math.max(age, 0) / 29);
  return { x: point.x + initialOffset.x * blend, y: point.y + initialOffset.y * blend };
}

export function scruffPath(angle: number, scale: Point, offset: Point) {
  const radians = angle * Math.PI / 180;
  const neck = (x: number, y: number) => {
    const dx = (x - GRIP_X) * scale.x;
    const dy = (y - GRIP_Y) * scale.y;
    return {
      x: GRIP_X + offset.x + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: GRIP_Y + offset.y + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
  };
  const back = neck(25, 15.7);
  const front = neck(32, 14.6);
  const point = ({ x, y }: Point) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return `M${GRIP_X} ${GRIP_Y}Q${point({ x: back.x + 1, y: GRIP_Y + 2 })} ${point(back)}L${point(front)}Q${point({ x: front.x - 1, y: GRIP_Y + 2 })} ${GRIP_X} ${GRIP_Y}Z`;
}

export function carryPosition(point: Point, direction: Direction, width: number, height: number) {
  const gripX = screenGripX(direction);
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
