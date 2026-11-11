#!/usr/bin/env python3
"""
Derive Happy Birthday from Great Vibes (OFL):
  raster → skeleton centerlines (writing order)
  + true glyph outlines from fontTools for ink fill
Finale reveals font outlines through a shared per-word mask driven by centers.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from scipy import ndimage
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[1]
FONT_PATH = ROOT / "scripts/fonts/GreatVibes-Regular.ttf"
OUT_JS = ROOT / "src/world/finale/strokesData.js"
ART = Path("/opt/cursor/artifacts")
ART.mkdir(parents=True, exist_ok=True)

TEXT = "Happy Birthday"
SIZE = 520  # raster px for skeleton
DESIGN_SIZE = 118.0  # target phrase height in design units


def pathd(pts, close=False):
    if not pts:
        return ""
    return (
        " ".join(f"{'M' if i == 0 else 'L'}{x:.2f},{y:.2f}" for i, (x, y) in enumerate(pts))
        + (" Z" if close else "")
    )


def length(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


def smooth(pts, iters=2):
    out = pts
    for _ in range(iters):
        if len(out) < 3:
            return out
        nxt = [out[0]]
        for i in range(1, len(out) - 1):
            ax, ay = out[i - 1]
            bx, by = out[i]
            cx, cy = out[i + 1]
            nxt.append((0.25 * ax + 0.5 * bx + 0.25 * cx, 0.25 * ay + 0.5 * by + 0.25 * cy))
        nxt.append(out[-1])
        out = nxt
    return out


def resample(pts, step=1.5):
    if len(pts) < 2:
        return pts
    out = [pts[0]]
    carry = 0.0
    for i in range(1, len(pts)):
        ax, ay = pts[i - 1]
        bx, by = pts[i]
        dx, dy = bx - ax, by - ay
        dist = math.hypot(dx, dy)
        if dist < 1e-6:
            continue
        t = (step - carry) / dist
        while t <= 1:
            out.append((ax + dx * t, ay + dy * t))
            t += step / dist
        carry = (carry + dist) % step
    if math.hypot(out[-1][0] - pts[-1][0], out[-1][1] - pts[-1][1]) > 0.25:
        out.append(pts[-1])
    return out


def glyph_word_paths(font_path: Path, text: str, design_scale_target_h: float):
    """Return (parts_by_char with advances), overall bbox in design units, space_x."""
    font = TTFont(str(font_path))
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    upem = font["head"].unitsPerEm
    hmtx = font["hmtx"]
    # First pass: measure height in font units
    # Use ascender/descender
    os2 = font["OS/2"]
    asc = abs(os2.sTypoAscender)
    desc = abs(os2.sTypoDescender)
    font_h = asc + desc
    scale = design_scale_target_h / font_h
    baseline = asc * scale + 8
    x = 0.0
    chars = []
    for ch in text:
        if ch == " ":
            x += upem * 0.28 * scale
            chars.append({"ch": " ", "d": "", "x0": x, "x1": x, "word": None})
            continue
        gname = cmap.get(ord(ch))
        if gname is None:
            continue
        pen = SVGPathPen(glyph_set)
        tpen = TransformPen(pen, Transform(scale, 0, 0, -scale, x, baseline))
        glyph_set[gname].draw(tpen)
        d = pen.getCommands()
        adv = hmtx[gname][0] * scale
        word = 0 if x < 1e9 else 0  # filled later
        chars.append({"ch": ch, "d": d, "x0": x, "x1": x + adv, "gname": gname})
        x += adv
    width = x
    # Word assignment by space
    word = 0
    for c in chars:
        if c["ch"] == " ":
            word = 1
            c["word"] = None
        else:
            c["word"] = word
    return chars, width, design_scale_target_h + 24, scale, baseline


def main():
    # --- Glyph outlines (true typeface) ---
    chars, width, height, gscale, baseline = glyph_word_paths(FONT_PATH, TEXT, DESIGN_SIZE)
    word_outlines = ["", ""]
    for c in chars:
        if c["ch"] == " " or not c["d"]:
            continue
        wi = c["word"]
        word_outlines[wi] = (word_outlines[wi] + " " + c["d"]).strip()

    # Split x for skeleton word assignment (mid space)
    space = next(c for c in chars if c["ch"] == " ")
    # space x is after Happy; find Happy end
    happy_end = max(c["x1"] for c in chars if c["word"] == 0)
    bday_start = min(c["x0"] for c in chars if c["word"] == 1)
    split_d = (happy_end + bday_start) / 2

    # --- Raster + skeleton in same aspect for centerlines ---
    # Map design coords: glyph uses x from 0, y up from baseline with flip.
    # Skeleton raster must share the same transform.
    font_pil = ImageFont.truetype(str(FONT_PATH), SIZE)
    tmp = Image.new("L", (8, 8), 0)
    bb = ImageDraw.Draw(tmp).textbbox((0, 0), TEXT, font=font_pil)
    pad = 80
    W = bb[2] - bb[0] + pad * 2
    H = bb[3] - bb[1] + pad * 2
    raster = Image.new("L", (W, H), 0)
    ImageDraw.Draw(raster).text((pad - bb[0], pad - bb[1]), TEXT, font=font_pil, fill=255)
    raster.save(ART / "greatvibes_raster.png")
    mask = np.array(raster) > 128
    mask = ndimage.binary_closing(mask, iterations=1)
    dist = ndimage.distance_transform_edt(mask)

    # Align raster → design: raster letter bbox → glyph design bbox
    ys, xs = np.where(mask)
    rminx, rmaxx = float(xs.min()), float(xs.max())
    rminy, rmaxy = float(ys.min()), float(ys.max())
    # Glyph design bbox from path numbers
    allx, ally = [], []
    for d in word_outlines:
        for m in re.finditer(r"([-\d.]+)", d.replace(",", " ")):
            pass
    for d in word_outlines:
        nums = re.findall(r"[-+]?\d*\.?\d+", d)
        # SVG paths mix commands and numbers — extract coordinate pairs roughly
        # Better parse with regex for coord pairs after letters
        for m in re.finditer(r"([-+]?\d*\.?\d+)[,\s]+([-+]?\d*\.?\d+)", d):
            allx.append(float(m.group(1)))
            ally.append(float(m.group(2)))
    dminx, dmaxx = min(allx), max(allx)
    dminy, dmaxy = min(ally), max(ally)

    # Affine: raster (rx,ry) → design
    sx = (dmaxx - dminx) / max(1.0, (rmaxx - rminx))
    sy = (dmaxy - dminy) / max(1.0, (rmaxy - rminy))
    # Use uniform scale to preserve proportions
    scl = (sx + sy) / 2

    def rast_to_des(pts):
        # raster y down; design y from glyph is already flipped (y up visually in SVG = smaller y at top)
        # PIL y increases downward; glyph path y increases downward too after Transform(..., -scale, ..., baseline)
        # So both y-down. Map:
        return [
            (
                (x - rminx) * scl + dminx,
                (y - rminy) * scl + dminy,
            )
            for x, y in pts
        ]

    # Skeletonize
    skel = skeletonize(mask)
    N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

    def skel_set(sk):
        ys, xs = np.where(sk)
        return set(zip(ys.tolist(), xs.tolist()))

    def neigh(pts, p):
        y, x = p
        return [(y + dy, x + dx) for dy, dx in N8 if (y + dy, x + dx) in pts]

    def prune_spurs(sk, max_spur=22):
        pts = skel_set(sk)
        changed = True
        while changed:
            changed = False
            deg = {p: len(neigh(pts, p)) for p in pts}
            for e in [p for p, d in deg.items() if d == 1]:
                path = [e]
                prev = None
                cur = e
                while True:
                    ns = [n for n in neigh(pts, cur) if n != prev]
                    if len(ns) != 1:
                        break
                    prev, cur = cur, ns[0]
                    path.append(cur)
                    if len(path) > max_spur:
                        break
                if len(path) <= max_spur and len(neigh(pts, path[-1])) >= 3:
                    for p in path[:-1]:
                        pts.discard(p)
                    changed = True
        out = np.zeros_like(sk)
        for y, x in pts:
            out[y, x] = True
        return out

    skel = prune_spurs(skel)
    Image.fromarray((skel.astype(np.uint8) * 255)).save(ART / "greatvibes_skeleton.png")
    pts = skel_set(skel)
    deg = {p: len(neigh(pts, p)) for p in pts}

    def edge_key(a, b):
        return (a, b) if a < b else (b, a)

    used = set()
    raw = []
    seeds = [p for p, d in deg.items() if d != 2] or [next(iter(pts))]
    for start in seeds:
        for nxt in neigh(pts, start):
            ek = edge_key(start, nxt)
            if ek in used:
                continue
            chain = [start]
            prev, cur = start, nxt
            used.add(ek)
            while True:
                chain.append(cur)
                if cur != start and deg.get(cur, 0) != 2:
                    break
                ns = [n for n in neigh(pts, cur) if n != prev]
                n2 = next((n for n in ns if edge_key(cur, n) not in used), None)
                if n2 is None:
                    break
                used.add(edge_key(cur, n2))
                prev, cur = cur, n2
            if len(chain) >= 5:
                raw.append(chain)

    def to_xy(chain):
        return [(float(x), float(y)) for y, x in chain]

    polylines = [resample(smooth(to_xy(c), 2), 1.7) for c in raw]
    polylines = [p for p in polylines if length(p) >= 14]

    def heading(pts, at_start=True):
        if len(pts) < 2:
            return (1.0, 0.0)
        if at_start:
            a, b = pts[0], pts[min(6, len(pts) - 1)]
        else:
            a, b = pts[max(0, len(pts) - 7)], pts[-1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1
        return (dx / ln, dy / ln)

    def try_merge(a, b, max_gap=18, min_cos=0.2):
        cands = []
        for bpts in (b, list(reversed(b))):
            gap = math.hypot(a[-1][0] - bpts[0][0], a[-1][1] - bpts[0][1])
            ha, hb = heading(a, False), heading(bpts, True)
            cos = ha[0] * hb[0] + ha[1] * hb[1]
            if gap <= max_gap and cos >= min_cos:
                cands.append((cos, -gap, a + bpts[1:]))
        if not cands:
            return None
        cands.sort(reverse=True)
        return cands[0][2]

    merged = polylines
    for _ in range(10):
        merged.sort(key=length, reverse=True)
        out = []
        used_i = [False] * len(merged)
        for i in range(len(merged)):
            if used_i[i]:
                continue
            cur = merged[i]
            used_i[i] = True
            grew = True
            while grew:
                grew = False
                best = None
                best_j = None
                best_sc = (-1.0, -1e9)
                for j in range(len(merged)):
                    if used_i[j]:
                        continue
                    for m in (try_merge(cur, merged[j]), try_merge(merged[j], cur)):
                        if m is None:
                            continue
                        sc = (length(m), -abs(length(m) - length(cur) - length(merged[j])))
                        if sc > best_sc:
                            best_sc, best, best_j = sc, m, j
                if best is not None:
                    cur = best
                    used_i[best_j] = True
                    grew = True
            out.append(cur)
        if len(out) == len(merged):
            merged = out
            break
        merged = out

    def orient(p):
        a, b = p[0], p[-1]
        if (b[0] + b[1] * 0.12) < (a[0] + a[1] * 0.12):
            return list(reversed(p))
        return p

    oriented = [orient(p) for p in merged]
    remaining = sorted(range(len(oriented)), key=lambda i: (oriented[i][0][0], oriented[i][0][1]))
    ordered = []
    cur = remaining.pop(0)
    ordered.append(oriented[cur])
    while remaining:
        ex, ey = ordered[-1][-1]
        best = None
        best_sc = 1e18
        best_rev = False
        for j in remaining:
            ptsj = oriented[j]
            d0 = math.hypot(ptsj[0][0] - ex, ptsj[0][1] - ey)
            d1 = math.hypot(ptsj[-1][0] - ex, ptsj[-1][1] - ey)
            if d0 < best_sc:
                best_sc, best, best_rev = d0, j, False
            if d1 + 2 < best_sc:
                best_sc, best, best_rev = d1, j, True
        leftmost = min(remaining, key=lambda i: oriented[i][0][0])
        if best_sc > 110:
            best, best_rev = leftmost, False
        remaining.remove(best)
        ptsj = oriented[best]
        if best_rev:
            ptsj = list(reversed(ptsj))
        ordered.append(ptsj)

    def is_detail(p):
        L = length(p)
        xs = [q[0] for q in p]
        ys = [q[1] for q in p]
        if L < 26:
            return True
        if L < 55 and (max(xs) - min(xs)) > (max(ys) - min(ys)) * 1.7:
            return True
        return False

    mains = [p for p in ordered if not is_detail(p)]
    details = [p for p in ordered if is_detail(p)]

    def wmax_for(pts_img):
        vals = []
        for x, y in pts_img[::3]:
            iy = max(0, min(H - 1, int(round(y))))
            ix = max(0, min(W - 1, int(round(x))))
            vals.append(float(dist[iy, ix]) * scl * 2)
        return max(3.2, min(10.0, max(vals) if vals else 5.0))

    # Per-glyph outlines + meta (non-space chars only)
    glyph_chars = [c for c in chars if c["ch"] != " " and c.get("d")]
    glyph_outlines = [c["d"] for c in glyph_chars]
    glyph_meta = [
        {
            "ch": c["ch"],
            "word": int(c["word"]),
            "x0": round(float(c["x0"]), 2),
            "x1": round(float(c["x1"]), 2),
        }
        for c in glyph_chars
    ]

    def glyph_index_for_x(cx: float) -> int:
        """Nearest glyph by x-range; clamp to phrase ends."""
        best_i, best_d = 0, 1e18
        for i, g in enumerate(glyph_meta):
            if g["x0"] <= cx <= g["x1"]:
                return i
            mid = 0.5 * (g["x0"] + g["x1"])
            d = abs(cx - mid)
            if d < best_d:
                best_d, best_i = d, i
        return best_i

    MIN_LEN = 8.0  # drop tiny skeleton stubs (design units)

    def split_by_glyph(pts_des):
        """Split a polyline into contiguous runs belonging to one glyph each."""
        if not pts_des:
            return []
        runs = []
        cur_gi = glyph_index_for_x(pts_des[0][0])
        buf = [pts_des[0]]
        for q in pts_des[1:]:
            gi = glyph_index_for_x(q[0])
            if gi != cur_gi:
                if len(buf) >= 2:
                    runs.append((cur_gi, buf))
                cur_gi = gi
                buf = [q]
            else:
                buf.append(q)
        if len(buf) >= 2:
            runs.append((cur_gi, buf))
        return runs

    def trim_pts_to_glyph(gi: int, pts):
        """Drop samples outside the glyph advance band — never clamp (clamp makes vertical stubs)."""
        g = glyph_meta[gi]
        lo, hi = g["x0"] - 2.5, g["x1"] + 2.5
        out = [(x, y) for x, y in pts if lo <= x <= hi]
        if len(out) >= 2:
            return out
        # If the whole run sat just outside (script overhang), keep original but nudge into band
        if not pts:
            return pts
        mid = 0.5 * (g["x0"] + g["x1"])
        return [(mid + (x - pts[len(pts) // 2][0]) * 0.15, y) for x, y in pts]

    def make_stroke(gi: int, pts, kind: str, pts_img=None):
        word = glyph_meta[gi]["word"]
        pts = trim_pts_to_glyph(gi, pts)
        if length(pts) < MIN_LEN:
            return None
        wmax = round(wmax_for(pts_img), 2) if pts_img is not None else 5.2
        return {
            "word": word,
            "kind": kind,
            "center": pathd(pts),
            "outline": "",
            "len": round(length(pts), 2),
            "start": [round(pts[0][0], 2), round(pts[0][1], 2)],
            "end": [round(pts[-1][0], 2), round(pts[-1][1], 2)],
            "wmax": wmax,
            "glyph": gi,
        }

    def chains_from_mask(band_mask, max_spur=14):
        """Skeletonize a binary mask → list of image-space polylines (longest first)."""
        if band_mask.sum() < 20:
            return []
        closed = ndimage.binary_closing(band_mask, iterations=1)
        sk = prune_spurs(skeletonize(closed), max_spur=max_spur)
        sk_pts = skel_set(sk)
        if len(sk_pts) < 6:
            return []
        sk_deg = {p: len(neigh(sk_pts, p)) for p in sk_pts}
        seeds_g = [p for p, d in sk_deg.items() if d != 2] or [next(iter(sk_pts))]
        used_g = set()
        chains = []
        for start in seeds_g:
            for nxt in neigh(sk_pts, start):
                ek = edge_key(start, nxt)
                if ek in used_g:
                    continue
                chain = [start]
                prev, cur = start, nxt
                used_g.add(ek)
                while True:
                    chain.append(cur)
                    if cur != start and sk_deg.get(cur, 0) != 2:
                        break
                    ns = [n for n in neigh(sk_pts, cur) if n != prev]
                    n2 = next((n for n in ns if edge_key(cur, n) not in used_g), None)
                    if n2 is None:
                        break
                    used_g.add(edge_key(cur, n2))
                    prev, cur = cur, n2
                if len(chain) >= 5:
                    chains.append(to_xy(chain))
        # Also walk unused pure loops
        for p0 in list(sk_pts):
            for nxt in neigh(sk_pts, p0):
                ek = edge_key(p0, nxt)
                if ek in used_g:
                    continue
                chain = [p0]
                prev, cur = p0, nxt
                used_g.add(ek)
                guard = 0
                while guard < 20000:
                    guard += 1
                    chain.append(cur)
                    ns = [n for n in neigh(sk_pts, cur) if n != prev]
                    n2 = next((n for n in ns if edge_key(cur, n) not in used_g), None)
                    if n2 is None or cur == p0:
                        break
                    used_g.add(edge_key(cur, n2))
                    prev, cur = cur, n2
                if len(chain) >= 5:
                    chains.append(to_xy(chain))
        chains = [resample(smooth(c, 2), 1.5) for c in chains]
        chains = [c for c in chains if length(c) >= 5]
        chains.sort(key=length, reverse=True)
        return chains

    def solo_glyph_mask(gi: int):
        """Raster of a single Great Vibes glyph at its phrase advance — complete letter, no neighbours."""
        # Map glyph index → character index in TEXT
        gcount = -1
        char_i = None
        for i, ch in enumerate(TEXT):
            if ch == " ":
                continue
            gcount += 1
            if gcount == gi:
                char_i = i
                break
        if char_i is None:
            return np.zeros((H, W), dtype=bool)
        origin = (pad - bb[0], pad - bb[1])
        solo = Image.new("L", (W, H), 0)
        x_off = font_pil.getlength(TEXT[:char_i])
        ImageDraw.Draw(solo).text((origin[0] + x_off, origin[1]), TEXT[char_i], font=font_pil, fill=255)
        return np.array(solo) > 128

    def lookslike_detail(pts_img, ch: str) -> bool:
        """i-dots / t-crosses only — everything else merges into the letter stroke or drops."""
        L = length(pts_img)
        xs = [q[0] for q in pts_img]
        ys = [q[1] for q in pts_img]
        span_x = max(xs) - min(xs)
        span_y = max(ys) - min(ys)
        if ch == "i" and L < 40 and span_y < 35 and span_x < 35:
            return True
        if ch == "t" and L < 55 and span_x > span_y * 1.2:
            return True
        return False

    def merge_polylines(a, b):
        """Attach b onto a at the nearer end (for stubs that belong to the same letter)."""
        cands = []
        for bp in (b, list(reversed(b))):
            d0 = math.hypot(a[-1][0] - bp[0][0], a[-1][1] - bp[0][1])
            d1 = math.hypot(a[0][0] - bp[-1][0], a[0][1] - bp[-1][1])
            cands.append((d0, a + bp[1:]))
            cands.append((d1, bp + a[1:]))
        cands.sort(key=lambda t: t[0])
        return cands[0][1] if cands[0][0] < 55 else None

    # --- One complete letter at a time (solo glyph skeleton) ---
    # Global phrase skeleton is only a fallback; it fragments 'a' and leaks stubs into later letters.
    strokes = []
    for gi, g in enumerate(glyph_meta):
        band = solo_glyph_mask(gi)
        # Soft-AND with the phrase ink so we stay inside the composed word silhouette
        band = band & mask
        chains = chains_from_mask(band, max_spur=18)
        if not chains:
            # Fallback: solo without phrase mask (joining may clip small letters)
            chains = chains_from_mask(solo_glyph_mask(gi), max_spur=18)
        ymid = 0.55 * (dminy + dmaxy)
        fallback = [
            (g["x0"] + 1.5, ymid + 6),
            (0.5 * (g["x0"] + g["x1"]), ymid - 5),
            (g["x1"] - 1.5, ymid + 3),
        ]
        if not chains:
            st = make_stroke(gi, fallback, "ink")
            if st:
                strokes.append(st)
            print(f"fallback stroke for glyph {gi} '{g['ch']}'")
            continue

        # Classify: longest chain = letter body; tiny chains = detail or merge/drop
        main = chains[0]
        details_img = []
        for extra in chains[1:]:
            Limg = length(extra)
            # Drop micro stubs under ~8 design-px (≈ 8/scl raster px)
            if Limg * scl < MIN_LEN:
                continue
            if lookslike_detail(extra, g["ch"]):
                details_img.append(extra)
                continue
            # Merge neighbouring stubs into the letter body so they never draw early/alone
            merged = merge_polylines(main, extra)
            if merged is not None:
                main = merged
            # else drop — do not emit as its own ink stroke
        main = orient(main)
        main = resample(smooth(main, 1), 1.35)
        pts = rast_to_des(main)
        st = make_stroke(gi, pts, "ink", main)
        if st:
            strokes.append(st)
            print(f"glyph {gi} '{g['ch']}' ink len={st['len']:.1f} details={len(details_img)}")
        for dchain in details_img:
            dchain = orient(dchain)
            dchain = resample(smooth(dchain, 1), 1.35)
            if length(dchain) * scl < MIN_LEN and length(rast_to_des(dchain)) < MIN_LEN:
                continue
            dpts = rast_to_des(dchain)
            if length(dpts) < MIN_LEN:
                continue
            dst = make_stroke(gi, dpts, "detail", dchain)
            if dst:
                strokes.append(dst)

    # Writing order: finish each letter LTR; dots/crosses only after that word's letters
    ink_strokes = [s for s in strokes if s["kind"] == "ink"]
    detail_strokes = [s for s in strokes if s["kind"] == "detail"]
    ink_strokes.sort(key=lambda s: (s["word"], s.get("glyph", 99)))
    detail_strokes.sort(key=lambda s: (s["word"], s.get("glyph", 99), s["start"][0]))
    ordered = []
    for wi in (0, 1):
        ordered.extend([s for s in ink_strokes if s["word"] == wi])
        ordered.extend([s for s in detail_strokes if s["word"] == wi])
    strokes = ordered

    # Swash under Birthday
    bday = [s for s in strokes if s["word"] == 1 and s["kind"] == "ink"]
    if bday:
        x0 = min(s["start"][0] for s in bday) - 4
        x1 = max(max(s["start"][0], s["end"][0]) for s in bday) + 10
        y = dmaxy + 12
        sw = [(x0 + (x1 - x0) * t, y - math.sin(t * math.pi) * 4.5 - t * 2.5) for t in [i / 47 for i in range(48)]]
        left, right = [], []
        for i, (x, yy) in enumerate(sw):
            a = sw[max(0, i - 1)]
            b = sw[min(len(sw) - 1, i + 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(dx, dy) or 1
            nx, ny = -dy / ln, dx / ln
            tt = i / 47
            half = 1.15 * min(1, min(tt * 8 + 0.2, (1 - tt) * 6 + 0.15))
            left.append((x + nx * half, yy + ny * half))
            right.append((x - nx * half, yy - ny * half))
        strokes.append(
            {
                "word": 1,
                "kind": "swash",
                "center": pathd(sw),
                "outline": pathd(left + list(reversed(right)), True),
                "len": round(length(sw), 2),
                "start": [round(sw[0][0], 2), round(sw[0][1], 2)],
                "end": [round(sw[-1][0], 2), round(sw[-1][1], 2)],
                "wmax": 2.6,
                "glyph": -1,
            }
        )

    allx, ally = list(allx), list(ally)
    for s in strokes:
        for m in re.finditer(r"([-\d.]+),([-\d.]+)", s["center"]):
            allx.append(float(m.group(1)))
            ally.append(float(m.group(2)))
        if s.get("outline"):
            for m in re.finditer(r"([-\d.]+),([-\d.]+)", s["outline"]):
                allx.append(float(m.group(1)))
                ally.append(float(m.group(2)))
    bbox = [
        round(min(allx) - 12, 2),
        round(min(ally) - 14, 2),
        round(max(allx) - min(allx) + 24, 2),
        round(max(ally) - min(ally) + 30, 2),
    ]

    data = {
        "words": ["Happy", "Birthday"],
        "bbox": bbox,
        "wordWidth": [],
        "wordOutlines": word_outlines,
        "glyphOutlines": glyph_outlines,
        "glyphMeta": glyph_meta,
        "strokes": strokes,
        "font": "Great Vibes",
        "license": "OFL-1.1",
        "reveal": "shared-glyph-mask",
    }
    OUT_JS.write_text(f"const STROKES = {json.dumps(data)};\nexport default STROKES;\n")
    print("font Great Vibes | strokes", len(strokes), "glyphs", len(glyph_meta), "bbox", bbox)
    cov = {}
    for s in strokes:
        gi = s.get("glyph", -1)
        if gi >= 0:
            cov[gi] = cov.get(gi, 0) + 1
    for i, g in enumerate(glyph_meta):
        print(f"  glyph {i} '{g['ch']}' strokes={cov.get(i, 0)}")
    for i, s in enumerate(strokes):
        print(f"{i:02d} w{s['word']} g{s.get('glyph', -1)} {s['kind']:6s} {s['len']:7.1f} wmax={s['wmax']}")

    paths = "".join(f'<path d="{d}" fill="#f4c9d1"/>' for d in glyph_outlines if d)
    for s in strokes:
        if s["kind"] == "swash":
            paths += f'<path d="{s["outline"]}" fill="#f4c9d1"/>'
    Path("/tmp/greatvibes-finale.svg").write_text(
        f'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="{bbox[0]} {bbox[1]} {bbox[2]} {bbox[3]}" '
        f'width="1800" height="400" style="background:#1a0a12">{paths}</svg>'
    )
    # Auth still for OCR / review (SVG already written; PNG via optional tools)
    print("wrote", OUT_JS, "and /tmp/greatvibes-finale.svg")


if __name__ == "__main__":
    main()
