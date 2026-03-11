from llm import generate
from tools import TOOLS
import json

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

def run_agent(goal):

    context = ""

    while True:

        prompt = f"""
{SYSTEM_PROMPT}

Goal:
{goal}

Context:
{context}
"""

        response = generate(prompt)

        print("\nMODEL RAW RESPONSE\n", response)

        try:
            action = json.loads(response)
        except:
            context += "\nInvalid JSON response"
            continue

        if action.get("done"):
            print("Goal complete.")
            return

        tool_name = action["tool"]
        args = action.get("args", {})

        if tool_name not in TOOLS:
            context += f"\nTool {tool_name} not found"
            continue

        result = TOOLS[tool_name](**args)

        context += f"""
Thought: {action["thought"]}
Tool: {tool_name}
Result:
{result}
"""
