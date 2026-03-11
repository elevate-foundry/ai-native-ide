from llm import generate
from tools import TOOLS
import json
import re

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

def extract_json(response):
    # Try to find JSON inside code blocks first
    json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
    if json_match:
        return json_match.group(1)
    # Fallback to finding the first { and last }
    start = response.find('{')
    end = response.rfind('}')
    if start != -1 and end != -1:
        return response[start:end+1]
    return response

def run_agent(goal, max_iterations=10):

    context = ""
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        print(f"\n--- Iteration {iteration} ---\n")

        prompt = f"""
{SYSTEM_PROMPT}

Goal:
{goal}

Context:
{context}
"""

        response = generate(prompt)

        # print("\nMODEL RAW RESPONSE\n", response)

        try:
            json_str = extract_json(response)
            action = json.loads(json_str)
        except json.JSONDecodeError:
            print(f"Invalid JSON: {response}")
            context += f"\nSystem: Invalid JSON response in iteration {iteration}. Please output valid JSON."
            continue
        except Exception as e:
            print(f"Error parsing response: {e}")
            context += f"\nSystem: Error parsing response: {str(e)}"
            continue

        if action.get("done"):
            print("Goal complete.")
            print(f"Final Thought: {action.get('thought')}")
            return

        tool_name = action.get("tool")
        args = action.get("args", {})

        if not tool_name:
             context += "\nSystem: No tool specified in JSON."
             continue

        if tool_name not in TOOLS:
            context += f"\nSystem: Tool {tool_name} not found"
            continue
        
        print(f"Thought: {action.get('thought')}")
        print(f"Executing: {tool_name}({args})")

        try:
            result = TOOLS[tool_name](**args)
            print(f"Result: {str(result)[:100]}...") # Truncate for display
        except Exception as e:
            result = f"Error executing tool: {str(e)}"
            print(result)

        context += f"""
Thought: {action.get("thought")}
Tool: {tool_name}
Args: {args}
Result:
{result}
"""

    print("Max iterations reached.")
