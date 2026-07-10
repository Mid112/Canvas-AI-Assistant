import re


def extract_json_object(raw_llm_output: str) -> str:
    """Qwen3 and similar 'thinking' models wrap reasoning in <think>...</think>
    before the actual answer. Strip that block, then pull out the first
    balanced {...} object found in what remains.

    A regex like `\\{.*\\}` is greedy and spans from the first `{` to the
    *last* `}` anywhere in the remaining text — if the model appends anything
    after its JSON answer (trailing commentary, a stray repeated example, an
    imperfectly closed </think> leaving leftover braces in prose), that
    grabs the real JSON plus garbage concatenated after it, which then fails
    json.loads with "Extra data" rather than parsing cleanly. Scanning brace
    depth (while ignoring braces inside string literals) finds exactly the
    first complete object and ignores everything after it."""
    without_thinking = re.sub(
        r"<think>.*?</think>", "", raw_llm_output, flags=re.DOTALL
    )

    start = without_thinking.find("{")
    if start == -1:
        return without_thinking.strip()

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(without_thinking)):
        char = without_thinking[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return without_thinking[start : index + 1]

    return without_thinking[start:].strip()
