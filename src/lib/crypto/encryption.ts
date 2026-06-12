import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const SECRET_FILE_PATH = path.join(process.cwd(), '.secret');

/**
 * Generates a random 32-byte secret key and saves it to .secret file as a hex string.
 */
function generateSecret(): string {
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE_PATH, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

/**
 * Loads the secret key from the .secret file. If it does not exist, generates it.
 * Returns the key as a Buffer.
 */
function loadOrCreateSecret(): Buffer {
  let hexSecret: string;
  if (fs.existsSync(SECRET_FILE_PATH)) {
    hexSecret = fs.readFileSync(SECRET_FILE_PATH, 'utf8').trim();
    if (hexSecret.length !== 64) {
      // Regenerate if corrupt or invalid length
      hexSecret = generateSecret();
    }
  } else {
    hexSecret = generateSecret();
  }
  return Buffer.from(hexSecret, 'hex');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns ciphertext formatted as ivHex:encryptedHex:authTagHex
 */
export function encrypt(plaintext: string): string {
  try {
    const key = loadOrCreateSecret();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypts ciphertext formatted as ivHex:encryptedHex:authTagHex using AES-256-GCM.
 */
export function decrypt(ciphertext: string): string {
  try {
    const key = loadOrCreateSecret();
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    
    const [ivHex, encryptedHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Decryption failed');
  }
}
