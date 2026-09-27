//! Linux titreşim sürücüsü — sanal kolun evdev FF_RUMBLE'ı.
//!
//! WebKitGTK 2.52'de `vibrationActuator` yok; Deck'te çalışan yol Steam
//! Input'un sanal kolu (`Microsoft X-Box 360 pad N`, her oturumda hazır)
//! üzerinden çekirdek force-feedback'dir. Ölçüm (2026-09-27, LCD Deck):
//! `event14` düğümü `deck` kullanıcısına yazılabilir ve EV_FF + FF_RUMBLE
//! taşır. Efekt çekirdekte kalır; `replay.length` dolunca kendiliğinden
//! durur — zamanlamayı JS değil sürücü bilir.
//!
//! Üç komut: `vol_haptics_status` (teşhis), `vol_haptics_rumble`,
//! `vol_haptics_stop`. Linux dışında hepsi `none` döner: komut yüzeyi
//! platform bağımsızdır.

#[cfg(target_os = "linux")]
mod imp {
    use std::fs::{self, File, OpenOptions};
    use std::io;
    use std::os::unix::fs::OpenOptionsExt;
    use std::os::unix::io::AsRawFd;
    use std::sync::Mutex;

    const EV_FF: u16 = 0x15;
    const FF_RUMBLE: u16 = 0x50;
    const FF_STATUS: u16 = 0x17;

    #[repr(C)]
    #[derive(Default)]
    struct FfTrigger {
        button: u16,
        interval: u16,
    }
    #[repr(C)]
    #[derive(Default)]
    struct FfReplay {
        length: u16,
        delay: u16,
    }
    #[repr(C)]
    #[derive(Default)]
    struct FfEnvelope {
        attack_length: u16,
        attack_level: u16,
        fade_length: u16,
        fade_level: u16,
    }
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct FfRumble {
        strong: u16,
        weak: u16,
    }
    /*
     * linux/input.h `union u` en geniş varyantıyla 32 bayttır ve işaretçi
     * üyeliği yüzünden 8'e hizalanır; `u64` kolu ikisini de zorlar.
     */
    #[repr(C)]
    union FfData {
        _align: [u64; 4],
        rumble: FfRumble,
    }
    impl Default for FfData {
        fn default() -> Self {
            Self { _align: [0; 4] }
        }
    }
    #[repr(C)]
    #[derive(Default)]
    struct FfEffect {
        kind: u16,
        id: i16,
        direction: u16,
        trigger: FfTrigger,
        replay: FfReplay,
        u: FfData,
        envelope: FfEnvelope,
    }
    #[repr(C)]
    struct InputEvent {
        sec: i64,
        usec: i64,
        kind: u16,
        code: u16,
        value: i32,
    }

    const _IOC_READ: u64 = 2;
    const _IOC_WRITE: u64 = 1;
    const fn ioc(dir: u64, ty: u64, nr: u64, size: u64) -> u64 {
        (dir << 30) | (size << 16) | (ty << 8) | nr
    }
    fn eviocgbit(ev: u64, len: u64) -> u64 {
        ioc(_IOC_READ, b'E' as u64, 0x20 + ev, len)
    }
    fn eviocgname(len: u64) -> u64 {
        ioc(_IOC_READ, b'E' as u64, 0x06, len)
    }
    fn eviocsff() -> u64 {
        ioc(
            _IOC_WRITE,
            b'E' as u64,
            0x80,
            std::mem::size_of::<FfEffect>() as u64,
        )
    }
    fn eviocrmff() -> u64 {
        ioc(_IOC_WRITE, b'E' as u64, 0x81, 4)
    }

    unsafe fn ioctl(fd: i32, req: u64, arg: *mut u8) -> io::Result<i32> {
        let ret = unsafe { libc::ioctl(fd, req as _, arg) };
        if ret < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(ret)
        }
    }

    /// EV_FF yetenek bitset'inde FF_RUMBLE biti duruyor mu.
    pub(crate) fn supports_rumble(bits: &[u8]) -> bool {
        let index = (FF_RUMBLE / 8) as usize;
        bits.get(index).is_some_and(|byte| byte & (1 << (FF_RUMBLE % 8)) != 0)
    }

    /// Aygıt seçimi: FF_RUMBLE taşıyan her düğüm adaydır; Steam Input'un
    /// sanal kolu (`X-Box 360` adlı) fiziksel bir kola tercih edilir.
    pub(crate) fn rumble_score(name: &str) -> u32 {
        if name.contains("X-Box 360") {
            2
        } else {
            1
        }
    }

    /*
     * Deck'in hidraw rapor biçimi (Valve DeviceCore / SDL `hidapi_steamdeck`):
     * 65 baytlık FEATURE raporu — [0]=rapor no, [1]=ID_TRIGGER_RUMBLE_CMD
     * (0xEB), [2]=uzunluk (0), [3..]=MsgSimpleRumbleCmd:
     * unRumbleType u8, unIntensity u16, left u16, right u16, lgain i8, rgain i8.
     * Ölçüm (2026-09-27, LCD Deck): hidraw2 (input2, kontrolcü uç noktası)
     * raporu rc=65 ile kabul etti; input0/input1 EPIPE verdi.
     */
    const ID_TRIGGER_RUMBLE_CMD: u8 = 0xEB;
    const FEATURE_REPORT_BYTES: usize = 65;

    fn hidiocsfeature(len: u64) -> u64 {
        ioc(3, b'H' as u64, 0x06, len)
    }

    /// Valve VID'si — sysfs `HID_ID` alanında `000028DE` olarak görülür.
    const VALVE_VID_TAG: &str = ":000028DE:";

    /// Sürekli rumble üst sınırı — iş parçacığı durdurucu süreyi sınırlar.
    const MAX_RUMBLE_MS: u32 = 1000;

    struct RumbleDevice {
        file: File,
        effect_id: i16,
        name: String,
    }

    struct HidrawDevice {
        file: File,
        name: String,
    }

    enum Backend {
        /// Deck fiziksel kontrolcüsü — hidraw feature raporu (ölçülmüş yol).
        Hidraw(HidrawDevice),
        /// evdev FF_RUMBLE — sanal kolun kabul ettiği ortamlarda (PC'lerde).
        Evdev(RumbleDevice),
    }

    /// Keşif sayaçları — `backend:none` halinde NEDEN bulunamadığını
    /// tanılama dökümüne yazar (açıldı ama FF yok / açılamadı ayrımı).
    #[derive(Default)]
    pub(crate) struct ScanStats {
        pub nodes: u32,
        pub opened: u32,
        pub rumble_capable: u32,
        pub upload_failed: u32,
        pub hidraw_nodes: u32,
        pub hidraw_valve: u32,
    }

    /// SDL'in uç-nokta testi: kontrolcü düğümü (input2) sürekli durum
    /// raporu yayınlar; klavye/fare köprüleri boştur. SDL 16ms'lik zaman
    /// aşımıyla okur — ~4ms'lik yayın periyoduna tek nonblocking okuma
    /// ırak düşer; burada 50ms'ye dek poll edilir.
    fn hidraw_is_controller(file: &File) -> bool {
        let mut buf = [0u8; 64];
        for _ in 0..10 {
            let n = unsafe {
                libc::read(file.as_raw_fd(), buf.as_mut_ptr().cast::<libc::c_void>(), buf.len())
            };
            if n > 0 {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        false
    }

    fn hidraw_send_rumble(device: &HidrawDevice, left: u16, right: u16) -> Result<(), String> {
        let mut report = [0u8; FEATURE_REPORT_BYTES];
        report[1] = ID_TRIGGER_RUMBLE_CMD;
        report[6..8].copy_from_slice(&left.to_le_bytes());
        report[8..10].copy_from_slice(&right.to_le_bytes());
        // nLeftGain=2, nRightGain=0 — SDL'in sistem-seviyesi kalibrasyonu.
        report[10] = 2;
        let rc = unsafe {
            ioctl(
                device.file.as_raw_fd(),
                hidiocsfeature(FEATURE_REPORT_BYTES as u64),
                report.as_mut_ptr(),
            )
        };
        match rc {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("hidraw rumble reddedildi: {e}")),
        }
    }

    /// Deck kontrolcüsünün hidraw düğümünü bulur (28DE:1205, kontrolcü
    /// uç noktası). `hidraw/` altındaki sysfs uevent'i HID_ID taşır.
    fn open_hidraw_device(stats: &mut ScanStats) -> Option<HidrawDevice> {
        for entry in fs::read_dir("/dev").ok()?.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()).map(String::from) else {
                continue;
            };
            if !name.starts_with("hidraw") {
                continue;
            }
            stats.hidraw_nodes += 1;
            let uevent_path = format!("/sys/class/hidraw/{name}/device/uevent");
            let Ok(uevent) = fs::read_to_string(&uevent_path) else {
                continue;
            };
            if !uevent.contains(VALVE_VID_TAG) {
                continue;
            }
            stats.hidraw_valve += 1;
            let Ok(file) = OpenOptions::new()
                .read(true)
                .write(true)
                .custom_flags(libc::O_NONBLOCK)
                .open(&path)
            else {
                continue;
            };
            if hidraw_is_controller(&file) {
                return Some(HidrawDevice { file, name });
            }
        }
        None
    }

    fn open_evdev_device(stats: &mut ScanStats) -> Option<RumbleDevice> {
        let mut best: Option<RumbleDevice> = None;
        let mut best_score = 0u32;
        let entries = match fs::read_dir("/dev/input") {
            Ok(entries) => entries,
            Err(_) => return None,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()).map(String::from) else {
                continue;
            };
            if !name.starts_with("event") {
                continue;
            }
            stats.nodes += 1;
            let Ok(file) = OpenOptions::new().read(true).write(true).open(&path) else {
                continue;
            };
            stats.opened += 1;
            let fd = file.as_raw_fd();
            let mut bits = [0u8; 16];
            if unsafe { ioctl(fd, eviocgbit(EV_FF as u64, bits.len() as u64), bits.as_mut_ptr()) }
                .is_err()
                || !supports_rumble(&bits)
            {
                continue;
            }
            stats.rumble_capable += 1;
            let mut raw_name = [0u8; 128];
            let device_name = unsafe {
                ioctl(fd, eviocgname(raw_name.len() as u64), raw_name.as_mut_ptr())
                    .ok()
                    .map(|_| {
                        let end = raw_name
                            .iter()
                            .position(|b| *b == 0)
                            .unwrap_or(raw_name.len());
                        String::from_utf8_lossy(&raw_name[..end]).into_owned()
                    })
                    .unwrap_or_default()
            };
            let score = rumble_score(&device_name);
            if score <= best_score {
                continue;
            }
            let mut effect = FfEffect {
                kind: FF_RUMBLE,
                id: -1,
                ..Default::default()
            };
            if unsafe { ioctl(fd, eviocsff(), (&mut effect as *mut FfEffect).cast::<u8>()) }
                .is_err()
            {
                stats.upload_failed += 1;
                continue;
            }
            best_score = score;
            best = Some(RumbleDevice {
                file,
                effect_id: effect.id,
                name: device_name,
            });
        }
        best
    }

    /// Sıra ölçümlü gerçekle gider: Deck'te hidraw HID raporu kanıtlı çalışır;
    /// sanal kolun evdev FF'si EVIOCSFF'de EFAULT verir (uinput yüklemesi
    /// yaratıcı tarafından servis edilmiyor). evdev diğer Linux PC'lerde
    /// gerçek FF'li kollar için yedek kalır.
    fn open_backend() -> (Option<Backend>, ScanStats) {
        let mut stats = ScanStats::default();
        if let Some(device) = open_hidraw_device(&mut stats) {
            return (Some(Backend::Hidraw(device)), stats);
        }
        (open_evdev_device(&mut stats).map(Backend::Evdev), stats)
    }

    fn read_bits(fd: i32, ev: u16, bits: &mut [u8]) -> io::Result<()> {
        unsafe { ioctl(fd, eviocgbit(ev as u64, bits.len() as u64), bits.as_mut_ptr()) }
            .map(|_| ())
    }

    /// FF_STATUS bitset'i — tanılama `status` komutunda okunur.
    fn status_bits(device: &RumbleDevice) -> Vec<u8> {
        let mut bits = [0u8; 16];
        match read_bits(device.file.as_raw_fd(), FF_STATUS, &mut bits) {
            Ok(()) => bits.to_vec(),
            Err(_) => Vec::new(),
        }
    }

    static DEVICE: Mutex<Option<(Option<Backend>, ScanStats)>> = Mutex::new(None);

    /// Aygıtı bir kez çözer ve önbelleğe alır; `None` uygun düğüm yok demektir.
    fn with_device<R>(f: impl FnOnce(&Backend) -> R) -> Option<R> {
        let mut guard = DEVICE.lock().ok()?;
        if guard.is_none() {
            *guard = Some(open_backend());
        }
        guard.as_ref()?.0.as_ref().map(f)
    }

    fn last_scan() -> Option<ScanStats> {
        DEVICE
            .lock()
            .ok()
            .and_then(|g| {
                g.as_ref().map(|(_, s)| ScanStats {
                    nodes: s.nodes,
                    opened: s.opened,
                    rumble_capable: s.rumble_capable,
                    upload_failed: s.upload_failed,
                    hidraw_nodes: s.hidraw_nodes,
                    hidraw_valve: s.hidraw_valve,
                })
            })
    }

    /// Parametre değişince etkisi yeniden yükler, sonra başlatır/durdurur.
    fn play_evdev(device: &RumbleDevice, strong: f32, weak: f32, ms: u32) -> Result<(), String> {
        let mut effect = FfEffect {
            kind: FF_RUMBLE,
            id: device.effect_id,
            replay: FfReplay {
                length: ms.min(u16::MAX as u32) as u16,
                delay: 0,
            },
            u: FfData {
                rumble: FfRumble {
                    strong: (strong.clamp(0.0, 1.0) * u16::MAX as f32) as u16,
                    weak: (weak.clamp(0.0, 1.0) * u16::MAX as f32) as u16,
                },
            },
            ..Default::default()
        };
        let fd = device.file.as_raw_fd();
        unsafe {
            ioctl(fd, eviocsff(), (&mut effect as *mut FfEffect).cast::<u8>())
                .map_err(|e| format!("etki yüklenemedi: {e}"))?;
            write_event(fd, device.effect_id, 1)
        }
    }

    /// hidraw basit rumble: rapor "aç" komutudur ve süre taşımaz — süreyi
    /// sürücü tutar; ms kadar bekleyip sıfır raporu gönderir. Tauri komutu
    /// zaten kendi iş parçacığında koşar; bekleyiş ≤ MAX_RUMBLE_MS'dir.
    fn play_hidraw(device: &HidrawDevice, strong: f32, weak: f32, ms: u32) -> Result<(), String> {
        let left = (strong.clamp(0.0, 1.0) * u16::MAX as f32) as u16;
        let right = (weak.clamp(0.0, 1.0) * u16::MAX as f32) as u16;
        hidraw_send_rumble(device, left, right)?;
        let hold = ms.min(MAX_RUMBLE_MS);
        if hold > 0 {
            std::thread::sleep(std::time::Duration::from_millis(hold as u64));
        }
        hidraw_send_rumble(device, 0, 0)
    }

    fn stop(backend: &Backend) -> Result<(), String> {
        match backend {
            Backend::Hidraw(device) => hidraw_send_rumble(device, 0, 0),
            Backend::Evdev(device) => unsafe {
                write_event(device.file.as_raw_fd(), device.effect_id, 0)
            },
        }
    }

    impl Drop for HidrawDevice {
        fn drop(&mut self) {
            let _ = hidraw_send_rumble(self, 0, 0);
        }
    }

    unsafe fn write_event(fd: i32, code: i16, value: i32) -> Result<(), String> {
        let event = InputEvent {
            sec: 0,
            usec: 0,
            kind: EV_FF,
            code: code as u16,
            value,
        };
        let written = unsafe {
            libc::write(
                fd,
                (&event as *const InputEvent).cast::<libc::c_void>(),
                std::mem::size_of::<InputEvent>(),
            )
        };
        if written < 0 {
            return Err(format!("FF olayı yazılamadı: {}", io::Error::last_os_error()));
        }
        Ok(())
    }

    impl Drop for RumbleDevice {
        fn drop(&mut self) {
            unsafe {
                let mut id = self.effect_id as i32;
                let _ = ioctl(
                    self.file.as_raw_fd(),
                    eviocrmff(),
                    (&mut id as *mut i32).cast::<u8>(),
                );
            }
        }
    }

    pub fn status() -> serde_json::Value {
        let result = with_device(|b| match b {
            Backend::Hidraw(d) => serde_json::json!({
                "backend": "hidraw",
                "device": d.name,
            }),
            Backend::Evdev(d) => serde_json::json!({
                "backend": "evdev",
                "device": d.name,
                "statusBits": status_bits(d).len(),
            }),
        });
        let scan = last_scan();
        match result {
            Some(value) => value,
            None => serde_json::json!({
                "backend": "none",
                "scan": scan.map(|s| serde_json::json!({
                    "nodes": s.nodes,
                    "opened": s.opened,
                    "rumbleCapable": s.rumble_capable,
                    "uploadFailed": s.upload_failed,
                    "hidrawNodes": s.hidraw_nodes,
                    "hidrawValve": s.hidraw_valve,
                })),
            }),
        }
    }

    pub fn rumble(strong: f32, weak: f32, ms: u32) -> Result<(), String> {
        with_device(|b| match b {
            Backend::Hidraw(d) => play_hidraw(d, strong, weak, ms),
            Backend::Evdev(d) => play_evdev(d, strong, weak, ms),
        })
        .ok_or_else(|| String::from("titreşim aygıtı yok"))?
    }

    pub fn halt() {
        let _ = with_device(stop);
    }
}

#[cfg(target_os = "linux")]
pub use imp::{halt, rumble, status};

#[cfg(not(target_os = "linux"))]
pub fn status() -> serde_json::Value {
    serde_json::json!({ "backend": "none" })
}
#[cfg(not(target_os = "linux"))]
pub fn rumble(_strong: f32, _weak: f32, _ms: u32) -> Result<(), String> {
    Err("platform desteklemiyor".into())
}
#[cfg(not(target_os = "linux"))]
pub fn halt() {}

#[tauri::command]
pub fn vol_haptics_status() -> serde_json::Value {
    status()
}

#[tauri::command]
pub fn vol_haptics_rumble(strong: f32, weak: f32, duration_ms: u32) -> Result<(), String> {
    rumble(strong, weak, duration_ms)
}

#[tauri::command]
pub fn vol_haptics_stop() {
    halt();
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::imp::*;

    #[test]
    fn rumble_bit_dogrulanir() {
        let mut bits = [0u8; 16];
        assert!(!supports_rumble(&bits));
        // FF_RUMBLE = 0x50 → bayt 10, bit 0.
        bits[10] = 0x01;
        assert!(supports_rumble(&bits));
    }

    #[test]
    fn sanal_kol_onceliklidir() {
        assert!(rumble_score("Microsoft X-Box 360 pad 0") > rumble_score("Generic gamepad"));
        assert_eq!(rumble_score("Generic gamepad"), 1);
    }
}
