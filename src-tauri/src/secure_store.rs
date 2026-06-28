use keyring::Entry;

const SERVICE: &str = "com.ghostcompiler.ghost-shell";
const ACCOUNT: &str = "vault-session";
const PAYLOAD_LEN: usize = 48; // 32-byte key + 16-byte salt

fn encode(key: &[u8; 32], salt: &[u8; 16]) -> String {
    let mut buf = [0u8; PAYLOAD_LEN];
    buf[..32].copy_from_slice(key);
    buf[32..].copy_from_slice(salt);
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

fn decode(payload: &str) -> Result<([u8; 32], [u8; 16]), String> {
    if payload.len() != PAYLOAD_LEN * 2 {
        return Err("Invalid stored session length".to_string());
    }

    let mut buf = [0u8; PAYLOAD_LEN];
    for (i, chunk) in payload.as_bytes().chunks(2).enumerate() {
        if i >= PAYLOAD_LEN {
            break;
        }
        let hex = std::str::from_utf8(chunk).map_err(|e| e.to_string())?;
        buf[i] = u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?;
    }

    let mut key = [0u8; 32];
    let mut salt = [0u8; 16];
    key.copy_from_slice(&buf[..32]);
    salt.copy_from_slice(&buf[32..]);
    Ok((key, salt))
}

pub fn save_session(key: &[u8; 32], salt: &[u8; 16]) -> Result<(), String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    entry
        .set_password(&encode(key, salt))
        .map_err(|e| e.to_string())
}

pub fn load_session() -> Option<([u8; 32], [u8; 16])> {
    let entry = Entry::new(SERVICE, ACCOUNT).ok()?;
    let payload = entry.get_password().ok()?;
    decode(&payload).ok()
}

pub fn clear_session() -> Result<(), String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
