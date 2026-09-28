/** Project pointer movement onto the image diagonal, preserving its aspect ratio. */
export function draggedInputPercent(start: number, dx: number, dy: number, width: number, height: number) {
 const delta = (dx * width + dy * height) / (width * width + height * height) * 100;
 return Math.max(10, Math.min(400, Math.round((start + delta) * 10) / 10));
}
