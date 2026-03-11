import json
from llm import generate
from tools import TOOLS

SYSTEM_PROMPT = """
You are an autonomous software engineer.

You can use tools.

Respond ONLY in JSON.

Format:

{
 "thought": "...",
 "tool": "tool_name",
 "args": {...}
}

If finished:

{
 "thought": "...",
 "done": true
}
"""

MAX_STEPS = 25


def format_tool_list():
    return "\n".join(f"- {name}" for name in TOOLS)


def format_observation(step, thought, tool_name, args, result=None, error=None):
    observation = [
        f"Step: {step}",
        f"Thought: {thought}",
        f"Tool: {tool_name}",
        f"Args: {json.dumps(args)}",
    ]

    if error is not None:
        observation.extend(
            [
                "Observation:",
                f"Tool execution failed: {error}",
            ]
        )
    else:
        observation.extend(
            [
                "Observation:",
                str(result),
            ]
        )

    return "\n".join(observation)


def run_agent(goal):
    context = ""
    step = 1

    while step <= MAX_STEPS:

        prompt = f"""
{SYSTEM_PROMPT}

Goal:
{goal}

Available tools:
{format_tool_list()}

Context:
{context}
"""

        response = generate(prompt)

        print("\nMODEL RAW RESPONSE\n", response)

        try:
            action = json.loads(response)
        except json.JSONDecodeError as error:
            context += f"\nStep: {step}\nObservation:\nInvalid JSON response: {error}"
            step += 1
            continue

        if action.get("done"):
            print("Goal complete.")
            return

        thought = action.get("thought", "")
        tool_name = action.get("tool")
        args = action.get("args", {})

        if not tool_name:
            context += f"\nStep: {step}\nObservation:\nNo tool selected."
            step += 1
            continue

        if not isinstance(args, dict):
            context += (
                f"\nStep: {step}\nThought: {thought}\nTool: {tool_name}\nObservation:\n"
                "Action args must be a JSON object."
            )
            step += 1
            continue

        if tool_name not in TOOLS:
            context += (
                f"\nStep: {step}\nThought: {thought}\nTool: {tool_name}\nObservation:\n"
                f"Tool {tool_name} not found."
            )
            step += 1
            continue

        try:
            result = TOOLS[tool_name](**args)
            context += "\n" + format_observation(step, thought, tool_name, args, result=result)
        except Exception as error:
            context += "\n" + format_observation(step, thought, tool_name, args, error=error)

        step += 1

    print("Stopped: maximum step limit reached.")
