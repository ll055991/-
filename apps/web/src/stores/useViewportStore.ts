import { create } from "zustand";

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 2.0;

interface ViewportState {
  offsetX: number;
  offsetY: number;
  scale: number;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (nextScale: number, anchorX: number, anchorY: number) => void;
  resetView: () => void;
}

// 视口状态独立存放，避免画布平移/缩放时触发评论卡片列表订阅重渲染
export const useViewportStore = create<ViewportState>((set) => ({
  offsetX: 0,
  offsetY: 0,
  scale: 1,

  panBy(dx, dy) {
    set((s) => ({ offsetX: s.offsetX + dx, offsetY: s.offsetY + dy }));
  },

  // 以鼠标锚点缩放：保持锚点对应的世界坐标在缩放前后屏幕位置不变
  zoomAt(rawScale, anchorX, anchorY) {
    set((s) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale));
      if (nextScale === s.scale) return s;
      const worldX = (anchorX - s.offsetX) / s.scale;
      const worldY = (anchorY - s.offsetY) / s.scale;
      return {
        scale: nextScale,
        offsetX: anchorX - worldX * nextScale,
        offsetY: anchorY - worldY * nextScale,
      };
    });
  },

  resetView() {
    set({ offsetX: 0, offsetY: 0, scale: 1 });
  },
}));

// 屏幕相对画布容器的坐标 → 逻辑世界坐标
export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: { offsetX: number; offsetY: number; scale: number },
) {
  return {
    x: Math.round(((screenX - viewport.offsetX) / viewport.scale) * 10) / 10,
    y: Math.round(((screenY - viewport.offsetY) / viewport.scale) * 10) / 10,
  };
}
