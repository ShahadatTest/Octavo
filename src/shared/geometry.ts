export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Joins the per-span rectangles a selection produces into one band per line. Two boxes share a line
 * when their vertical overlap is at least half the shorter one; on a line, boxes that touch or sit
 * within `gap` of each other merge.
 */
export function mergeLineBoxes(boxes: Box[], gap = 4): Box[] {
  const clean = boxes.filter((b) => b.right - b.left > 0.5 && b.bottom - b.top > 0.5).sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: Box[][] = []
  for (const box of clean) {
    const h = box.bottom - box.top
    const line = lines.find((l) => {
      const ref = l[0]
      const overlap = Math.min(ref.bottom, box.bottom) - Math.max(ref.top, box.top)
      return overlap >= 0.5 * Math.min(h, ref.bottom - ref.top)
    })
    if (line) line.push(box)
    else lines.push([box])
  }
  const out: Box[] = []
  for (const line of lines) {
    line.sort((a, b) => a.left - b.left)
    let cur = { ...line[0] }
    for (const b of line.slice(1)) {
      if (b.left <= cur.right + gap) {
        cur.right = Math.max(cur.right, b.right)
        cur.top = Math.min(cur.top, b.top)
        cur.bottom = Math.max(cur.bottom, b.bottom)
      } else {
        out.push(cur)
        cur = { ...b }
      }
    }
    out.push(cur)
  }
  return out.sort((a, b) => a.top - b.top || a.left - b.left)
}
