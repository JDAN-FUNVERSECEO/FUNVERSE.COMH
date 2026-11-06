# FUNVERSE local

FUNVERSE es una web local con tres juegos, una biblioteca de videos y FUNSISTANT. No necesita una clave de API, Ollama ni pagos por mensaje.

## Abrir la página

1. Abre `start-funverse.bat` con doble clic. Si ya está abierto, te lleva a la página existente.
2. Mantén abierta la ventana **FUNVERSE - servidor local**.
3. Usa `http://127.0.0.1:3000` en el navegador. No abras `index.html` como archivo. La vista previa local de VS Code también puede conectar al puente si usa `localhost` o `127.0.0.1`.
4. Para revisar la conexión, abre `http://127.0.0.1:3000/api/status`. Debe mostrar `"modelReady": true` cuando `fun.1.0` termine de cargar.

`start-funverse.bat` solo inicia Node.js y abre la web. El puente vive en `server.js`: la página llama `/api/funsistant`, y el servidor reenvía el mensaje a `http://127.0.0.1:9931/v1/chat/completions`. Ese puerto solo escucha en esta computadora. El modelo está en `assets/funsistant-qwen3-4b.gguf`; llama.cpp lo carga con Vulkan en la Intel HD Graphics 520.

FUNSISTANT usa el modelo local `fun.1.0` basado en Qwen3 4B. La plantilla de Qwen para modo sin pensamiento interno está en `assets/qwen3-nonthinking.jinja`; evita mostrar borradores internos en el chat. La personalidad y los datos propios de FUNVERSE se ajustan en `funsistant-personality.md`. Eso configura su estilo, no vuelve a entrenar los pesos del modelo. FUNSISTANT no consulta internet en vivo ni guarda el historial del chat en disco.

## Juegos y videos

- Jenga cósmico usa Matter.js para las físicas.
- Gato Galáctico se juega contra FUNSISTANT, que usa minimax para tomar decisiones.
- Bloques estelares tiene un tablero 8×8, piezas, despeje de líneas, puntos y récord local.
- El primer acceso a **Entrar** permite crear la cuenta propietaria. Elige una contraseña nueva de 12 caracteres o más; FUNVERSE guarda un hash protegido con scrypt en `.data/owner.json`.
- Solo la cuenta propietaria puede subir o quitar videos. Los videos MP4, WebM y MOV (hasta 300 MB cada uno) se guardan en `.data/videos/` en esta computadora.

No publiques el servidor local en internet. Para iniciar la web, usa el archivo `.bat` o ejecuta `npm start` desde esta carpeta.

La plantilla sin pensamiento interno sigue la guía oficial de Qwen3: https://github.com/QwenLM/Qwen3/blob/main/docs/source/run_locally/llama.cpp.md
