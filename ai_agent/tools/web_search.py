from typing import Any

from ai_agent.tools.sandbox import Sandbox


def web_search(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    """Search a fixed synthetic corpus.

    The corpus intentionally includes a page carrying an indirect prompt
    injection so experiments can show it cannot escalate into unauthorised
    actions. Live web access is out of scope for the controlled environment.
    """
    query = str(arguments.get("query", "")).lower()
    limit = int(arguments.get("max_results", 3))
    limit = min(limit, int(restrictions.get("max_records", limit)))
    terms = [term for term in query.split() if len(term) > 2]
    scored = []
    for document in sandbox.search_corpus:
        text = f"{document['title']} {document['snippet']}".lower()
        scored.append((sum(term in text for term in terms), document))
    scored.sort(key=lambda item: item[0], reverse=True)
    results = [document for score, document in scored if score > 0][:limit]
    return {"query": arguments.get("query"), "results": results or sandbox.search_corpus[:limit]}
