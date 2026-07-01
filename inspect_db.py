import sqlite3
import os

def inspect_db():
    db_path = "safedrop.db"
    if not os.path.exists(db_path):
        print(f"No se encontró el archivo de base de datos en: {os.path.abspath(db_path)}")
        return

    print("=" * 60)
    print(f" Inspeccionando Base de Datos: {db_path}")
    print("=" * 60)

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Obtener nombres de las tablas
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall() if not row[0].startswith("sqlite_")]

        if not tables:
            print("La base de datos está vacía (no contiene tablas).")
            return

        for table in tables:
            print(f"\nTabla: '{table}'")
            print("-" * 40)
            
            # Obtener las columnas
            cursor.execute(f"PRAGMA table_info({table});")
            columns = [col[1] for col in cursor.fetchall()]
            print(f"Columnas: {', '.join(columns)}")

            # Obtener número de registros
            cursor.execute(f"SELECT COUNT(*) FROM {table};")
            count = cursor.fetchone()[0]
            print(f"Total de registros: {count}")

            # Mostrar los primeros 5 registros
            if count > 0:
                print(f"Primeros 5 registros:")
                cursor.execute(f"SELECT * FROM {table} LIMIT 5;")
                rows = cursor.fetchall()
                for row in rows:
                    # Mostrar fila de forma legible (abreviando strings muy largos)
                    readable_row = []
                    for val in row:
                        if isinstance(val, str) and len(val) > 40:
                            readable_row.append(val[:40] + "...")
                        else:
                            readable_row.append(val)
                    print(f"  {readable_row}")
            else:
                print("  (Sin registros)")
            print("-" * 40)

        conn.close()
    except Exception as e:
        print(f"Error al leer la base de datos: {e}")

if __name__ == "__main__":
    inspect_db()
