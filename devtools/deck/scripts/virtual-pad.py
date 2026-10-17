#!/usr/bin/env python3
"""Sanal Xbox 360 kolu (uinput). Kullanim: vpad.py <adim>... ; adim = bekleme(sn) ya da dugme[:sure]
Dugmeler: A B X Y LB RB SELECT START UP DOWN LEFT RIGHT; eksenler: RT LT LS_UP LS_DOWN LS_LEFT LS_RIGHT;
birlikte basili tutma: RT+LS_RIGHT:60. Ornek: PAD_WARMUP=8 vpad.py DOWN A:1.5 RB"""
import ctypes, fcntl, os, struct, sys, time

EV_SYN, EV_KEY, EV_ABS = 0, 1, 3
BTN = {'A': 0x130, 'B': 0x131, 'X': 0x133, 'Y': 0x134, 'LB': 0x136, 'RB': 0x137,
       'SELECT': 0x13a, 'START': 0x13b}
ABS_HAT0X, ABS_HAT0Y = 0x10, 0x11
HAT = {'UP': (ABS_HAT0Y, -1), 'DOWN': (ABS_HAT0Y, 1), 'LEFT': (ABS_HAT0X, -1), 'RIGHT': (ABS_HAT0X, 1)}
ABS_AXES = [0x00, 0x01, 0x03, 0x04, 0x02, 0x05, ABS_HAT0X, ABS_HAT0Y]

UI_SET_EVBIT = 0x40045564
UI_SET_KEYBIT = 0x40045565
UI_SET_ABSBIT = 0x40045567
UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502

fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
for ev in (EV_KEY, EV_ABS, EV_SYN):
    fcntl.ioctl(fd, UI_SET_EVBIT, ev)
for code in BTN.values():
    fcntl.ioctl(fd, UI_SET_KEYBIT, code)
for code in ABS_AXES:
    fcntl.ioctl(fd, UI_SET_ABSBIT, code)

name = b'Microsoft X-Box 360 pad'.ljust(80, b'\0')
absmax = [0] * 64
absmin = [0] * 64
for code in (0x00, 0x01, 0x03, 0x04):
    absmax[code], absmin[code] = 32767, -32768
for code in (0x02, 0x05):
    absmax[code], absmin[code] = 255, 0
for code in (ABS_HAT0X, ABS_HAT0Y):
    absmax[code], absmin[code] = 1, -1
dev = name + struct.pack('<HHHHI', 3, 0x045e, 0x028e, 0x0110, 0)
dev += struct.pack('<64i', *absmax) + struct.pack('<64i', *absmin) + struct.pack('<64i', *([0] * 64)) + struct.pack('<64i', *([0] * 64))
os.write(fd, dev)
fcntl.ioctl(fd, UI_DEV_CREATE)


def emit(etype, code, value):
    os.write(fd, struct.pack('<qqHHi', 0, 0, etype, code, value))


def sync():
    emit(EV_SYN, 0, 0)


AXES = {'RT': (0x05, 255), 'LT': (0x02, 255), 'LS_RIGHT': (0x00, 32767), 'LS_LEFT': (0x00, -32768),
        'LS_UP': (0x01, -32768), 'LS_DOWN': (0x01, 32767)}


def press(name, hold=0.12):
    if '+' in name:  # birlikte basılı tutulan düğme/eksen: RT+LS_RIGHT:60
        parts = name.split('+')
        for part in parts:
            set_state(part, True)
        time.sleep(hold)
        for part in parts:
            set_state(part, False)
        time.sleep(0.25)
        return
    if name in AXES:
        set_state(name, True); time.sleep(hold); set_state(name, False); time.sleep(0.25)
        return
    if name in BTN:
        emit(EV_KEY, BTN[name], 1); sync(); time.sleep(hold)
        emit(EV_KEY, BTN[name], 0); sync()
    else:
        axis, value = HAT[name]
        emit(EV_ABS, axis, value); sync(); time.sleep(hold)
        emit(EV_ABS, axis, 0); sync()
    time.sleep(0.25)


def set_state(name, on):
    if name in BTN:
        emit(EV_KEY, BTN[name], 1 if on else 0)
    elif name in AXES:
        axis, value = AXES[name]
        emit(EV_ABS, axis, value if on else 0)
    else:
        axis, value = HAT[name]
        emit(EV_ABS, axis, value if on else 0)
    sync()


time.sleep(float(os.environ.get("PAD_WARMUP", "2.5")))
for step in sys.argv[1:]:
    if step.replace('.', '', 1).isdigit():
        time.sleep(float(step))
        continue
    button, _, hold = step.partition(':')
    press(button.upper(), float(hold) if hold else 0.12)
time.sleep(0.5)
fcntl.ioctl(fd, UI_DEV_DESTROY)
os.close(fd)
