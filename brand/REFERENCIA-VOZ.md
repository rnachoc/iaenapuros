# Voz de «Tú»

- **Referencia:** `brand/referencia-tu.wav` (16 s): hombre de 40-50 años, acento centro peninsular (Madrid, Toledo, Castilla-La Mancha).
- **Origen:** Mozilla Common Voice 16.1, español (mirror `xaviviro/common_voice_es_16_1_accent` en Hugging Face). Hablante anónimo `43889a1cea78…`: 7 frases leídas, unidas y normalizadas.
- **Licencia:** CC0 1.0. El hablante donó su voz para cualquier uso; no requiere atribución.
- **Síntesis:** Chatterbox, fine-tune de español de España (`ResembleAI/Chatterbox-Multilingual-es-es`, MIT), en local con GPU. Cada línea se genera hasta 3 veces y se queda la toma que Whisper entiende mejor.
- **Elegida** el 23/10/2026 entre 8 candidatas (voz 7).
- **Respaldo:** si falta la referencia o falla la GPU, se usa Edge `es-ES-AlvaroNeural`.
