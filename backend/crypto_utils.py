import os
import secrets
import base64
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

# ----------------- ARITMÉTICA GF(256) PARA SHAMIR'S SECRET SHARING -----------------

def gf256_mul(a: int, b: int) -> int:
    """
    Multiplica dos números en el campo de Galois GF(256) usando
    el polinomio generador irreducible x^8 + x^4 + x^3 + x^2 + 1 (0x11d).
    """
    p = 0
    for _ in range(8):
        if b & 1:
            p ^= a
        carry = a & 0x80
        a <<= 1
        if carry:
            a ^= 0x11d
        b >>= 1
    return p & 0xff

def split_secret_shamir(secret_bytes: bytes, threshold: int = 2, num_shares: int = 3) -> dict[int, str]:
    """
    Divide un secreto (bytes) en num_shares fragmentos utilizando Shamir's Secret Sharing
    con un umbral (threshold) de reconstrucción.
    Para k=2, n=3:
    f(x) = S + a1 * x
    """
    if threshold != 2 or num_shares != 3:
        raise ValueError("Esta implementación está optimizada para un umbral (k=2, n=3).")

    # Inicializar contenedores para cada fragmento
    shares = {1: bytearray(), 2: bytearray(), 3: bytearray()}

    for byte in secret_bytes:
        # Generar un coeficiente aleatorio a1 para este byte del secreto (término lineal)
        a1 = secrets.randbelow(256)
        
        # Calcular los puntos f(1), f(2), f(3)
        for x in [1, 2, 3]:
            # y = S ^ (a1 * x) en GF(256)
            y = byte ^ gf256_mul(a1, x)
            shares[x].append(y)

    # Formatear cada fragmento en un formato de texto seguro Base64
    formatted_shares = {}
    for x in [1, 2, 3]:
        b64_data = base64.b64encode(shares[x]).decode('utf-8')
        # Formato de cabecera: SD-SHARE-v1-[ID_FRAGMENTO]-[PAYLOAD_BASE64]
        formatted_shares[x] = f"SD-SHARE-v1-{x}-{b64_data}"

    return formatted_shares

# ----------------- GESTIÓN DE LLAVES RSA -----------------

def ensure_organizational_keys(keys_dir="backend/keys"):
    """
    Verifica si existe la llave pública en el servidor.
    Si no existe, genera un nuevo par de llaves RSA de 2048 bits.
    Guarda la llave pública localmente en el servidor.
    Divide la llave privada RSA en 3 fragmentos usando Shamir's Secret Sharing (2-of-3).
    Retorna un diccionario con los 3 fragmentos formateados para ser descargados.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_dir = os.path.join(base_dir, "backend", "keys")
    os.makedirs(target_dir, exist_ok=True)
    
    pub_path = os.path.join(target_dir, "org_public.pem")
    
    # Si la llave pública ya existe, simplemente retornamos None (ya está configurada)
    if os.path.exists(pub_path):
        print("[*] Llave pública organizacional ya configurada.")
        return None
        
    print("[*] Generando nuevo par de llaves RSA-OAEP de 2048 bits para SafeDrop Local...")
    
    # Generar llave privada RSA
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048
    )
    
    # Exportar llave pública en formato PEM (SPKI)
    public_key = private_key.public_key()
    pub_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    # Guardar llave pública en el servidor
    with open(pub_path, "wb") as f:
        f.write(pub_bytes)
        
    # Exportar llave privada en formato PEM (PKCS#8 no encriptado)
    priv_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    print(f"[+] Llave pública guardada en el servidor: {pub_path}")
    print("[!] Dividiendo llave privada mediante Shamir's Secret Sharing (k=2, n=3)...")
    
    # Dividir el PEM binario en 3 fragmentos
    shares = split_secret_shamir(priv_bytes, threshold=2, num_shares=3)
    
    return shares

def get_public_key_pem():
    """
    Retorna el contenido de la llave pública PEM guardada en el servidor.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pub_path = os.path.join(base_dir, "backend", "keys", "org_public.pem")
    if not os.path.exists(pub_path):
        raise FileNotFoundError("La llave pública no se encuentra en el servidor. Inicialice el sistema.")
    with open(pub_path, "r", encoding="utf-8") as f:
        return f.read()
