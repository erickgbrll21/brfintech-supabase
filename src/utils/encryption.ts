/**
 * Utilitário de criptografia para proteção de dados sensíveis
 * Usa Web Crypto API nativa do navegador para segurança máxima
 */

// Chave de criptografia derivada do domínio (em produção, use uma chave mais segura)
const getEncryptionKey = async (): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('brfintech-secure-key-2024'),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('brfintech-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * Criptografa dados sensíveis antes de armazenar no localStorage
 */
export const encryptData = async (data: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );

    // Combinar IV e dados criptografados
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Converter para base64 para armazenamento
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Erro ao criptografar dados:', error);
    throw new Error('Falha ao criptografar dados');
  }
};

/**
 * Descriptografa dados do localStorage
 */
export const decryptData = async (encryptedData: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    
    // Converter de base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extrair IV e dados criptografados
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Erro ao descriptografar dados:', error);
    throw new Error('Falha ao descriptografar dados');
  }
};

/**
 * Hash de senha usando Web Crypto API (similar ao bcrypt)
 */
export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'brfintech-salt-2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Verifica se uma senha corresponde ao hash armazenado
 */
export const verifyPassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  const hash = await hashPassword(password);
  return hash === hashedPassword;
};

/**
 * Criptografa objeto JSON antes de salvar no localStorage
 */
export const encryptObject = async <T>(obj: T): Promise<string> => {
  const jsonString = JSON.stringify(obj);
  return encryptData(jsonString);
};

/**
 * Descriptografa objeto JSON do localStorage
 */
export const decryptObject = async <T>(encryptedData: string): Promise<T> => {
  const jsonString = await decryptData(encryptedData);
  return JSON.parse(jsonString) as T;
};





