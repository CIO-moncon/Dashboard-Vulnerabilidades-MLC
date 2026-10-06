// src/js/main.js
import { subirImagen } from './firebase/storage.js';
import { initClimaWidget } from './api/clima.js';
import { initAuth } from './firebase/auth.js';
import './firebase/admin.js'; 
import { initMapa } from './ui/mapa.js';
import { initEquiposModal } from './ui/equipos.js';
import { initOCR } from './ui/ocr.js';
import { initLecturaActivos } from './ui/activos.js';
// Al inicio de main.js agrega las importaciones:
import { iniciarReceptorAlertasCIO } from './ui/alertas.js';
import { inicializarPaneles } from './ui/paneles.js';

// Y luego, donde inicializas tu app (por ejemplo en document.addEventListener('DOMContentLoaded')):
document.addEventListener('DOMContentLoaded', () => {
    // ... tus otras funciones (mapa, autenticación, etc) ...
    
    inicializarPaneles();
    iniciarReceptorAlertasCIO(); // ¡Esto enciende el radar de escucha del CIO!
});

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 CIO Predictivo V2.0 Inicializado con ES2024");
    
    // Iniciar Módulos base
    initClimaWidget();
    initAuth();
    initEquiposModal();
    initOCR();
    initLecturaActivos();
    
    // Iniciar el Mapa 
    setTimeout(() => {
        initMapa();
    }, 100);

    // Función Global de Guardado / Edición
    window.guardarNuevoEquipo = async function() {
        const inputTag = document.getElementById('eq-tag');
        const tag = inputTag.value.trim();
        const firebaseKey = inputTag.dataset.firebaseKey || tag; 

        const area = document.getElementById('eq-area').value;
        const tipo = document.getElementById('eq-tipo').value;

        if (!tag) {
            alert("Por favor, ingresa el TAG del equipo.");
            return;
        }

        const btnRegistrar = document.querySelector('button[onclick="window.guardarNuevoEquipo()"]');
        const textoOriginal = btnRegistrar.innerHTML;
        btnRegistrar.innerHTML = '<span class="material-symbols-outlined" style="animation: spin 2s linear infinite;">sync</span> Guardando...';
        btnRegistrar.disabled = true;

        try {
            const fileRef = document.getElementById('input-foto-ref').files[0];
            const fileMotor = document.getElementById('input-foto-motor').files[0];
            const fileReductor = document.getElementById('input-foto-reductor').files[0];

            let urlRef = ''; let urlMotor = ''; let urlReductor = '';
            if (fileRef) urlRef = await subirImagen(fileRef, `${tag}_ref`);
            if (fileMotor) urlMotor = await subirImagen(fileMotor, `${tag}_motor`);
            if (fileReductor) urlReductor = await subirImagen(fileReductor, `${tag}_reductor`);

            const specs = {
                potencia: document.getElementById('eq-potencia').value,
                rpm: document.getElementById('eq-rpm').value,
                carcasa: document.getElementById('eq-carcasa').value,
                rodDe: document.getElementById('eq-rod-de').value,
                rodNde: document.getElementById('eq-rod-nde').value,
                redModelo: document.getElementById('eq-red-modelo').value,
                redRatio: document.getElementById('eq-red-ratio').value,
                redRpm: document.getElementById('eq-red-rpm').value,
                acople: document.getElementById('eq-acople').value
            };

            const inputsArbol = document.querySelectorAll('#contenedor-arbol-componentes input');
            const componentesArbol = Array.from(inputsArbol).map(input => input.value);

            // 🛡️ SEGURO ANTI-VACÍOS
            if (componentesArbol.length === 0) {
                alert("⚠️ Alto ahí. Selecciona un Tipo de Equipo para generar la estructura CBM antes de guardar.");
                btnRegistrar.innerHTML = textoOriginal;
                btnRegistrar.disabled = false;
                return;
            }

            // 🎯 Usamos UPDATE en lugar de SET para FUSIONAR los datos sin borrar el historial
            const updates = {
                tag: tag,
                area: area,
                tipo: tipo,
                especificaciones: specs,
                componentes: componentesArbol,
                ultimaEdicion: firebase.database.ServerValue.TIMESTAMP
            };

            if (urlRef) updates['imagenes/ref'] = urlRef;
            if (urlMotor) updates['imagenes/motor'] = urlMotor;
            if (urlReductor) updates['imagenes/reductor'] = urlReductor;

            await firebase.database().ref(`activos_criticos/${firebaseKey}`).update(updates);

            alert(`¡Ficha de ${tag} actualizada y sincronizada con éxito!`);
            
            // Limpieza al cerrar el modal
            inputTag.disabled = false;
            inputTag.style.opacity = '1';
            inputTag.dataset.firebaseKey = '';
            document.getElementById('modal-nuevo-equipo').close();

        } catch (error) {
            console.error("Error al registrar equipo:", error);
            alert("Hubo un error al guardar el equipo en Firebase.");
        } finally {
            btnRegistrar.innerHTML = textoOriginal;
            btnRegistrar.disabled = false;
        }
    };
});