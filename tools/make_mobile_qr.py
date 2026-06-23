from PIL import Image, ImageDraw

import argparse

DEFAULT_URL = "http://192.168.11.2:8001/mobile.html?v=20260623_pwa1"
OUT = "rice_os_mobile_qr.png"
VERSION = 5
SIZE = 21 + 4 * (VERSION - 1)
ECL_BITS = 0b01
DATA_CODEWORDS = 108
EC_CODEWORDS = 26
TOTAL_CODEWORDS = 134

EXP = [0] * 512
LOG = [0] * 256
x = 1
for i in range(255):
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if x & 0x100:
        x ^= 0x11D
for i in range(255, 512):
    EXP[i] = EXP[i - 255]


def gf_mul(a, b):
    if a == 0 or b == 0:
        return 0
    return EXP[LOG[a] + LOG[b]]


def poly_mul(p, q):
    out = [0] * (len(p) + len(q) - 1)
    for i, a in enumerate(p):
        for j, b in enumerate(q):
            out[i + j] ^= gf_mul(a, b)
    return out


def rs_generator(degree):
    gen = [1]
    for i in range(degree):
        gen = poly_mul(gen, [1, EXP[i]])
    return gen


def rs_remainder(data, degree):
    gen = rs_generator(degree)
    res = [0] * degree
    for b in data:
        factor = b ^ res[0]
        res = res[1:] + [0]
        for i in range(degree):
            res[i] ^= gf_mul(gen[i + 1], factor)
    return res


def append_bits(bits, value, length):
    for i in range(length - 1, -1, -1):
        bits.append((value >> i) & 1)


def data_codewords(text):
    payload = text.encode("utf-8")
    bits = []
    append_bits(bits, 0b0100, 4)
    append_bits(bits, len(payload), 8)
    for b in payload:
        append_bits(bits, b, 8)
    capacity_bits = DATA_CODEWORDS * 8
    if len(bits) > capacity_bits:
        max_bytes = (capacity_bits - 12) // 8
        raise ValueError(f"URL is too long for this QR generator. Use {max_bytes} bytes or fewer.")
    append_bits(bits, 0, min(4, capacity_bits - len(bits)))
    while len(bits) % 8:
        bits.append(0)
    codewords = []
    for i in range(0, len(bits), 8):
        v = 0
        for bit in bits[i : i + 8]:
            v = (v << 1) | bit
        codewords.append(v)
    pads = [0xEC, 0x11]
    i = 0
    while len(codewords) < DATA_CODEWORDS:
        codewords.append(pads[i % 2])
        i += 1
    return codewords


def new_matrix():
    return (
        [[False for _ in range(SIZE)] for _ in range(SIZE)],
        [[False for _ in range(SIZE)] for _ in range(SIZE)],
    )


def set_func(m, r, x, y, val):
    if 0 <= x < SIZE and 0 <= y < SIZE:
        m[y][x] = bool(val)
        r[y][x] = True


def draw_finder(m, r, x0, y0):
    for y in range(y0 - 1, y0 + 8):
        for x in range(x0 - 1, x0 + 8):
            if 0 <= x < SIZE and 0 <= y < SIZE:
                dist = max(abs(x - (x0 + 3)), abs(y - (y0 + 3)))
                set_func(m, r, x, y, dist == 3 or dist <= 1)


def draw_alignment(m, r, cx, cy):
    for y in range(cy - 2, cy + 3):
        for x in range(cx - 2, cx + 3):
            dist = max(abs(x - cx), abs(y - cy))
            set_func(m, r, x, y, dist != 1)


def reserve_format(m, r):
    for i in range(9):
        if i != 6:
            set_func(m, r, 8, i, False)
            set_func(m, r, i, 8, False)
    for i in range(8):
        set_func(m, r, SIZE - 1 - i, 8, False)
    for i in range(7):
        set_func(m, r, 8, SIZE - 1 - i, False)


def draw_function_patterns():
    m, r = new_matrix()
    draw_finder(m, r, 0, 0)
    draw_finder(m, r, SIZE - 7, 0)
    draw_finder(m, r, 0, SIZE - 7)
    for i in range(8, SIZE - 8):
        set_func(m, r, 6, i, i % 2 == 0)
        set_func(m, r, i, 6, i % 2 == 0)
    draw_alignment(m, r, SIZE - 7, SIZE - 7)
    set_func(m, r, 8, 4 * VERSION + 9, True)
    reserve_format(m, r)
    return m, r


def mask_bit(mask, x, y):
    if mask == 0:
        return (x + y) % 2 == 0
    if mask == 1:
        return y % 2 == 0
    if mask == 2:
        return x % 3 == 0
    if mask == 3:
        return (x + y) % 3 == 0
    if mask == 4:
        return (y // 2 + x // 3) % 2 == 0
    if mask == 5:
        return ((x * y) % 2 + (x * y) % 3) == 0
    if mask == 6:
        return (((x * y) % 2 + (x * y) % 3) % 2) == 0
    if mask == 7:
        return (((x + y) % 2 + (x * y) % 3) % 2) == 0
    return False


def format_bits(mask):
    data = (ECL_BITS << 3) | mask
    rem = data << 10
    gen = 0x537
    for i in range(14, 9, -1):
        if (rem >> i) & 1:
            rem ^= gen << (i - 10)
    return ((data << 10) | (rem & 0x3FF)) ^ 0x5412


def bit(v, i):
    return ((v >> i) & 1) != 0


def draw_format(m, r, mask):
    bits = format_bits(mask)
    for i in range(6):
        set_func(m, r, 8, i, bit(bits, i))
    set_func(m, r, 8, 7, bit(bits, 6))
    set_func(m, r, 8, 8, bit(bits, 7))
    set_func(m, r, 7, 8, bit(bits, 8))
    for i in range(9, 15):
        set_func(m, r, 14 - i, 8, bit(bits, i))
    for i in range(8):
        set_func(m, r, SIZE - 1 - i, 8, bit(bits, i))
    for i in range(8, 15):
        set_func(m, r, 8, SIZE - 15 + i, bit(bits, i))
    set_func(m, r, 8, SIZE - 8, True)


def place_data(base, reserved, codewords, mask):
    m = [row[:] for row in base]
    bits = []
    for cw in codewords:
        append_bits(bits, cw, 8)
    idx = 0
    x = SIZE - 1
    upward = True
    while x > 0:
        if x == 6:
            x -= 1
        ys = range(SIZE - 1, -1, -1) if upward else range(SIZE)
        for y in ys:
            for xx in (x, x - 1):
                if not reserved[y][xx]:
                    val = bits[idx] if idx < len(bits) else 0
                    if mask_bit(mask, xx, y):
                        val ^= 1
                    m[y][xx] = bool(val)
                    idx += 1
        upward = not upward
        x -= 2
    return m


def penalty(m):
    score = 0
    for y in range(SIZE):
        run_color = m[y][0]
        run = 1
        for x in range(1, SIZE):
            if m[y][x] == run_color:
                run += 1
            else:
                if run >= 5:
                    score += 3 + (run - 5)
                run_color = m[y][x]
                run = 1
        if run >= 5:
            score += 3 + (run - 5)
    for x in range(SIZE):
        run_color = m[0][x]
        run = 1
        for y in range(1, SIZE):
            if m[y][x] == run_color:
                run += 1
            else:
                if run >= 5:
                    score += 3 + (run - 5)
                run_color = m[y][x]
                run = 1
        if run >= 5:
            score += 3 + (run - 5)
    for y in range(SIZE - 1):
        for x in range(SIZE - 1):
            c = m[y][x]
            if m[y][x + 1] == c and m[y + 1][x] == c and m[y + 1][x + 1] == c:
                score += 3
    pattern = [True, False, True, True, True, False, True, False, False, False, False]
    rev = list(reversed(pattern))
    for y in range(SIZE):
        row = m[y]
        for x in range(SIZE - 10):
            if row[x : x + 11] == pattern or row[x : x + 11] == rev:
                score += 40
    for x in range(SIZE):
        col = [m[y][x] for y in range(SIZE)]
        for y in range(SIZE - 10):
            if col[y : y + 11] == pattern or col[y : y + 11] == rev:
                score += 40
    dark = sum(1 for row in m for c in row if c)
    score += int(abs(dark * 100 / (SIZE * SIZE) - 50) // 5) * 10
    return score


def make_qr(url):
    data = data_codewords(url)
    ecc = rs_remainder(data, EC_CODEWORDS)
    codewords = data + ecc
    assert len(codewords) == TOTAL_CODEWORDS
    base, reserved = draw_function_patterns()
    best = None
    for mask in range(8):
        m = place_data(base, reserved, codewords, mask)
        draw_format(m, reserved, mask)
        p = penalty(m)
        if best is None or p < best[0]:
            best = (p, mask, m)
    return best


def save_png(matrix, out):
    scale = 12
    border = 4
    img_size = (SIZE + border * 2) * scale
    img = Image.new("RGB", (img_size, img_size), "white")
    draw = ImageDraw.Draw(img)
    for y in range(SIZE):
        for x in range(SIZE):
            if matrix[y][x]:
                x0 = (x + border) * scale
                y0 = (y + border) * scale
                draw.rectangle([x0, y0, x0 + scale - 1, y0 + scale - 1], fill="black")
    img.save(out)
    return img_size


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate the Rice OS mobile QR code.")
    parser.add_argument("url", nargs="?", default=DEFAULT_URL, help="URL to encode. Use the GitHub Pages URL after publishing.")
    parser.add_argument("-o", "--out", default=OUT, help="Output PNG path.")
    args = parser.parse_args()

    _, mask, matrix = make_qr(args.url)
    size = save_png(matrix, args.out)
    print(args.out)
    print(args.url)
    print(f"mask {mask} size {size}")

