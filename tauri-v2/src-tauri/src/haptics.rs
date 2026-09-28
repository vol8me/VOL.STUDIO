//! Linux titreşim sürücüsü: Deck HID raporu ve evdev FF_RUMBLE.
//! Komut kabulü fiziksel his kanıtı değildir; kabul sınırı docs/steam-deck.md'dedir.
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
        bits.get(index)
            .is_some_and(|byte| byte & (1 << (FF_RUMBLE % 8)) != 0)
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

    fn is_deck_device(uevent: &str) -> bool {
        uevent.lines().any(|line| {
            line.strip_prefix("HID_ID=").is_some_and(|id| {
                let mut fields = id.split(':');
                fields.next().is_some()
                    && fields.next() == Some("000028DE")
                    && fields.next() == Some("00001205")
                    && fields.next().is_none()
            })
        })
    }

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
    #[derive(Clone, Default)]
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
                libc::read(
                    file.as_raw_fd(),
                    buf.as_mut_ptr().cast::<libc::c_void>(),
                    buf.len(),
                )
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
            if !is_deck_device(&uevent) {
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
            if unsafe {
                ioctl(
                    fd,
                    eviocgbit(EV_FF as u64, bits.len() as u64),
                    bits.as_mut_ptr(),
                )
            }
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

    /// Deck'in HID yolu önceliklidir; evdev FF_RUMBLE diğer kollara yedektir.
    fn open_backend() -> (Option<Backend>, ScanStats) {
        let mut stats = ScanStats::default();
        if let Some(device) = open_hidraw_device(&mut stats) {
            return (Some(Backend::Hidraw(device)), stats);
        }
        (open_evdev_device(&mut stats).map(Backend::Evdev), stats)
    }

    fn read_bits(fd: i32, ev: u16, bits: &mut [u8]) -> io::Result<()> {
        unsafe {
            ioctl(
                fd,
                eviocgbit(ev as u64, bits.len() as u64),
                bits.as_mut_ptr(),
            )
        }
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

    struct DeviceCache<T> {
        device: Option<T>,
        scan: Option<ScanStats>,
        last_scan_ms: Option<u64>,
        last_error: Option<String>,
        generation: u64,
    }

    impl<T> DeviceCache<T> {
        const fn new() -> Self {
            Self {
                device: None,
                scan: None,
                last_scan_ms: None,
                last_error: None,
                generation: 0,
            }
        }

        fn discover(&mut self, now_ms: u64, mut scan: impl FnMut() -> (Option<T>, ScanStats)) {
            if self.device.is_none()
                && self
                    .last_scan_ms
                    .is_none_or(|last| now_ms.saturating_sub(last) >= 1000)
            {
                let (device, stats) = scan();
                self.device = device;
                self.scan = Some(stats);
                self.last_scan_ms = Some(now_ms);
            }
        }

        fn refresh(
            &mut self,
            now_ms: u64,
            scan: impl FnMut() -> (Option<T>, ScanStats),
            check: impl FnOnce(&T) -> Result<(), String>,
        ) {
            if let Some(device) = self.device.as_ref() {
                if let Err(error) = check(device) {
                    self.device = None;
                    self.last_scan_ms = None;
                    self.last_error = Some(error);
                    self.generation = self.generation.wrapping_add(1);
                }
            }
            self.discover(now_ms, scan);
        }

        fn run<R>(
            &mut self,
            now_ms: u64,
            mut scan: impl FnMut() -> (Option<T>, ScanStats),
            mut action: impl FnMut(&T) -> Result<R, String>,
        ) -> Result<R, String> {
            self.discover(now_ms, &mut scan);
            let Some(device) = self.device.as_ref() else {
                let error = String::from("titreşim aygıtı yok");
                self.last_error = Some(error.clone());
                return Err(error);
            };
            match action(device) {
                Ok(value) => {
                    self.last_error = None;
                    Ok(value)
                }
                Err(first_error) => {
                    self.device = None;
                    self.last_scan_ms = None;
                    self.discover(now_ms, scan);
                    let result = match self.device.as_ref() {
                        Some(device) => action(device),
                        None => Err(first_error),
                    };
                    self.last_error = result.as_ref().err().cloned();
                    if result.is_err() {
                        self.device = None;
                    }
                    result
                }
            }
        }

        fn begin<R>(
            &mut self,
            now_ms: u64,
            scan: impl FnMut() -> (Option<T>, ScanStats),
            action: impl FnMut(&T) -> Result<R, String>,
        ) -> Result<(u64, R), String> {
            self.generation = self.generation.wrapping_add(1);
            self.run(now_ms, scan, action)
                .map(|result| (self.generation, result))
        }

        fn finish(
            &mut self,
            generation: u64,
            now_ms: u64,
            scan: impl FnMut() -> (Option<T>, ScanStats),
            stop: impl FnMut(&T) -> Result<(), String>,
        ) -> Result<(), String> {
            if self.generation == generation {
                self.run(now_ms, scan, stop)
            } else {
                Ok(())
            }
        }
    }

    static DEVICE: Mutex<DeviceCache<Backend>> = Mutex::new(DeviceCache::new());

    fn now_ms() -> u64 {
        static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
        START
            .get_or_init(std::time::Instant::now)
            .elapsed()
            .as_millis() as u64
    }

    /// Parametre değişince etkisi yeniden yükler, sonra başlatır/durdurur.
    fn play_evdev(device: &RumbleDevice, strong: f32, weak: f32, ms: u32) -> Result<(), String> {
        let mut effect = FfEffect {
            kind: FF_RUMBLE,
            id: device.effect_id,
            replay: FfReplay {
                length: ms.min(MAX_RUMBLE_MS) as u16,
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

    fn play_hidraw(device: &HidrawDevice, strong: f32, weak: f32) -> Result<(), String> {
        let left = (strong.clamp(0.0, 1.0) * u16::MAX as f32) as u16;
        let right = (weak.clamp(0.0, 1.0) * u16::MAX as f32) as u16;
        hidraw_send_rumble(device, left, right)
    }

    fn stop(backend: &Backend) -> Result<(), String> {
        match backend {
            Backend::Hidraw(device) => hidraw_send_rumble(device, 0, 0),
            Backend::Evdev(device) => unsafe {
                write_event(device.file.as_raw_fd(), device.effect_id, 0)
            },
        }
    }

    fn check_device(backend: &Backend) -> Result<(), String> {
        let mut info = [0u8; 8];
        let (fd, request) = match backend {
            Backend::Hidraw(device) => (
                device.file.as_raw_fd(),
                ioc(_IOC_READ, b'H' as u64, 0x03, 8),
            ),
            Backend::Evdev(device) => (
                device.file.as_raw_fd(),
                ioc(_IOC_READ, b'E' as u64, 0x01, 4),
            ),
        };
        unsafe { ioctl(fd, request, info.as_mut_ptr()) }
            .map(|_| ())
            .map_err(|error| format!("titreşim aygıtı bağlantısı kesildi: {error}"))
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
            return Err(format!(
                "FF olayı yazılamadı: {}",
                io::Error::last_os_error()
            ));
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
        let mut cache = match DEVICE.lock() {
            Ok(cache) => cache,
            Err(_) => return serde_json::json!({ "backend": "none", "error": "lock" }),
        };
        cache.refresh(now_ms(), open_backend, check_device);
        let result = cache.device.as_ref().map(|b| match b {
            Backend::Hidraw(d) => serde_json::json!({
                "backend": "hidraw",
                "platformSupported": true,
                "device": d.name,
            }),
            Backend::Evdev(d) => serde_json::json!({
                "backend": "evdev",
                "platformSupported": true,
                "device": d.name,
                "statusBits": status_bits(d).len(),
            }),
        });
        let scan = cache.scan.as_ref();
        match result {
            Some(mut value) => {
                value["lastError"] = serde_json::json!(cache.last_error);
                value
            }
            None => serde_json::json!({
                "backend": "none",
                "platformSupported": true,
                "lastError": cache.last_error,
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
        let (generation, ()) = DEVICE
            .lock()
            .map_err(|_| "titreşim kilidi bozuldu")?
            .begin(now_ms(), open_backend, |b| match b {
                Backend::Hidraw(d) => play_hidraw(d, strong, weak),
                Backend::Evdev(d) => play_evdev(d, strong, weak, ms),
            })?;
        // Bekleme kilit dışında kalır: stop ve yeni darbe gecikmeden işlenir.
        std::thread::sleep(std::time::Duration::from_millis(
            ms.min(MAX_RUMBLE_MS) as u64
        ));
        DEVICE
            .lock()
            .map_err(|_| "titreşim kilidi bozuldu")?
            .finish(generation, now_ms(), open_backend, stop)
    }

    pub fn halt() -> Result<(), String> {
        DEVICE
            .lock()
            .map_err(|_| "titreşim kilidi bozuldu")?
            .begin(now_ms(), open_backend, stop)
            .map(|_| ())
    }

    #[cfg(test)]
    mod abi_tests {
        use super::*;

        #[test]
        #[cfg(target_pointer_width = "64")]
        fn ff_effect_linux_abi_ile_eslesir() {
            assert_eq!(std::mem::size_of::<FfEffect>(), 48);
            assert_eq!(std::mem::offset_of!(FfEffect, u), 16);
            assert_eq!(eviocsff(), 0x40304580);
        }

        #[test]
        fn gec_baglanan_aygit_yeniden_kesfedilir() {
            let mut cache = DeviceCache::new();
            cache.discover(0, || (None, ScanStats::default()));
            cache.discover(1000, || (Some(7), ScanStats::default()));
            assert_eq!(cache.device, Some(7));
        }

        #[test]
        fn bozuk_fd_bir_kez_yeniden_acilir() {
            let mut cache = DeviceCache::new();
            cache.discover(0, || (Some(1), ScanStats::default()));
            let result = cache.run(
                5,
                || (Some(2), ScanStats::default()),
                |device| {
                    if *device == 1 {
                        Err("ENODEV".into())
                    } else {
                        Ok(*device)
                    }
                },
            );
            assert_eq!(result, Ok(2));
        }

        #[test]
        fn kalici_hata_sonrasi_bozuk_fd_tutulmaz() {
            let mut cache = DeviceCache::new();
            cache.discover(0, || (Some(1), ScanStats::default()));
            let mut scans = 0;
            let result: Result<(), String> = cache.run(
                5,
                || {
                    scans += 1;
                    (Some(2), ScanStats::default())
                },
                |_| Err("EPIPE".into()),
            );
            assert!(result.is_err());
            assert_eq!(scans, 1);
            assert!(cache.device.is_none());
        }

        #[test]
        fn eski_sure_bitis_yeni_darbeyi_durdurmaz() {
            let mut cache = DeviceCache::new();
            let scan = || (Some(1), ScanStats::default());
            let (old, ()) = cache.begin(0, scan, |_| Ok(())).unwrap();
            cache.begin(5, scan, |_| Ok(())).unwrap();
            let mut stopped = false;
            cache
                .finish(old, 20, scan, |_| {
                    stopped = true;
                    Ok(())
                })
                .unwrap();
            assert!(!stopped);
        }

        #[test]
        fn durum_sorgusu_cikarilmis_aygiti_canli_gostermez() {
            let mut cache = DeviceCache::new();
            cache.discover(0, || (Some(1), ScanStats::default()));
            cache.refresh(5, || (None, ScanStats::default()), |_| Err("ENODEV".into()));
            assert!(cache.device.is_none());
            assert_eq!(cache.last_error.as_deref(), Some("ENODEV"));
        }

        #[test]
        fn aygit_yoklugu_sik_yoklamada_tekrar_taranmaz() {
            let mut cache: DeviceCache<u8> = DeviceCache::new();
            let mut scans = 0;
            for now in [0, 1, 50, 999, 1000] {
                cache.discover(now, || {
                    scans += 1;
                    (None, ScanStats::default())
                });
            }
            assert_eq!(scans, 2);
        }

        #[test]
        fn deck_olmayan_valve_hid_aygiti_secilmez() {
            assert!(is_deck_device(
                "HID_ID=0003:000028DE:00001205\nHID_NAME=Deck\n"
            ));
            assert!(!is_deck_device("HID_ID=0003:000028DE:00001102\n"));
            assert!(!is_deck_device(
                "HID_ID=0003:00000001:00001205\nHID_NAME=:000028DE:\n"
            ));
        }
    }
}

#[cfg(target_os = "linux")]
pub use imp::{halt, rumble, status};

#[cfg(not(target_os = "linux"))]
pub fn status() -> serde_json::Value {
    serde_json::json!({ "backend": "none", "platformSupported": false })
}
#[cfg(not(target_os = "linux"))]
pub fn rumble(_strong: f32, _weak: f32, _ms: u32) -> Result<(), String> {
    Err("platform desteklemiyor".into())
}
#[cfg(not(target_os = "linux"))]
pub fn halt() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn vol_haptics_status() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(status)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn vol_haptics_rumble(strong: f32, weak: f32, duration_ms: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || rumble(strong, weak, duration_ms))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn vol_haptics_stop() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(halt)
        .await
        .map_err(|error| error.to_string())?
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
