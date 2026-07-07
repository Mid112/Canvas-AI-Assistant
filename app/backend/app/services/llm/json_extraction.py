import re


def extract_json_object(raw_llm_output: str) -> str:
    """Qwen3 and similar 'thinking' models wrap reasoning in <think>...</think>
    before the actual answer. Strip that block, then pull out the first
    {...} object found in what remains."""
    without_thinking = re.sub(
        r"<think>.*?</think>", "", raw_llm_output, flags=re.DOTALL
    )
    match = re.search(r"\{.*\}", without_thinking, re.DOTALL)
    if match:
        return match.group(0)
    return without_thinking.strip()
