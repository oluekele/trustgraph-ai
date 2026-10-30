import math
from typing import Any

from simpleeval import simple_eval

from ai_agent.tools.sandbox import Sandbox

# simpleeval evaluates arithmetic without exposing Python builtins.
FUNCTIONS = {
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "exp": math.exp,
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
}
NAMES = {"pi": math.pi, "e": math.e}


def calculator(sandbox: Sandbox, arguments: dict[str, Any], restrictions: dict[str, Any]) -> dict:
    expression = str(arguments.get("expression", "")).strip()
    if not expression:
        raise ValueError("Expression cannot be empty.")
    if len(expression) > 200:
        raise ValueError("Expression is too long.")
    result = simple_eval(expression, functions=FUNCTIONS, names=NAMES)
    if not isinstance(result, (int, float)):
        raise ValueError("Expression must evaluate to a number.")
    return {"expression": expression, "result": result}
