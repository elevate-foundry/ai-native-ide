import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "deepseek-coder"

def generate(prompt):
    r = requests.post(
        OLLAMA_URL,
        json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
        },
    )

    return r.json()["response"]
