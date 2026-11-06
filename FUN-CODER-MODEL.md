# FUN-CODER 3.8 ASTRA — modelo local

FUN-CODER usa un archivo de pesos separado del modelo principal de FUNSISTANT.

- Archivo local: `qwen2.5-coder-0.5b-instruct-q4_k_m.gguf`
- Modelo de origen: Qwen2.5-Coder-0.5B-Instruct, formato GGUF Q4_K_M
- Repositorio oficial: https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF
- Licencia indicada por el repositorio: Apache-2.0
- Tamaño esperado: 491,400,064 bytes
- Servidor local de FUN-CODER: `127.0.0.1:9932`; FUNSISTANT conserva su servidor y sus pesos actuales.

El archivo GGUF se mantiene local y está excluido de Git por `assets/*.gguf`. El nombre FUN-CODER 3.8 ASTRA identifica la integración del proyecto; estos pesos no fueron entrenados desde cero por FUNVERSE.