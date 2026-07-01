import os
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

def ensure_organizational_keys(keys_dir="backend/keys"):
    """
    Verifica si existe la llave pública en el servidor.
    Si no existe, genera un nuevo par de llaves RSA de 2048 bits.
    Guarda la llave pública localmente en el servidor.
    Retorna la llave privada PEM en bytes para que pueda ser guardada localmente
    por el administrador durante la instalación (y luego no guardada en el servidor).
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
    print("[!] IMPORTANTE: La llave privada se ha generado. Debe ser guardada en un lugar seguro (USB/Cold Storage).")
    
    return priv_bytes

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
