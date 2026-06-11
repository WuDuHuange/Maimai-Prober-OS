import CryptoJS from 'crypto-js';

const SECRET_KEY = 'maimai_prober_os_secret_key_2026';

export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  return CryptoJS.AES.encrypt(plaintext, SECRET_KEY).toString();
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
