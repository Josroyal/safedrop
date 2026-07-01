import os
import sys
import subprocess

# 1. Asegurar que las dependencias estén instaladas antes de importar nada
def check_dependencies():
    print("[*] Verificando dependencias de Python...")
    try:
        import fastapi
        import uvicorn
        import sqlalchemy
        import cryptography
        import argon2
        import jose
    except ImportError:
        print("[!] Faltan dependencias. Instalando desde requirements.txt...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
            print("[+] Dependencias instaladas con éxito.")
        except Exception as e:
            print(f"[X] Error crítico al instalar dependencias: {e}")
            sys.exit(1)

# Ejecutar verificación de dependencias
check_dependencies()

# Ahora sí podemos importar de forma segura
import uvicorn
from backend.ssl_gen import generate_self_signed_cert
from backend.crypto_utils import ensure_organizational_keys
from backend.database import SessionLocal, init_db, User, add_audit_log
from backend.auth import get_password_hash

def bootstrap_system():
    """
    Inicializa los elementos de seguridad y base de datos del sistema.
    """
    print("="*60)
    print("       SafeDrop Local - Inicialización del Sistema")
    print("="*60)
    
    # 1. Generar certificados SSL autofirmados para HTTPS
    cert_path, key_path = generate_self_signed_cert()
    
    # 2. Inicializar tablas de base de datos
    init_db()
    
    # 3. Asegurar llaves RSA organizacionales
    # Si retorna un diccionario, significa que se crearon por primera vez (shares)
    shares = ensure_organizational_keys()
    
    if shares:
        # Borrar llave privada completa antigua si existiera
        if os.path.exists("organizacion_llave_privada.pem"):
            os.remove("organizacion_llave_privada.pem")
            
        # Guardar cada uno de los 3 fragmentos localmente para el Administrador
        for idx, share_content in shares.items():
            share_filename = f"llave_privada_compartida_{idx}.share"
            with open(share_filename, "w", encoding="utf-8") as f:
                f.write(share_content)
                
        print("+" * 60)
        print("  ¡ALERTA DE SEGURIDAD - SHAMIR'S SECRET SHARING INICIALIZADO!")
        print("  Se ha generado la llave privada RSA e inmediatamente se ha dividido")
        print("  en 3 fragmentos (shares) en los archivos locales:")
        print("  - llave_privada_compartida_1.share (Auditor A)")
        print("  - llave_privada_compartida_2.share (Auditor B)")
        print("  - llave_privada_compartida_3.share (Custodio C)")
        print("  ")
        print("  INDICACIONES PARA LA AUDITORÍA:")
        print("  1. Reparta los fragmentos a diferentes custodios.")
        print("  2. Para descifrar las denuncias en el Panel de Auditoría,")
        print("     se requerirá cargar al menos DOS fragmentos distintos.")
        print("+" * 60)
        
    # 4. Crear usuarios por defecto si no existen
    db = SessionLocal()
    try:
        # Crear Admin por defecto
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_pwd = "SafeDropAdmin2026!"
            new_admin = User(
                username="admin",
                password_hash=get_password_hash(admin_pwd),
                role="admin",
                is_active=True
            )
            db.add(new_admin)
            db.commit()
            print(f"[+] Usuario Administrador creado: 'admin' / '{admin_pwd}'")
            add_audit_log(db, "USER_CREATED", details="Administrador del sistema creado por defecto.")
            
        # Crear Auditor por defecto
        auditor_user = db.query(User).filter(User.username == "auditor").first()
        if not auditor_user:
            auditor_pwd = "SafeDropAuditor2026!"
            new_auditor = User(
                username="auditor",
                password_hash=get_password_hash(auditor_pwd),
                role="auditor",
                is_active=True
            )
            db.add(new_auditor)
            db.commit()
            print(f"[+] Usuario Auditor creado: 'auditor' / '{auditor_pwd}'")
            add_audit_log(db, "USER_CREATED", details="Auditor del sistema creado por defecto.")
            
        # Crear genesis log si la bitácora está vacía
        genesis_log = db.query(AuditLog).first()
        if not genesis_log:
            add_audit_log(db, "SYSTEM_INITIALIZED", details="SafeDrop Local inicializado con éxito. Bitácora de auditoría activada.")
            print("[+] Bloque Génesis de la bitácora de auditoría inicializado.")
            
    except Exception as e:
        print(f"[X] Error al inicializar la base de datos: {e}")
        db.rollback()
    finally:
        db.close()
        
    print("[*] Aprovisionamiento completado con éxito.")
    print("="*60)

def start_server():
    """
    Arranca el servidor HTTPS FastAPI usando Uvicorn.
    """
    bootstrap_system()
    
    print("[*] Iniciando servidor FastAPI con SSL/TLS en https://localhost:8000 ...")
    
    # Rutas absolutas a los certificados
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cert_file = os.path.join(base_dir, "backend", "certs", "localhost.crt")
    key_file = os.path.join(base_dir, "backend", "certs", "localhost.key")
    
    uvicorn.run(
        "backend.main:app",
        host="localhost",
        port=8000,
        ssl_keyfile=key_file,
        ssl_certfile=cert_file,
        reload=True
    )

if __name__ == "__main__":
    start_server()
