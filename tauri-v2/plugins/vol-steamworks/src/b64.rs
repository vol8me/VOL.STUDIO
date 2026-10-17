#![cfg_attr(not(feature = "steamworks"), allow(dead_code))]
//! Sıfır bağımlılıklı base64 — yalnız bu eklentinin dar kullanımı için
//! (glif PNG'leri ve bulut dosyaları JS'e metin olarak döner). Genel amaçlı
//! değildir; padding'siz URL-güvenli alfabesi KULLANILMAZ, standart
//! `+/` alfabesi ve `=` padding uygulanır.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

fn value_of(byte: u8) -> Option<u32> {
    match byte {
        b'A'..=b'Z' => Some((byte - b'A') as u32),
        b'a'..=b'z' => Some((byte - b'a' + 26) as u32),
        b'0'..=b'9' => Some((byte - b'0' + 52) as u32),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

/// Geçersiz girdi `None` döner — çağıran "bozuk kayıt" kararını verir.
pub fn decode(text: &str) -> Option<Vec<u8>> {
    let bytes: Vec<u8> = text.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if !bytes.len().is_multiple_of(4) || bytes.is_empty() && !text.trim().is_empty() {
        return None;
    }
    let mut out = Vec::with_capacity(bytes.len() / 4 * 3);
    for (i, chunk) in bytes.chunks(4).enumerate() {
        let last = i == bytes.len() / 4 - 1;
        let pad = chunk.iter().filter(|&&b| b == b'=').count();
        if pad > 0 && (!last || pad > 2 || !chunk.ends_with(&b"=="[..pad])) {
            return None;
        }
        let mut n: u32 = 0;
        for &b in chunk.iter() {
            n = (n << 6) | if b == b'=' { 0 } else { value_of(b)? };
        }
        out.push((n >> 16) as u8);
        if pad < 2 {
            out.push((n >> 8) as u8);
        }
        if pad < 1 {
            out.push(n as u8);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        for data in [
            &b""[..],
            b"f",
            b"fo",
            b"foo",
            b"foob",
            b"fooba",
            b"foobar",
            &[0u8, 159, 255, 0, 1, 2, 3, 250][..],
        ] {
            assert_eq!(decode(&encode(data)).as_deref(), Some(data));
        }
    }

    #[test]
    fn bilinen_vektorler() {
        assert_eq!(encode(b"foobar"), "Zm9vYmFy");
        assert_eq!(encode(b"Hello, world!"), "SGVsbG8sIHdvcmxkIQ==");
        assert_eq!(decode("Zm9vYmFy").as_deref(), Some(&b"foobar"[..]));
    }

    #[test]
    fn bozuk_girdi() {
        assert_eq!(decode("!!!"), None);
        assert_eq!(decode("Zm9"), None);
        assert_eq!(decode("=m9v"), None);
        assert_eq!(decode("Zm9vYmFy===="), None);
    }
}
