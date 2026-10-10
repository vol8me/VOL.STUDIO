#!/usr/bin/env python3
"""Sanal klavye (uinput). Kullanim: virtual-keys.py <adim>... ; adim = bekleme(sn) ya da tus[:sure]
Tuslar: A-Z 0-9 ENTER ESC TAB SPACE UP DOWN LEFT RIGHT HOME END PAGEUP PAGEDOWN; birlikte basili: SHIFT+B. Ornek: KEYS_WARMUP=4 virtual-keys.py SHIFT+B
Isletim sistemi duzeyinde sanal klavyedir (fiziksel klavye/Steam ekran klavyesi degildir); gamescope odagindaki pencereye
normal klavye olayi olarak ulasir. Deck'te URL yazmadan `Shift+B` kare olcerini baslatmak icin kullanilir."""
import fcntl, os, struct, sys, time

EV_SYN, EV_KEY = 0, 1
UI_SET_EVBIT = 0x40045564
UI_SET_KEYBIT = 0x40045565
UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502

KEYS = {'ESC': 1, 'ENTER': 28, 'TAB': 15, 'SPACE': 57, 'SHIFT': 42,
        'UP': 103, 'DOWN': 108, 'LEFT': 105, 'RIGHT': 106,
        'HOME': 102, 'END': 107, 'PAGEUP': 104, 'PAGEDOWN': 109}
for index, letter in enumerate('QWERTYUIOP'):
    KEYS[letter] = 16 + index
for index, letter in enumerate('ASDFGHJKL'):
    KEYS[letter] = 30 + index
for index, letter in enumerate('ZXCVBNM'):
    KEYS[letter] = 44 + index
for index, digit in enumerate('1234567890'):
    KEYS[digit] = 2 + index

fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
fcntl.ioctl(fd, UI_SET_EVBIT, EV_SYN)
for code in KEYS.values():
    fcntl.ioctl(fd, UI_SET_KEYBIT, code)

name = b'VOL virtual keyboard'.ljust(80, b'\0')
dev = name + struct.pack('<HHHHI', 3, 0x1209, 0x0001, 0x0100, 0)
dev += struct.pack('<64i', *([0] * 64)) * 4
os.write(fd, dev)
fcntl.ioctl(fd, UI_DEV_CREATE)


def emit(code, value):
    os.write(fd, struct.pack('<qqHHi', 0, 0, EV_KEY, code, value))
    os.write(fd, struct.pack('<qqHHi', 0, 0, EV_SYN, 0, 0))


def press(combo, hold):
    codes = [KEYS[part] for part in combo.split('+')]
    for code in codes:
        emit(code, 1)
        time.sleep(0.03)
    time.sleep(hold)
    for code in reversed(codes):
        emit(code, 0)
        time.sleep(0.03)
    time.sleep(0.25)


time.sleep(float(os.environ.get('KEYS_WARMUP', '2.5')))
for step in sys.argv[1:]:
    if step.replace('.', '', 1).isdigit():
        time.sleep(float(step))
        continue
    combo, _, hold = step.partition(':')
    press(combo.upper(), float(hold) if hold else 0.08)
time.sleep(0.5)
fcntl.ioctl(fd, UI_DEV_DESTROY)
os.close(fd)
