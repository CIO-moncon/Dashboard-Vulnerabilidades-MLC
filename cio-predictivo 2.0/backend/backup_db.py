"""Respaldo consistente de la base SQLite de CIO Predictivo 2.0.

Usa la API de backup de SQLite (no una copia de archivo), por lo que es seguro
incluso si la base está en modo WAL y hay conexiones activas.

Uso (desde la carpeta backend/):

    python backup_db.py
    python backup_db.py --output-dir /var/backups/cio --keep 14 --compress

Variables de entorno:
    CIO_DB_PATH     Ruta de la base a respaldar (por defecto backend/cio_predictivo.db).
    CIO_BACKUP_DIR  Directorio de destino por defecto (por defecto backend/backups).
    CIO_BACKUP_KEEP Cantidad de respaldos a conservar (por defecto 14).

Programación sugerida:
    - Linux/macOS: cron diario, p. ej. "0 2 * * * cd /opt/cio/backend && python backup_db.py"
    - Windows: Programador de tareas ejecutando este script diariamente.
"""

from __future__ import annotations

import argparse
import gzip
import os
import shutil
import sqlite3
import time
from datetime import datetime
from pathlib import Path

try:  # Carga opcional de backend/.env.
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass


def _ruta_bd() -> Path:
    crudo = os.getenv("CIO_DB_PATH", os.path.join(os.path.dirname(__file__), "cio_predictivo.db"))
    return Path(crudo).expanduser().resolve()


def _directorio_destino(argumento: str | None) -> Path:
    crudo = argumento or os.getenv(
        "CIO_BACKUP_DIR", os.path.join(os.path.dirname(__file__), "backups")
    )
    ruta = Path(crudo).expanduser().resolve()
    ruta.mkdir(parents=True, exist_ok=True)
    return ruta


def _realizar_backup(origen: Path, destino: Path) -> None:
    """Copia consistente usando la API de backup de SQLite."""
    if not origen.exists():
        raise FileNotFoundError(f"No existe la base de datos: {origen}")

    conexion_origen = sqlite3.connect(str(origen))
    try:
        # Forzar checkpoint del WAL antes de copiar.
        conexion_origen.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        conexion_destino = sqlite3.connect(str(destino))
        try:
            conexion_origen.backup(conexion_destino)
        finally:
            conexion_destino.close()
    finally:
        conexion_origen.close()


def _comprimir(archivo: Path) -> Path:
    comprimido = archivo.with_suffix(archivo.suffix + ".gz")
    with archivo.open("rb") as entrada, gzip.open(comprimido, "wb") as salida:
        shutil.copyfileobj(entrada, salida)
    archivo.unlink()
    return comprimido


def _aplicar_retencion(directorio: Path, patron: str, cantidad: int) -> list[Path]:
    """Elimina los respaldos más antiguos, conservando los `cantidad` más recientes."""
    candidatos = sorted(
        (p for p in directorio.glob(patron) if p.is_file()),
        key=lambda p: p.stat().st_mtime,
    )
    a_eliminar = candidatos[:-cantidad] if cantidad > 0 else candidatos
    for archivo in a_eliminar:
        archivo.unlink(missing_ok=True)
    return a_eliminar


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Respaldo consistente de la BD SQLite de CIO Predictivo 2.0."
    )
    parser.add_argument("--output-dir", help="Directorio de destino de los respaldos.")
    parser.add_argument(
        "--keep",
        type=int,
        default=int(os.getenv("CIO_BACKUP_KEEP", "14")),
        help="Cantidad de respaldos a conservar (por defecto 14).",
    )
    parser.add_argument(
        "--compress",
        action="store_true",
        help="Comprimir el respaldo con gzip.",
    )
    parser.add_argument(
        "--db-path",
        help="Ruta de la base de datos (sobrescribe CIO_DB_PATH).",
    )
    args = parser.parse_args()

    origen = Path(args.db_path).expanduser().resolve() if args.db_path else _ruta_bd()
    directorio = _directorio_destino(args.output_dir)

    sello = datetime.now().strftime("%Y%m%d_%H%M%S")
    nombre = f"cio_predictivo_{sello}.db"
    destino = directorio / nombre

    print(f"[BACKUP] Origen:   {origen}")
    print(f"[BACKUP] Destino:  {destino}")

    inicio = time.time()
    try:
        _realizar_backup(origen, destino)
    except Exception as error:
        print(f"[BACKUP] ❌ Error al respaldar: {error}")
        if destino.exists():
            destino.unlink(missing_ok=True)
        return 1

    if args.compress:
        destino = _comprimir(destino)
        print(f"[BACKUP] Comprimido: {destino}")

    duracion = time.time() - inicio
    tamano_mb = destino.stat().st_size / (1024 * 1024)
    print(f"[BACKUP] ✅ Completado en {duracion:.2f}s ({tamano_mb:.2f} MB)")

    eliminados = _aplicar_retencion(directorio, "cio_predictivo_*.db*", args.keep)
    if eliminados:
        print(f"[BACKUP] Retención: se eliminaron {len(eliminados)} respaldo(s) antiguo(s).")

    print(f"[BACKUP] Respaldos disponibles: {len(list(directorio.glob('cio_predictivo_*.db*')))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
