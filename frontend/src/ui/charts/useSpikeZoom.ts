import React, { useCallback, useRef, useState } from 'react';

export function useSpikeZoom() {
  const [zoomRange, setZoomRange] = useState<[number, number]>([0, 100]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'from' | 'to' | 'select' | null>(null);
  const [selectAnchor, setSelectAnchor] = useState<number | null>(null);

  const startDrag = useCallback((handle: 'from' | 'to') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const pctFromEvent = (e: React.PointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
  };

  const startTrackSelect = useCallback((e: React.PointerEvent) => {
    if (!trackRef.current) return;
    e.preventDefault();
    const pct = pctFromEvent(e);
    setSelectAnchor(pct);
    setZoomRange([pct, pct]);
    setDragging('select');
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const onTrackPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !trackRef.current) return;
    const pct = pctFromEvent(e);
    if (dragging === 'from') {
      setZoomRange([Math.min(pct, zoomRange[1] - 2), zoomRange[1]]);
    } else if (dragging === 'to') {
      setZoomRange([zoomRange[0], Math.max(pct, zoomRange[0] + 2)]);
    } else if (dragging === 'select' && selectAnchor !== null) {
      setZoomRange([Math.min(pct, selectAnchor), Math.max(pct, selectAnchor)]);
    }
  }, [dragging, zoomRange, selectAnchor]);

  const endDrag = useCallback(() => {
    setDragging(null);
    setSelectAnchor(null);
  }, []);

  return { zoomRange, trackRef, startDrag, startTrackSelect, onTrackPointerMove, endDrag };
}
