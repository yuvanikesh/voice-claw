import asyncio
import logging
from firecrawl import FirecrawlApp
from config import settings

logger = logging.getLogger("firecrawl_service")

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    chunks = []
    if not text:
        return chunks
    start = 0
    text_len = len(text)
    while start < text_len:
        end = start + chunk_size
        chunks.append(text[start:end].strip())
        step = chunk_size - overlap
        if step <= 0:
            step = chunk_size
        start += step
    return [c for c in chunks if c]

def sync_scrape(api_key: str, url: str) -> str:
    app = FirecrawlApp(api_key=api_key)
    response = app.scrape_url(url, params={"formats": ["markdown"]})
    
    markdown_content = ""
    if response:
        if isinstance(response, dict):
            markdown_content = response.get("markdown", "") or response.get("data", {}).get("markdown", "")
        else:
            # In case the response is an object with attributes
            markdown_content = getattr(response, "markdown", "") or getattr(getattr(response, "data", None), "markdown", "")
            
    return markdown_content or ""

async def scrape_url(url: str) -> list[str]:
    api_key = settings.FIRECRAWL_API_KEY
    if not api_key:
        logger.error("FIRECRAWL_API_KEY is not set. Scrape will return empty results.")
        return []

    try:
        loop = asyncio.get_event_loop()
        # Run firecrawl-py blocking call in an executor thread
        markdown_content = await loop.run_in_executor(
            None, sync_scrape, api_key, url
        )
        return chunk_text(markdown_content)
    except Exception as e:
        logger.error(f"Firecrawl URL scraping failed for {url}: {e}")
        return []
