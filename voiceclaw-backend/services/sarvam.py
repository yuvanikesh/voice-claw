import base64
import logging
import httpx
from config import settings

logger = logging.getLogger("sarvam_service")

class SarvamAPIError(Exception):
    def __init__(self, message: str, detail: str = ""):
        super().__init__(message)
        self.detail = detail

async def speech_to_text_translate(
    audio_bytes: bytes,
    audio_format: str = None,
    prompt: str = None,
) -> dict:
    """
    Translate speech audio to English text using Sarvam STT-Translate API.

    Args:
        audio_bytes: Raw audio bytes.
        audio_format: Audio codec format (wav, mp3, webm, etc.). Auto-detected if None.
        prompt: Optional context prompt to boost model accuracy (experimental).
    """
    if audio_format is None:
        audio_format = settings.DEFAULT_AUDIO_FORMAT
    url = f"{settings.SARVAM_BASE_URL}/speech-to-text-translate"
    headers = {
        "API-Subscription-Key": settings.SARVAM_API_KEY
    }
    files = {
        "file": (f"audio.{audio_format}", audio_bytes, f"audio/{audio_format}")
    }
    data = {
        "model": settings.SARVAM_STT_MODEL
    }
    if prompt:
        data["prompt"] = prompt
    
    try:
        async with httpx.AsyncClient(timeout=settings.SARVAM_API_TIMEOUT) as client:
            response = await client.post(url, headers=headers, files=files, data=data)
            if response.status_code != 200:
                raise SarvamAPIError(f"Sarvam STT API returned status {response.status_code}", response.text)
            
            result = response.json()
            return {
                "transcript": result.get("transcript", ""),
                "source_language_code": result.get("source_language_code", "")
            }
    except httpx.HTTPError as e:
        logger.error(f"HTTP error in speech_to_text_translate: {e}")
        raise SarvamAPIError("Network error calling Sarvam STT API", str(e))
    except Exception as e:
        logger.error(f"Unexpected error in speech_to_text_translate: {e}")
        raise SarvamAPIError("Unexpected error calling Sarvam STT API", str(e))


async def speech_to_text(
    audio_bytes: bytes,
    audio_format: str = None,
    language_code: str = "unknown",
    model: str = None,
) -> dict:
    """
    Transcribe speech audio using Sarvam STT API (same-language output).

    Args:
        audio_bytes: Raw audio bytes.
        audio_format: Audio codec format. Auto-detected if None.
        language_code: BCP-47 language code (e.g. hi-IN). 'unknown' for auto-detect.
        model: STT model to use. Default: saarika:v2.5. Options: saarika:v2.5, saaras:v3.
    """
    if audio_format is None:
        audio_format = settings.DEFAULT_AUDIO_FORMAT
    if model is None:
        model = settings.SARVAM_STT_MODEL

    url = f"{settings.SARVAM_BASE_URL}/speech-to-text"
    headers = {
        "API-Subscription-Key": settings.SARVAM_API_KEY
    }
    files = {
        "file": (f"audio.{audio_format}", audio_bytes, f"audio/{audio_format}")
    }
    data = {
        "model": model,
        "language_code": language_code,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.SARVAM_API_TIMEOUT) as client:
            response = await client.post(url, headers=headers, files=files, data=data)
            if response.status_code != 200:
                raise SarvamAPIError(f"Sarvam STT API returned status {response.status_code}", response.text)

            result = response.json()
            return {
                "transcript": result.get("transcript", ""),
                "language_code": result.get("language_code", language_code),
            }
    except httpx.HTTPError as e:
        logger.error(f"HTTP error in speech_to_text: {e}")
        raise SarvamAPIError("Network error calling Sarvam STT API", str(e))
    except Exception as e:
        logger.error(f"Unexpected error in speech_to_text: {e}")
        raise SarvamAPIError("Unexpected error calling Sarvam STT API", str(e))


async def text_to_speech(
    text: str,
    target_language_code: str,
    speaker: str = None,
    dict_id: str = None,
    pace: float = None,
    temperature: float = None,
    speech_sample_rate: int = None,
    enable_cached_responses: bool = None,
) -> bytes:
    """
    Convert text to speech audio using Sarvam TTS API.

    Args:
        text: Text to synthesize.
        target_language_code: BCP-47 code (e.g. hi-IN, en-IN).
        speaker: Voice ID (30+ available in v3). Default from config.
        dict_id: Pronunciation dictionary ID for custom word pronunciations (v3 only).
        pace: Speech speed (0.5–2.0). Default 1.0.
        temperature: Expressiveness (0.01–1.0). v3 only. Default 0.6.
        speech_sample_rate: Audio sample rate in Hz.
        enable_cached_responses: Cache identical requests (beta).
    """
    if speaker is None:
        speaker = settings.SARVAM_TTS_SPEAKER
    if pace is None:
        pace = settings.SARVAM_TTS_PACE
    if temperature is None:
        temperature = settings.SARVAM_TTS_TEMPERATURE

    url = f"{settings.SARVAM_BASE_URL}/text-to-speech"
    headers = {
        "API-Subscription-Key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "inputs": [text],
        "target_language_code": target_language_code,
        "speaker": speaker,
        "model": settings.SARVAM_TTS_MODEL,
        "enable_preprocessing": True,
        "pace": pace,
    }
    # v3-only parameters
    if settings.SARVAM_TTS_MODEL == "bulbul:v3":
        payload["temperature"] = temperature
    # Include pronunciation dictionary if provided (requires bulbul:v3)
    if dict_id:
        payload["dict_id"] = dict_id
    if speech_sample_rate:
        payload["speech_sample_rate"] = speech_sample_rate
    if enable_cached_responses is None:
        enable_cached_responses = settings.SARVAM_TTS_ENABLE_CACHE
    if enable_cached_responses:
        payload["enable_cached_responses"] = True
    
    try:
        async with httpx.AsyncClient(timeout=settings.SARVAM_API_TIMEOUT) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                raise SarvamAPIError(f"Sarvam TTS API returned status {response.status_code}", response.text)
            
            content_type = response.headers.get("content-type", "")
            if "application/json" in content_type:
                data = response.json()
                audio_base64 = data.get("audio_base64", "")
                if not audio_base64:
                    raise SarvamAPIError("Missing audio_base64 in JSON response", response.text)
                return base64.b64decode(audio_base64)
            else:
                return response.content
    except httpx.HTTPError as e:
        logger.error(f"HTTP error in text_to_speech: {e}")
        raise SarvamAPIError("Network error calling Sarvam TTS API", str(e))
    except Exception as e:
        logger.error(f"Unexpected error in text_to_speech: {e}")
        raise SarvamAPIError("Unexpected error calling Sarvam TTS API", str(e))


async def translate_text(
    text: str,
    source_language_code: str,
    target_language_code: str,
    speaker_gender: str = None,
    mode: str = None,
    numerals_format: str = None,
) -> str:
    """
    Translate text between languages using Sarvam Translate API.

    Args:
        text: Input text (max 1000 chars).
        source_language_code: Source language BCP-47 code, or 'auto'.
        target_language_code: Target language BCP-47 code.
        speaker_gender: 'Male' or 'Female' for gendered translations.
        mode: Translation style — 'formal', 'modern-colloquial', 'classic-colloquial', 'code-mixed'.
        numerals_format: 'international' or 'native' numeral style.
    """
    url = f"{settings.SARVAM_BASE_URL}/translate"
    headers = {
        "API-Subscription-Key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "input": text,
        "source_language_code": source_language_code,
        "target_language_code": target_language_code,
        "model": settings.SARVAM_TRANSLATE_MODEL,
    }
    # Optional params — only include if set
    gender = speaker_gender or settings.SARVAM_TRANSLATE_GENDER
    if gender:
        payload["speaker_gender"] = gender
    tmode = mode or settings.SARVAM_TRANSLATE_MODE
    if tmode:
        payload["mode"] = tmode
    nformat = numerals_format or settings.SARVAM_TRANSLATE_NUMERALS
    if nformat:
        payload["numerals_format"] = nformat
    
    try:
        async with httpx.AsyncClient(timeout=settings.SARVAM_API_TIMEOUT) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                raise SarvamAPIError(f"Sarvam Translate API returned status {response.status_code}", response.text)
            
            result = response.json()
            translated = result.get("translated_text", "")
            if not translated:
                translated = result.get("translatedText", "")
            if not translated and "outputs" in result:
                outputs = result["outputs"]
                if isinstance(outputs, list) and len(outputs) > 0:
                    translated = outputs[0]
            if not translated:
                translated = result.get("output", text)
            
            return translated
    except httpx.HTTPError as e:
        logger.error(f"HTTP error in translate_text: {e}")
        raise SarvamAPIError("Network error calling Sarvam Translate API", str(e))
    except Exception as e:
        logger.error(f"Unexpected error in translate_text: {e}")
        raise SarvamAPIError("Unexpected error calling Sarvam Translate API", str(e))


async def identify_language(text: str) -> str:
    """
    Identify the language of input text using Sarvam Language ID API.

    Args:
        text: Input text (max 1000 chars).

    Returns:
        BCP-47 language code (e.g. 'hi-IN', 'en-IN').
    """
    url = f"{settings.SARVAM_BASE_URL}/text-lid"
    headers = {
        "API-Subscription-Key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "input": text
    }
    
    try:
        async with httpx.AsyncClient(timeout=settings.SARVAM_LID_TIMEOUT) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                raise SarvamAPIError(f"Sarvam LID API returned status {response.status_code}", response.text)
            
            result = response.json()
            lang_code = result.get("language_code", "")
            if not lang_code and "languages" in result:
                langs = result["languages"]
                if isinstance(langs, list) and len(langs) > 0:
                    lang_code = langs[0].get("language_code", "")
            
            if not lang_code:
                lang_code = settings.DEFAULT_LANGUAGE_CODE
            
            return lang_code
    except httpx.HTTPError as e:
        logger.error(f"HTTP error in identify_language: {e}")
        raise SarvamAPIError("Network error calling Sarvam LID API", str(e))
    except Exception as e:
        logger.error(f"Unexpected error in identify_language: {e}")
        raise SarvamAPIError("Unexpected error calling Sarvam LID API", str(e))


async def transliterate_text(
    text: str,
    source_language_code: str,
    target_language_code: str,
    numerals_format: str = "international",
    spoken_form: bool = False,
) -> str:
    """
    Transliterate text between scripts using Sarvam Transliteration API.

    Args:
        text: Input text to transliterate.
        source_language_code: Source language code (or 'auto').
        target_language_code: Target language code.
        numerals_format: 'international' or 'native'.
        spoken_form: If True, converts to natural spoken form.

    Returns:
        Transliterated text string.
    """
    url = f"{settings.SARVAM_BASE_URL}/transliterate"
    headers = {
        "API-Subscription-Key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "input": text,
        "source_language_code": source_language_code,
        "target_language_code": target_language_code,
        "numerals_format": numerals_format,
        "spoken_form": spoken_form,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.SARVAM_API_TIMEOUT) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                raise SarvamAPIError(f"Sarvam Transliterate API returned status {response.status_code}", response.text)

            result = response.json()
            return result.get("transliterated_text", result.get("output", text))
    except httpx.HTTPError as e:
        logger.error(f"HTTP error in transliterate_text: {e}")
        raise SarvamAPIError("Network error calling Sarvam Transliterate API", str(e))
    except Exception as e:
        logger.error(f"Unexpected error in transliterate_text: {e}")
        raise SarvamAPIError("Unexpected error calling Sarvam Transliterate API", str(e))
