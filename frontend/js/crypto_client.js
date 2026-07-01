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

// ----------------- ARITMÉTICA GF(256) Y RECONSTRUCCIÓN SHAMIR -----------------

/**
 * Multiplica dos números en el campo de Galois GF(256) usando
 * el polinomio generador irreducible x^8 + x^4 + x^3 + x^2 + 1 (0x11d).
 */
function gf256_mul(a, b) {
    let p = 0;
    for (let i = 0; i < 8; i++) {
        if (b & 1) {
            p ^= a;
        }
        let carry = a & 0x80;
        a <<= 1;
        if (carry) {
            a ^= 0x11d;
        }
        b >>= 1;
    }
    return p & 0xFF;
}

/**
 * Encuentra la inversa multiplicativa de un número en GF(256)
 */
function gf256_inv(b) {
    if (b === 0) return 0;
    for (let i = 1; i < 256; i++) {
        if (gf256_mul(b, i) === 1) {
            return i;
        }
    }
    return 0;
}

/**
 * Reconstruye el secreto original (llave privada RSA PEM) combinando al menos 2 fragmentos (k=2, n=3).
 * Cada fragmento viene formateado como: SD-SHARE-v1-[ID_FRAGMENTO]-[PAYLOAD_BASE64]
 */
function reconstruirSecretShamir(shareStrings) {
    if (shareStrings.length < 2) {
        throw new Error("Se requieren al menos 2 fragmentos para reconstruir el secreto.");
    }
    
    // Parsear fragmentos
    const parsedShares = [];
    for (let shareStr of shareStrings) {
        const cleaned = shareStr.trim();
        const parts = cleaned.split("-");
        // parts: ["SD", "SHARE", "v1", "[ID]", "[B64_DATA]"]
        if (parts.length < 5 || parts[0] !== "SD" || parts[1] !== "SHARE" || parts[2] !== "v1") {
            throw new Error("Formato de fragmento de llave privada inválido.");
        }
        const id = parseInt(parts[3], 10);
        const yBytes = new Uint8Array(base64ToArrayBuffer(parts[4]));
        parsedShares.push({ x: id, y: yBytes });
    }
    
    const x1 = parsedShares[0].x;
    const x2 = parsedShares[1].x;
    const y1 = parsedShares[0].y;
    const y2 = parsedShares[1].y;
    
    if (x1 === x2) {
        throw new Error("Debe cargar dos fragmentos DIFERENTES.");
    }
    
    if (y1.length !== y2.length) {
        throw new Error("Los fragmentos corresponden a llaves diferentes o están corruptos.");
    }
    
    // Calcular coeficientes de Lagrange en x=0 para k=2:
    // l1 = x2 / (x2 ^ x1)
    // l2 = x1 / (x1 ^ x2)
    const diff = x2 ^ x1;
    const invDiff = gf256_inv(diff);
    const l1 = gf256_mul(x2, invDiff);
    const l2 = gf256_mul(x1, invDiff);
    
    const len = y1.length;
    const secretBytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        // S_i = f(0) = (y1 * l1) ^ (y2 * l2)
        secretBytes[i] = gf256_mul(y1[i], l1) ^ gf256_mul(y2[i], l2);
    }
    
    return new TextDecoder().decode(secretBytes);
}
