// src/js/firebase/storage.js

/**
 * Sube una imagen a Firebase Storage y devuelve su URL pública.
 * @param {File} archivoImagen - El archivo de la foto seleccionada.
 * @param {string} ruta - Carpeta de destino (ej: 'placas', 'alertas').
 * @returns {Promise<string>} - La URL segura de la foto.
 */
export async function subirImagen(archivoImagen, ruta = 'general') {
    return new Promise((resolve, reject) => {
        if (!archivoImagen) {
            reject("No se seleccionó ningún archivo.");
            return;
        }

        // Generamos un nombre único para que no se sobreescriban fotos del mismo equipo
        const extension = archivoImagen.name.split('.').pop();
        const nombreUnico = `${ruta}_${Date.now()}.${extension}`;
        
        // Creamos la referencia en el disco duro de Firebase
        const storageRef = firebase.storage().ref(`cio_moncon/${ruta}/${nombreUnico}`);
        
        // Iniciamos la subida
        const tareaSubida = storageRef.put(archivoImagen);

        tareaSubida.on('state_changed', 
            (snapshot) => {
                // Aquí en el futuro podemos poner una barra de progreso de subida
                const progreso = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log(`Subiendo foto... ${Math.round(progreso)}%`);
            }, 
            (error) => {
                console.error("Error al subir la imagen:", error);
                reject(error);
            }, 
            async () => {
                // Subida exitosa: Obtenemos el link (URL) para mostrarla en el HTML
                const urlFotografia = await tareaSubida.snapshot.ref.getDownloadURL();
                console.log("📸 Imagen guardada con éxito:", urlFotografia);
                resolve(urlFotografia);
            }
        );
    });
}