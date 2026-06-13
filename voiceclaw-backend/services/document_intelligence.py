import io
import logging
import httpx
from config import settings

logger = logging.getLogger("document_intelligence")

# Flexible import for PDF extraction fallback
try:
    import pypdf as pdf_lib
except ImportError:
    try:
        import PyPDF2 as pdf_lib
    except ImportError:
        pdf_lib = None

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    chunks = []
    if not text:
        return chunks
    start = 0
    text_len = len(text)
    while start < text_len:
        end = start + chunk_size
        chunks.append(text[start:end].strip())
        # Prevent infinite loops if overlap >= chunk_size
        step = chunk_size - overlap
        if step <= 0:
            step = chunk_size
        start += step
    return [c for c in chunks if c]

async def extract_pdf(file_bytes: bytes, filename: str) -> list[str]:
    url = "https://api.sarvam.ai/document-intelligence/extract"
    headers = {
        "API-Subscription-Key": settings.SARVAM_API_KEY
    }
    files = {
        "file": (filename, file_bytes, "application/pdf")
    }

    try:
        logger.info(f"Attempting to call Sarvam Document Intelligence for {filename}")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, files=files)
            if response.status_code == 200:
                result = response.json()
                # Try to extract chunks from response
                # Common formats: {"chunks": [...]}, {"pages": [{"content": ...}]} or {"text": ...}
                if isinstance(result, list):
                    return result
                if "chunks" in result and isinstance(result["chunks"], list):
                    return result["chunks"]
                elif "pages" in result and isinstance(result["pages"], list):
                    chunks = []
                    for page in result["pages"]:
                        content = page.get("content", "")
                        if content:
                            chunks.extend(chunk_text(content))
                    return chunks
                elif "text" in result and isinstance(result["text"], str):
                    return chunk_text(result["text"])
                else:
                    raise Exception("Unexpected response schema from Sarvam Document Intelligence")
            else:
                raise Exception(f"API status code {response.status_code}: {response.text}")
    except Exception as e:
        logger.warning(f"Sarvam Document Intelligence failed for {filename}. Error: {e}. Falling back to PyPDF2.")
        
        # Local fallback using pypdf/PyPDF2
        if pdf_lib is None:
            logger.error("No PDF library (pypdf/PyPDF2) is installed. Cannot perform fallback extraction.")
            return []
            
        try:
            reader = pdf_lib.PdfReader(io.BytesIO(file_bytes))
            full_text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    full_text += page_text + "\n"
            
            return chunk_text(full_text)
        except Exception as fallback_err:
            logger.error(f"Fallback PDF extraction failed for {filename}: {fallback_err}")
            return []
