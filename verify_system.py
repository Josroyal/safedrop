import sys
import base64
import requests
import urllib3
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ----------------- AUXILIARES DE SHAMIR'S SECRET SHARING -----------------
def gf256_mul(a, b):
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

def gf256_inv(b):
    if b == 0:
        return 0
    for i in range(1, 256):
        if gf256_mul(b, i) == 1:
            return i
    return 0

def reconstruct_shamir(share_strings):
    parsed = []
    for s in share_strings:
        parts = s.strip().split("-")
        idx = int(parts[3])
        data = base64.b64decode(parts[4])
        parsed.append((idx, data))
    
    x1, y1 = parsed[0]
    x2, y2 = parsed[1]
    
    diff = x2 ^ x1
    inv_diff = gf256_inv(diff)
    l1 = gf256_mul(x2, inv_diff)
    l2 = gf256_mul(x1, inv_diff)
    
    reconstructed = bytearray()
    for i in range(len(y1)):
        val = gf256_mul(y1[i], l1) ^ gf256_mul(y2[i], l2)
        reconstructed.append(val)
    return bytes(reconstructed)

# Desactivar advertencias de certificados autofirmados (SSL)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

API_BASE = "https://localhost:8000/api"

def test_integration():
    print("=" * 60)
    print("      SafeDrop Local - Script de Verificación de Integración")
    print("=" * 60)
    
    # 1. Recuperar la llave pública RSA de la organización
    print("[*] 1. Recuperando llave pública RSA del servidor...")
    try:
        res = requests.get(f"{API_BASE}/crypto/public-key", verify=False)
        res.raise_for_status()
        pub_key_pem = res.json()["public_key"]
        print("[+] Llave pública obtenida con éxito.")
    except Exception as e:
        print(f"[X] Falló al obtener la llave pública: {e}")
        return False

    # 2. Simular el cifrado del cliente (Cifrado Híbrido)
    print("\n[*] 2. Simulando cifrado local en el navegador (Cliente)...")
    original_text = "Denuncia de verificación de integración: Intrusión no autorizada en el sector 4."
    
    # Generar llave AES-GCM simétrica aleatoria de 256 bits
    aes_key = AESGCM.generate_key(bit_length=256)
    aesgcm = AESGCM(aes_key)
    
    # Cifrar el texto
    import os
    iv = os.urandom(12)  # 12 bytes = 96 bits
    cipher_bytes = aesgcm.encrypt(iv, original_text.encode('utf-8'), None)
    
    # Codificar en Base64
    cipher_text_b64 = base64.b64encode(cipher_bytes).decode('utf-8')
    iv_b64 = base64.b64encode(iv).decode('utf-8')
    
    # Importar llave pública RSA para envolver la llave AES
    rsa_public_key = serialization.load_pem_public_key(pub_key_pem.encode('utf-8'))
    
    # Cifrar llave AES con RSA-OAEP
    encrypted_aes_key = rsa_public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    encrypted_aes_key_b64 = base64.b64encode(encrypted_aes_key).decode('utf-8')
    print("[+] Reporte cifrado localmente con AES-GCM y llave AES envuelta con RSA-OAEP.")

    # 3. Enviar reporte cifrado a la API (Anónimo)
    print("\n[*] 3. Enviando reporte cifrado al servidor de forma anónima...")
    payload = {
        "report_text_encrypted": cipher_text_b64,
        "report_iv": iv_b64,
        "encrypted_aes_key": encrypted_aes_key_b64,
        "attachments": []
    }
    try:
        res = requests.post(f"{API_BASE}/reports/submit", json=payload, verify=False)
        res.raise_for_status()
        report_id = res.json()["report_id"]
        print(f"[+] Reporte registrado de forma segura. ID asignado: #{report_id}")
    except Exception as e:
        print(f"[X] Falló al enviar reporte: {e}")
        return False

    # 4. Iniciar sesión como Auditor
    print("\n[*] 4. Iniciando sesión como Auditor...")
    login_data = {
        "username": "auditor",
        "password": "SafeDropAuditor2026!"
    }
    try:
        res = requests.post(f"{API_BASE}/auth/login", data=login_data, verify=False)
        res.raise_for_status()
        auditor_token = res.json()["access_token"]
        print("[+] Autenticación de Auditor exitosa (Token JWT obtenido).")
    except Exception as e:
        print(f"[X] Falló login de Auditor: {e}")
        return False

    # 5. Recuperar el reporte cifrado y descifrarlo localmente
    print("\n[*] 5. Recuperando reporte cifrado y simulando descifrado de Auditor...")
    headers = {"Authorization": f"Bearer {auditor_token}"}
    try:
        res = requests.get(f"{API_BASE}/reports/{report_id}", headers=headers, verify=False)
        res.raise_for_status()
        report_data = res.json()
        
        # Cargar dos fragmentos de llave (Shamir's Secret Sharing)
        print("[*] Reconstruyendo la llave privada RSA combinando 2 fragmentos (.share)...")
        with open("llave_privada_compartida_1.share", "r", encoding="utf-8") as f:
            share1 = f.read()
        with open("llave_privada_compartida_3.share", "r", encoding="utf-8") as f:
            share2 = f.read()
            
        priv_key_pem = reconstruct_shamir([share1, share2])
        rsa_private_key = serialization.load_pem_private_key(priv_key_pem, password=None)
        print("[+] Llave privada RSA reconstruida correctamente en memoria del test.")
        
        # Desvolver la llave AES
        enc_aes_bytes = base64.b64decode(report_data["encrypted_aes_key"])
        decrypted_aes_key = rsa_private_key.decrypt(
            enc_aes_bytes,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # Descifrar el texto
        aesgcm_dec = AESGCM(decrypted_aes_key)
        dec_cipher_bytes = base64.b64decode(report_data["report_text_encrypted"])
        dec_iv_bytes = base64.b64decode(report_data["report_iv"])
        
        decrypted_text = aesgcm_dec.decrypt(dec_iv_bytes, dec_cipher_bytes, None).decode('utf-8')
        
        print(f"[+] Contenido descifrado con éxito.")
        print(f"    Texto descifrado: '{decrypted_text}'")
        assert decrypted_text == original_text, "¡El texto descifrado no coincide!"
        print("[+] Verificación de exactitud del descifrado exitosa.")
    except Exception as e:
        print(f"[X] Falló al descifrar el reporte: {e}")
        return False

    # 6. Iniciar sesión como Administrador y verificar integridad inicial
    print("\n[*] 6. Iniciando sesión como Administrador para auditoría...")
    login_data_admin = {
        "username": "admin",
        "password": "SafeDropAdmin2026!"
    }
    try:
        res = requests.post(f"{API_BASE}/auth/login", data=login_data_admin, verify=False)
        res.raise_for_status()
        admin_token = res.json()["access_token"]
        print("[+] Autenticación de Administrador exitosa.")
    except Exception as e:
        print(f"[X] Falló login de Administrador: {e}")
        return False

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    print("[*] Verificando estado inicial de integridad de la bitácora...")
    try:
        res = requests.get(f"{API_BASE}/audit/logs", headers=admin_headers, verify=False)
        res.raise_for_status()
        audit_data = res.json()
        print(f"    ¿Integridad intacta?: {audit_data['integrity_intact']}")
        assert audit_data['integrity_intact'] == True, "¡La bitácora inicial debería ser íntegra!"
        print("[+] Verificación de bitácora inicial: CORRECTA.")
    except Exception as e:
        print(f"[X] Falló verificación de bitácora: {e}")
        return False

    # 7. Simular ataque en base de datos (Alterar registro)
    print("\n[*] 7. Simulando alteración maliciosa en base de datos SQLite...")
    try:
        res = requests.post(f"{API_BASE}/audit/simulate-tampering", headers=admin_headers, verify=False)
        res.raise_for_status()
        print(f"[+] Simulación ejecutada con éxito. Mensaje: {res.json()['message']}")
    except Exception as e:
        print(f"[X] Falló simulación de alteración: {e}")
        return False

    # 8. Comprobar que la integridad ahora falle
    print("\n[*] 8. Verificando integridad de la bitácora tras la alteración...")
    try:
        res = requests.get(f"{API_BASE}/audit/logs", headers=admin_headers, verify=False)
        res.raise_for_status()
        audit_data = res.json()
        print(f"    ¿Integridad intacta?: {audit_data['integrity_intact']}")
        assert audit_data['integrity_intact'] == False, "¡La bitácora alterada debería reportar un fallo de integridad!"
        print("[+] ALERTA DETECTADA CORRECTAMENTE: La cadena criptográfica de auditoría reporta corrupción.")
    except Exception as e:
        print(f"[X] Falló la verificación de seguridad: {e}")
        return False

    print("\n" + "="*60)
    print("  ¡PRUEBA EXITOSA! Todos los controles criptográficos funcionan.")
    print("="*60)
    return True

if __name__ == "__main__":
    success = test_integration()
    sys.exit(0 if success else 1)
