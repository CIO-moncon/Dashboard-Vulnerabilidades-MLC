import os
from pathlib import Path

def auditar_raiz_proyecto(raiz="."):
    print("==================================================")
    print("  AUDITORÍA DE CÓDIGO Y LIMPIEZA EN LA RAÍZ")
    print("==================================================\n")
    
    path_raiz = Path(raiz)
    
    # 1. Buscar archivos basura o temporales comunes
    extensiones_basura = {'.log', '.tmp', '.DS_Store', '.pyc', '.cache'}
    archivos_basura_encontrados = []
    
    # 2. Contadores de código
    total_js = 0
    total_py = 0
    contenido_js_global = ""
    
    for ruta in path_raiz.glob("**/*"):
        if ruta.is_file():
            # Ignorar carpetas virtuales o de git
            if any(p in ruta.parts for p in ['.git', 'venv', '__pycache__', 'node_modules']):
                continue
                
            if ruta.suffix in extensiones_basura:
                archivos_basura_encontrados.append(ruta)
                
            if ruta.suffix == '.js':
                total_js += 1
                try:
                    with open(ruta, 'r', encoding='utf-8', errors='ignore') as f:
                        contenido_js_global += f.read() + "\n"
                except Exception:
                    pass
                    
            elif ruta.suffix == '.py':
                total_py += 1

    print(f"📊 Estadísticas de código encontradas:")
    print(f"   - Archivos JavaScript analizados: {total_js}")
    print(f"   - Archivos Python analizados: {total_py}\n")
    
    if archivos_basura_encontrados:
        print(f"⚠️  Se encontraron {len(archivos_basura_encontrados)} archivo(s) temporal(es) o basura:")
        for b in archivos_basura_encontrados:
            print(f"   -> {b}")
        print("   (Se recomienda eliminarlos de la raíz).\n")
    else:
        print("✨ No se encontraron archivos temporales basura en las extensiones analizadas.\n")

    # 3. Verificación rápida de funciones clave en JavaScript (analizando si tienen más de 1 aparición)
    print("🔍 Analizando referencias de funciones en la PWA (JS)...")
    funciones_a_revisar = [
        "abrirGraficoTendencia", 
        "abrirModalAnalisisExperto", 
        "guardarMedicionesRuta",
        "evaluarInputEnVivo",
        "abrirModalTimelineActivo"
    ]
    
    for fn in funciones_a_revisar:
        conteo = contenido_js_global.count(fn)
        if conteo <= 1:
            print(f"   [ALERTA] La función '{fn}' aparece {conteo} vez(es) en total. Podría estar huérfana o sin llamadas activas.")
        else:
            print(f"   [OK] '{fn}' tiene {conteo} referencias activas.")

    print("\n==================================================")
    print("  FIN DE LA AUDITORÍA RÁPIDA")
    print("==================================================")

if __name__ == "__main__":
    auditar_raiz_proyecto()