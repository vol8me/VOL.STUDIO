//! Steam Cloud IPC verilerinin çift yönlü boyut sınırı.

/// Tek kayıt tavanı; başka bir istemciden gelmiş dosyada da uygulanır.
const MAX_CLOUD_BYTES: usize = 1024 * 1024;

#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
pub fn commit(bytes: &[u8], write: impl FnOnce(&[u8]) -> bool) -> Result<bool, String> {
    if write(bytes) {
        Ok(true)
    } else {
        Err("bulut yazımı SDK tarafından reddedildi".into())
    }
}

/// Base64'ü ayrıştırmadan önce kodlanmış boyutu denetler, büyük girdi için
/// hem süzülmüş metin hem de çözülmüş bayt kopyası ayırmaz.
#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
pub fn decode(data_base64: &str) -> Result<Vec<u8>, String> {
    if data_base64
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .count()
        > MAX_CLOUD_BYTES.div_ceil(3) * 4
    {
        return Err(format!(
            "bulut verisi sınırı aşıyor: {MAX_CLOUD_BYTES} bayt"
        ));
    }
    let bytes = crate::b64::decode(data_base64).ok_or_else(|| "bozuk base64 verisi".to_string())?;
    if bytes.len() > MAX_CLOUD_BYTES {
        return Err(format!(
            "bulut verisi çok büyük: {} bayt, sınır {MAX_CLOUD_BYTES}",
            bytes.len()
        ));
    }
    Ok(bytes)
}

/// SDK'nın tek okuması en çok 1 MiB+1 bayt alır. Metadata ile gerçek
/// sonuç uyuşmazsa yarım veya arada değişmiş kayıt IPC'ye çıkmaz.
#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
pub fn read(expected_size: i32, read: impl FnOnce(&mut [u8]) -> i32) -> Result<Vec<u8>, String> {
    if expected_size < 0 {
        return Err("geçersiz bulut dosyası boyutu".into());
    }
    if expected_size as usize > MAX_CLOUD_BYTES {
        return Err(format!(
            "bulut verisi sınırı aşıyor: {MAX_CLOUD_BYTES} bayt"
        ));
    }
    let mut bytes = vec![0; expected_size as usize + 1];
    let count = read(&mut bytes);
    if count < 0 || count as usize > bytes.len() {
        return Err("bulut okuma hatası".into());
    }
    bytes.truncate(count as usize);
    if bytes.len() > MAX_CLOUD_BYTES {
        return Err(format!(
            "bulut verisi sınırı aşıyor: {MAX_CLOUD_BYTES} bayt"
        ));
    }
    if count != expected_size {
        return Err("bulut okuması eksik veya kayıt okuma sırasında değişti".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sdk_write_rejection_never_returns_success() {
        let result = commit(b"save", |_| false);
        assert!(result.is_err());
    }

    #[test]
    fn sdk_write_success_acknowledges_only_delivered_bytes() {
        assert_eq!(commit(b"save", |bytes| bytes == b"save"), Ok(true));
    }

    #[test]
    fn ipc_buyuk_base64_verisini_cozmeden_reddeder() {
        let oversized = "A".repeat(MAX_CLOUD_BYTES.div_ceil(3) * 4 + 4);
        let error = decode(&oversized).unwrap_err();
        assert!(error.contains("sınırı aşıyor"), "{error}");
        assert_eq!(
            decode(" YW Jj\n").unwrap(),
            b"abc".to_vec(),
            "mevcut whitespace kabulü korunur"
        );
        assert!(decode("bozuk!").is_err());
    }

    #[test]
    fn bulut_okumasi_bir_mib_ustunu_bellege_almadan_reddeder() {
        let within_limit = vec![7u8; MAX_CLOUD_BYTES];
        assert_eq!(
            read(MAX_CLOUD_BYTES as i32, |target| {
                target[..within_limit.len()].copy_from_slice(&within_limit);
                within_limit.len() as i32
            })
            .unwrap()
            .len(),
            MAX_CLOUD_BYTES
        );
        let error = read(MAX_CLOUD_BYTES as i32, |target| target.len() as i32).unwrap_err();
        assert!(error.contains("sınırı aşıyor"), "{error}");
    }

    #[test]
    fn sdk_cloud_read_rejects_short_or_failed_results() {
        for count in [-1, 0, 3, 5] {
            assert!(read(4, |_| count).is_err(), "beklenen 4, okunan {count}");
        }
        assert_eq!(
            read(4, |target| {
                target[..4].copy_from_slice(b"save");
                4
            }),
            Ok(b"save".to_vec())
        );
        assert_eq!(read(0, |_| 0), Ok(Vec::new()));
        assert!(read(0, |_| 1).is_err());
    }

    #[test]
    fn oversized_or_invalid_sdk_size_rejects_before_read() {
        for size in [-1, 1024 * 1024 + 1] {
            let mut called = false;
            let result = read(size, |_| {
                called = true;
                0
            });
            assert!(result.is_err());
            assert!(!called);
        }
    }
}
