//! Steam Cloud IPC verilerinin çift yönlü boyut sınırı.

/// Tek kayıt tavanı; başka bir istemciden gelmiş dosyada da uygulanır.
const MAX_CLOUD_BYTES: usize = 1024 * 1024;

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

/// +1 bayt fazlasını okuyarak boyut aşımını belirler; devasa bulut dosyasını
/// belleğe ve ardından webview IPC'ye kopyalamaz.
#[cfg_attr(not(feature = "steamworks"), allow(dead_code))]
pub fn read(reader: impl std::io::Read) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    reader
        .take((MAX_CLOUD_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("bulut okuma hatası: {error}"))?;
    if bytes.len() > MAX_CLOUD_BYTES {
        return Err(format!(
            "bulut verisi sınırı aşıyor: {MAX_CLOUD_BYTES} bayt"
        ));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

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
            read(std::io::Cursor::new(&within_limit)).unwrap().len(),
            MAX_CLOUD_BYTES
        );
        let oversized = vec![3u8; MAX_CLOUD_BYTES + 1024];
        let mut cursor = std::io::Cursor::new(oversized);
        let error = read(&mut cursor).unwrap_err();
        assert!(error.contains("sınırı aşıyor"), "{error}");
        assert_eq!(
            cursor.position(),
            (MAX_CLOUD_BYTES + 1) as u64,
            "okuyucu üst sınıra varınca durmalı"
        );
    }
}
