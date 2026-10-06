// src/js/ui/ocr.js

export function initOCR() {
    configurarInputsArchivo();

    document.getElementById('btn-ocr-motor').addEventListener('click', (e) => {
        e.stopPropagation(); // Evita que se abra el selector de archivos al hacer clic en el botón
        escanearPlaca('motor');
    });

    document.getElementById('btn-ocr-reductor').addEventListener('click', (e) => {
        e.stopPropagation();
        escanearPlaca('reductor');
    });
}

function configurarInputsArchivo() {
    const ids = ['ref', 'motor', 'reductor'];
    ids.forEach(id => {
        const input = document.getElementById(`input-foto-${id}`);
        input.addEventListener('change', (e) => {
            if(e.target.files.length > 0) {
                document.getElementById(`icono-${id}`).style.color = 'var(--status-ok)';
                document.getElementById(`texto-${id}`).innerText = '✅ Cargada';
                if(id !== 'ref') {
                    const btn = document.getElementById(`btn-ocr-${id}`);
                    btn.style.background = id === 'motor' ? 'var(--accent-blue)' : '#f59e0b';
                    btn.style.color = '#fff';
                }
            }
        });
    });
}

async function escanearPlaca(tipoPlaca) {
    const input = document.getElementById(`input-foto-${tipoPlaca}`);
    const btn = document.getElementById(`btn-ocr-${tipoPlaca}`);
    const archivo = input.files[0];

    if (!archivo) {
        alert(`Primero debes subir una fotografía de la placa del ${tipoPlaca}.`);
        return;
    }

    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-outlined" style="animation: spin 2s linear infinite;">sync</span> Leyendo...';
    btn.disabled = true;

    try {
        const resultado = await Tesseract.recognize(archivo, 'eng+spa');
        const textoExtraido = resultado.data.text.toUpperCase().replace(/\s+/g, ' ');
        console.log(`TEXTO DETECTADO (${tipoPlaca}):\n`, textoExtraido);

        let encontrados = false;

        if (tipoPlaca === 'motor') {
            // --- LÓGICA MOTOR ---
            // 1. Potencia
            let matchPotencia = textoExtraido.match(/(\d+(?:[.,]\d+)?)\s*(?:KW|HP)/i) || textoExtraido.match(/(?:KW|HP).{1,25}?(\d+(?:[.,]\d+)?)/i);
            // 2. RPM
            let matchRPM = textoExtraido.match(/(\d{3,4})\s*(?:R\/?MIN|RPM)/i) || textoExtraido.match(/(?:R\/?MIN|RPM).{1,25}?(\d{3,4})/i) || textoExtraido.match(/\b(7[0-4][0-9]|9[0-8][0-9]|11[0-9]{2}|14[0-9]{2}|17[0-9]{2}|29[0-9]{2}|35[0-9]{2})\b/);
            
            // 3. Rodamientos (FILTRO ESTRICTO)
            // Debe ser de 4 o 5 dígitos (ej: 6205, 6312, 22215) o NU/NJ + 3 dígitos (NU312).
            // Puede ir seguido Opcionalmente por 1 a 4 caracteres de sufijos (Z, ZZ, RS, C3).
            // NO puede ser un número kilométrico (agregamos lookarounds de límites de palabra).
            const regexRodamientosEstricta = /\b((?:6[0234]\d{2}|2[23]\d{3}|NU\d{3}|NJ\d{3}))(?:[\s-]*([A-Z0-9]{1,4}))?\b/g;
            const rodamientosEncontrados = [...new Set(textoExtraido.match(regexRodamientosEstricta))];

            // 4. Carcasa (Frame) Ej: 90L, 132M, 315S, 355L
            let matchCarcasa = textoExtraido.match(/\b(71|80|90|100|112|132|160|180|200|225|250|280|315|355)[SML]\b/i);

            if (matchPotencia) marcarYLLenar('eq-potencia', matchPotencia[1].replace(',', '.').trim(), () => encontrados = true);
            if (matchRPM) marcarYLLenar('eq-rpm', matchRPM[1].trim(), () => encontrados = true);
            if (matchCarcasa) marcarYLLenar('eq-carcasa', matchCarcasa[0].trim(), () => encontrados = true);
            
            if (rodamientosEncontrados && rodamientosEncontrados.length > 0) {
                marcarYLLenar('eq-rod-de', rodamientosEncontrados[0].trim(), () => encontrados = true);
                marcarYLLenar('eq-rod-nde', rodamientosEncontrados.length > 1 ? rodamientosEncontrados[1].trim() : rodamientosEncontrados[0].trim(), () => {});
            }
        } 
        else if (tipoPlaca === 'reductor') {
            // --- LÓGICA REDUCTOR ---
            // Busca Ratio: i=24.5, i = 24.5, ratio 24.5, i: 24.5
            let matchRatio = textoExtraido.match(/(?:I|RATIO)\s*[=:]?\s*(\d+(?:[.,]\d+)?)/i);
            
            if (matchRatio) {
                const ratio = matchRatio[1].replace(',', '.').trim();
                marcarYLLenar('eq-red-ratio', ratio, () => encontrados = true);
                
                // Si el motor ya tiene RPM, calculamos automáticamente las RPM de salida
                const rpmMotor = document.getElementById('eq-rpm').value;
                if(rpmMotor && ratio > 0) {
                    const rpmSalida = (parseFloat(rpmMotor) / parseFloat(ratio)).toFixed(1);
                    marcarYLLenar('eq-red-rpm', rpmSalida, () => {});
                }
            }
        }

        if (!encontrados) {
            alert(`La IA analizó la placa del ${tipoPlaca} pero no encontró datos clave legibles.`);
        }

    } catch (error) {
        console.error("Error en OCR:", error);
        alert(`Error al escanear la placa del ${tipoPlaca}.`);
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

// Función auxiliar para pintar de verde los inputs autollenados
function marcarYLLenar(idInput, valor, callback) {
    const input = document.getElementById(idInput);
    if(input && valor) {
        input.value = valor;
        input.style.border = "2px solid var(--status-ok)";
        callback();
    }
}