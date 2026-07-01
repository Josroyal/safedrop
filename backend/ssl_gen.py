import os
import datetime
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

def generate_self_signed_cert(cert_dir="backend/certs"):
    """
    Genera un certificado y llave SSL autofirmados para localhost.
    Si ya existen en el directorio especificado, omite la generación.
    """
    # Usar rutas absolutas relativas al directorio actual
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_dir = os.path.join(base_dir, "backend", "certs")
    os.makedirs(target_dir, exist_ok=True)
    
    cert_path = os.path.join(target_dir, "localhost.crt")
    key_path = os.path.join(target_dir, "localhost.key")
    
    if os.path.exists(cert_path) and os.path.exists(key_path):
        print("[*] Certificados SSL/TLS ya existen. Omitiendo generación.")
        return cert_path, key_path
        
    print("[*] Generando certificado SSL/TLS autofirmado para localhost...")
    
    # Generar llave privada RSA para HTTPS
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    
    # Crear estructura del certificado
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "PE"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Lima"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Lima"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SafeDrop Local"),
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])
    
    # Construir el certificado válido por 1 año
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        private_key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        now - datetime.timedelta(days=1)
    ).not_valid_after(
        now + datetime.timedelta(days=365)
    ).add_extension(
        x509.SubjectAlternativeName([x509.DNSName("localhost")]),
        critical=False,
    ).sign(private_key, hashes.SHA256())
    
    # Guardar llave privada
    with open(key_path, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
        
    # Guardar certificado
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
        
    print(f"[+] Certificado SSL generado con éxito en: {cert_path}")
    return cert_path, key_path

if __name__ == "__main__":
    generate_self_signed_cert()
