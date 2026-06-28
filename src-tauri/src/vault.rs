use serde::{Serialize, Deserialize};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use rand::{RngCore, thread_rng};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use ssh_key::{Algorithm, PrivateKey, LineEnding, EcdsaCurve};
use ssh_key::rand_core::OsRng;

const PBKDF2_ITERATIONS: u32 = 100_000;
const MAGIC_HEADER: &[u8] = b"GHOSTSHELL";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KeyChainEntry {
    pub id: usize,
    pub name: String,
    #[serde(rename = "type")]
    pub key_type: String, // "rsa", "ecdsa", "ed25519"
    pub size: String,
    pub private_key: String,
    pub public_key: String,
    pub passphrase: Option<String>,
    pub certificate: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HostEntry {
    pub id: usize,
    pub name: String,
    pub address: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub key_id: Option<usize>,
    pub created_at: String,
    pub updated_at: String,
    pub os: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct VaultData {
    pub keys: Vec<KeyChainEntry>,
    pub hosts: Vec<HostEntry>,
}

pub fn derive_key(passphrase: &str, salt: &[u8; 16]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

pub fn encrypt_vault(vault: &VaultData, key: &[u8; 32], salt: &[u8; 16]) -> Result<Vec<u8>, String> {
    let json_bytes = serde_json::to_vec(vault).map_err(|e| e.to_string())?;
    
    let mut nonce_bytes = [0u8; 12];
    thread_rng().fill_bytes(&mut nonce_bytes);
    
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, json_bytes.as_slice()).map_err(|e| e.to_string())?;
    
    let mut payload = Vec::with_capacity(MAGIC_HEADER.len() + salt.len() + nonce_bytes.len() + ciphertext.len());
    payload.extend_from_slice(MAGIC_HEADER);
    payload.extend_from_slice(salt);
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    
    Ok(payload)
}

pub fn decrypt_vault_file(file_path: &Path, passphrase: &str) -> Result<(VaultData, [u8; 32], [u8; 16]), String> {
    let mut file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut magic = vec![0u8; MAGIC_HEADER.len()];
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;
    if magic != MAGIC_HEADER {
        return Err("Invalid vault file format (magic header mismatch)".to_string());
    }
    
    let mut salt = [0u8; 16];
    file.read_exact(&mut salt).map_err(|e| e.to_string())?;
    
    let mut nonce_bytes = [0u8; 12];
    file.read_exact(&mut nonce_bytes).map_err(|e| e.to_string())?;
    
    let mut ciphertext = Vec::new();
    file.read_to_end(&mut ciphertext).map_err(|e| e.to_string())?;
    
    let key = derive_key(passphrase, &salt);
    
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let decrypted_bytes = cipher.decrypt(nonce, ciphertext.as_slice()).map_err(|_| "Invalid passphrase".to_string())?;
    
    let vault: VaultData = serde_json::from_slice(&decrypted_bytes).map_err(|e| e.to_string())?;
    
    Ok((vault, key, salt))
}

pub fn decrypt_vault_with_key(file_path: &Path, key: &[u8; 32]) -> Result<VaultData, String> {
    let mut file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut magic = vec![0u8; MAGIC_HEADER.len()];
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;
    if magic != MAGIC_HEADER {
        return Err("Invalid vault file format".to_string());
    }
    
    let mut _salt = [0u8; 16];
    file.read_exact(&mut _salt).map_err(|e| e.to_string())?;
    
    let mut nonce_bytes = [0u8; 12];
    file.read_exact(&mut nonce_bytes).map_err(|e| e.to_string())?;
    
    let mut ciphertext = Vec::new();
    file.read_to_end(&mut ciphertext).map_err(|e| e.to_string())?;
    
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let decrypted_bytes = cipher.decrypt(nonce, ciphertext.as_slice()).map_err(|e| e.to_string())?;
    
    let vault: VaultData = serde_json::from_slice(&decrypted_bytes).map_err(|e| e.to_string())?;
    Ok(vault)
}

pub fn decrypt_vault_bytes_with_key(bytes: &[u8], key: &[u8; 32]) -> Result<VaultData, String> {
    if bytes.len() < MAGIC_HEADER.len() + 16 + 12 {
        return Err("Invalid or corrupted backup data (too short)".to_string());
    }
    
    let magic = &bytes[..MAGIC_HEADER.len()];
    if magic != MAGIC_HEADER {
        return Err("Invalid backup file format (magic mismatch)".to_string());
    }
    
    let mut nonce_bytes = [0u8; 12];
    let offset = MAGIC_HEADER.len() + 16;
    nonce_bytes.copy_from_slice(&bytes[offset .. offset + 12]);
    
    let ciphertext = &bytes[offset + 12..];
    
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let decrypted_bytes = cipher.decrypt(nonce, ciphertext).map_err(|_| "Backup file decryption failed. It may be encrypted with a different passphrase or corrupted.".to_string())?;
    
    let vault: VaultData = serde_json::from_slice(&decrypted_bytes).map_err(|e| e.to_string())?;
    Ok(vault)
}

pub fn generate_ssh_key(key_type: &str, size_or_curve: &str) -> Result<(String, String), String> {
    match key_type {
        "ed25519" => {
            let private_key = PrivateKey::random(&mut OsRng, Algorithm::Ed25519).map_err(|e| e.to_string())?;
            let priv_openssh = private_key.to_openssh(LineEnding::LF).map_err(|e| e.to_string())?;
            let pub_openssh = private_key.public_key().to_openssh().map_err(|e| e.to_string())?;
            Ok((priv_openssh.to_string(), pub_openssh))
        }
        "ecdsa" => {
            let curve = match size_or_curve {
                "256" => EcdsaCurve::NistP256,
                "384" => EcdsaCurve::NistP384,
                "521" => EcdsaCurve::NistP521,
                _ => return Err(format!("Unsupported ECDSA size: {}", size_or_curve)),
            };
            let private_key = PrivateKey::random(&mut OsRng, Algorithm::Ecdsa { curve }).map_err(|e| e.to_string())?;
            let priv_openssh = private_key.to_openssh(LineEnding::LF).map_err(|e| e.to_string())?;
            let pub_openssh = private_key.public_key().to_openssh().map_err(|e| e.to_string())?;
            Ok((priv_openssh.to_string(), pub_openssh))
        }
        "rsa" => {
            let bits = size_or_curve.parse::<usize>().map_err(|_| "Invalid RSA bit size".to_string())?;
            if bits < 2048 {
                return Err("RSA key size must be at least 2048 bits".to_string());
            }
            if bits != 2048 && bits != 4096 {
                return Err("RSA bit size must be 2048 or 4096".to_string());
            }
            
            // Generate RSA key pair using rsa crate
            let mut rng = rand::thread_rng();
            let priv_key = rsa::RsaPrivateKey::new(&mut rng, bits).map_err(|e| e.to_string())?;
            
            // Convert to ssh-key RsaKeypair
            let rsa_keypair: ssh_key::private::RsaKeypair = priv_key.try_into().map_err(|e: ssh_key::Error| e.to_string())?;
            
            // Wrap in PrivateKey
            let private_key = PrivateKey::new(ssh_key::private::KeypairData::Rsa(rsa_keypair), "").map_err(|e| e.to_string())?;
            
            let priv_openssh = private_key.to_openssh(LineEnding::LF).map_err(|e| e.to_string())?;
            let pub_openssh = private_key.public_key().to_openssh().map_err(|e| e.to_string())?;
            Ok((priv_openssh.to_string(), pub_openssh))
        }
        _ => Err(format!("Unsupported key type: {}", key_type)),
    }
}
