from ai_agent.providers.openai_provider import OpenAICompatiblePlanner

XAI_BASE_URL = "https://api.x.ai/v1"


def GrokPlanner(api_key: str, model: str) -> OpenAICompatiblePlanner:
    """xAI exposes an OpenAI-compatible API."""
    return OpenAICompatiblePlanner(api_key=api_key, model=model, base_url=XAI_BASE_URL, label="grok")


# Name kept from the original prototype.
GrokProvider = GrokPlanner
