/**
 * SafeDrop Local - Criptografía de Cliente (Cifrado Híbrido)
 * Utiliza la API nativa del navegador: Web Crypto API (window.crypto.subtle).
 */

// --- UTILIDADES DE CONVERSIÓN ---

/**
 * Convierte un ArrayBuffer a una cadena Base64 estándar.
 */
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Convierte una cadena Base64 a un ArrayBuffer.
 */
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Convierte una llave PEM (cadena) a un ArrayBuffer, limpiando los encabezados.
 */
function pemToArrayBuffer(pem, keyType) {
    const header = `-----BEGIN ${keyType}-----`;
    const footer = `-----END ${keyType}-----`;
    
    let cleaned = pem.trim();
    if (cleaned.includes(header)) {
        cleaned = cleaned.replace(header, "");
    }
    if (cleaned.includes(footer)) {
        cleaned = cleaned.replace(footer, "");
    }
    // Eliminar espacios, saltos de línea y retornos de carro
    cleaned = cleaned.replace(/\s+/g, "");
    return base64ToArrayBuffer(cleaned);
}

// --- OPERACIONES CRIPTOGRÁFICAS ---

/**
 * Genera una llave simétrica temporal AES-GCM de 256 bits.
 */
async function generarLlaveAES() {
    return await window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256
        },
        true, // Exportable (para poder envolverla con RSA)
        ["encrypt", "decrypt"]
    );
}

/**
 * Cifra una cadena de texto usando AES-GCM.
 * Retorna { cipherText: string (Base64), iv: string (Base64) }
 */
async function cifrarTexto(aesKey, plaintext) {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(plaintext);
    
    // Generar un IV único de 12 bytes
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        aesKey,
        dataBytes
    );
    
    return {
        cipherText: arrayBufferToBase64(encryptedBuffer),
        iv: arrayBufferToBase64(iv)
    };
}

/**
 * Cifra un ArrayBuffer de archivo usando AES-GCM.
 * Retorna { cipherText: string (Base64), iv: string (Base64) }
 */
async function cifrarArchivoBytes(aesKey, arrayBuffer) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        aesKey,
        arrayBuffer
    );
    
    return {
        cipherText: arrayBufferToBase64(encryptedBuffer),
        iv: arrayBufferToBase64(iv)
    };
}

/**
 * Importa una llave pública RSA PEM (formato SPKI) para cifrado RSA-OAEP con SHA-256.
 */
async function importarLlavePublicaRSA(pemPublicKey) {
    const binaryKey = pemToArrayBuffer(pemPublicKey, "PUBLIC KEY");
    
    return await window.crypto.subtle.importKey(
        "spki",
        binaryKey,
        {
            name: "RSA-OAEP",
            hash: "SHA-256"
        },
        true,
        ["encrypt"]
    );
}

/**
 * Importa una llave privada RSA PEM (formato PKCS#8) para descifrado RSA-OAEP con SHA-256.
 */
async function importarLlavePrivadaRSA(pemPrivateKey) {
    const binaryKey = pemToArrayBuffer(pemPrivateKey, "PRIVATE KEY");
    
    return await window.crypto.subtle.importKey(
        "pkcs8",
        binaryKey,
        {
            name: "RSA-OAEP",
            hash: "SHA-256"
        },
        true,
        ["decrypt"]
    );
}

/**
 * Cifra (envuelve) una llave AES exportada usando la llave pública RSA de la organización.
 * Retorna el criptograma de la llave AES en Base64.
 */
async function envolverLlaveAES(publicKeyRSA, aesKey) {
    // 1. Exportar la llave AES a bytes crudos (raw)
    const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
    
    // 2. Cifrar los bytes con RSA-OAEP
    const encryptedAesKey = await window.crypto.subtle.encrypt(
        {
            name: "RSA-OAEP"
        },
        publicKeyRSA,
        rawAesKey
    );
    
    return arrayBufferToBase64(encryptedAesKey);
}

/**
 * Descifra (desenvuelve) la llave AES a partir del Base64 cifrado usando la llave privada RSA.
 * Retorna el objeto CryptoKey de AES-GCM listo para usar.
 */
async function desvolverLlaveAES(privateKeyRSA, encryptedAesKeyBase64) {
    const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedAesKeyBase64);
    
    // 1. Descifrar los bytes de la llave AES con RSA-OAEP
    const rawAesKey = await window.crypto.subtle.decrypt(
        {
            name: "RSA-OAEP"
        },
        privateKeyRSA,
        encryptedAesKeyBuffer
    );
    
    // 2. Importar la llave cruda de vuelta a CryptoKey AES-GCM
    return await window.crypto.subtle.importKey(
        "raw",
        rawAesKey,
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Descifra texto cifrado en Base64 usando la llave AES-GCM y el IV correspondiente.
 * Retorna el string original descifrado.
 */
async function descifrarTexto(aesKey, cipherTextBase64, ivBase64) {
    const cipherTextBuffer = base64ToArrayBuffer(cipherTextBase64);
    const ivBuffer = base64ToArrayBuffer(ivBase64);
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: ivBuffer
        },
        aesKey,
        cipherTextBuffer
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
}

/**
 * Descifra un archivo cifrado en Base64 usando la llave AES-GCM y el IV correspondiente.
 * Retorna un ArrayBuffer con los bytes descifrados del archivo original.
 */
async function descifrarArchivoBytes(aesKey, cipherTextBase64, ivBase64) {
    const cipherTextBuffer = base64ToArrayBuffer(cipherTextBase64);
    const ivBuffer = base64ToArrayBuffer(ivBase64);
    
    return await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: ivBuffer
        },
        aesKey,
        cipherTextBuffer
    );
}
